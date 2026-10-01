import type {
  GitSyncConfirmation,
  GitSyncResult,
  GitSyncStrategy,
  GitTrackingComparison,
} from '@dev-dashboard/contracts';

import { computeProjectChangeImpact } from './project-change-impact-service.js';

import {
  CONFIRMATION_TTL_MS,
  CONFLICT_PATTERN,
  FAST_FORWARD_PATTERN,
  MAIN_BRANCH,
  MAIN_STRATEGY,
  ORIGIN_MAIN_REFERENCE,
  UPSTREAM_MAIN_REFERENCE,
} from './git-sync/constants.js';
import { GitSyncError } from './git-sync/errors.js';
import {
  abortOperation,
  hasRemote,
  optionalReferenceHead,
  requireCleanWorkingTree,
  requireLocalMain,
  requireRemote,
  requireRemoteReference,
  requireRepository,
} from './git-sync/repository-guards.js';
import { failureText, runGit } from './git-sync/run.js';
import { validateReference, validateStrategy } from './git-sync/validation.js';
import {
  GitMutationConfirmationError,
  GitMutationConfirmationService,
} from './git-mutation-confirmation-service.js';
import type { GitSyncProgressReporter } from './git-sync-progress-service.js';

export { GitSyncError } from './git-sync/errors.js';
export type { GitSyncErrorCode } from './git-sync/errors.js';

/** Identificadores do catálogo (`git-mutation-catalog.ts`) usados pelas duas confirmações deste serviço. */
type GitSyncOperationId = 'sync-integrate' | 'sync-main';

type MainSyncSource = {
  remote: 'origin' | 'upstream';
  reference: string;
};

const MAIN_SYNC_CONFIRMATION_TARGET = `${MAIN_BRANCH}::${MAIN_STRATEGY}`;

function syncTarget(reference: string, strategy: GitSyncStrategy): string {
  return `${reference}::${strategy}`;
}

async function resolvePreparedMainSyncSource(
  projectPath: string,
): Promise<MainSyncSource> {
  await requireRemote(projectPath, 'origin');

  if (
    (await hasRemote(projectPath, 'upstream')) &&
    (await optionalReferenceHead(projectPath, UPSTREAM_MAIN_REFERENCE))
  ) {
    return {
      remote: 'upstream',
      reference: UPSTREAM_MAIN_REFERENCE,
    };
  }

  return {
    remote: 'origin',
    reference: ORIGIN_MAIN_REFERENCE,
  };
}

function report(
  reporter: GitSyncProgressReporter | undefined,
  event: Parameters<GitSyncProgressReporter>[0],
): void {
  reporter?.(event);
}

async function resolveMainSyncSource(
  projectPath: string,
  reporter?: GitSyncProgressReporter,
): Promise<MainSyncSource> {
  await requireRemote(projectPath, 'origin');

  if (await hasRemote(projectPath, 'upstream')) {
    report(reporter, {
      stepId: 'fetch-upstream',
      status: 'running',
      command: 'git fetch --prune upstream',
      message: 'Buscando atualizações do repositório principal.',
    });

    try {
      await runGit(projectPath, ['fetch', '--prune', 'upstream']);
      report(reporter, {
        stepId: 'fetch-upstream',
        status: 'success',
        command: 'git fetch --prune upstream',
        message: 'Referências do repositório principal atualizadas.',
      });
    } catch {
      report(reporter, {
        stepId: 'fetch-upstream',
        status: 'error',
        command: 'git fetch --prune upstream',
        message: 'Não foi possível atualizar o repositório principal.',
      });
      throw new GitSyncError(
        'GIT_SYNC_FAILED',
        'Não foi possível buscar atualizações do repositório principal.',
      );
    }

    if (await optionalReferenceHead(projectPath, UPSTREAM_MAIN_REFERENCE)) {
      return {
        remote: 'upstream',
        reference: UPSTREAM_MAIN_REFERENCE,
      };
    }

    report(reporter, {
      stepId: 'source-fallback',
      status: 'info',
      message:
        'A origem principal não possui main; usando origin/main como referência.',
    });
  }

  report(reporter, {
    stepId: 'fetch-origin',
    status: 'running',
    command: 'git fetch --prune origin',
    message: 'Buscando atualizações de origin.',
  });

  try {
    await runGit(projectPath, ['fetch', '--prune', 'origin']);
    report(reporter, {
      stepId: 'fetch-origin',
      status: 'success',
      command: 'git fetch --prune origin',
      message: 'Referências de origin atualizadas.',
    });
  } catch {
    report(reporter, {
      stepId: 'fetch-origin',
      status: 'error',
      command: 'git fetch --prune origin',
      message: 'Não foi possível atualizar origin.',
    });
    throw new GitSyncError(
      'GIT_SYNC_FAILED',
      'Não foi possível buscar atualizações de origin.',
    );
  }

  await requireRemoteReference(projectPath, ORIGIN_MAIN_REFERENCE);
  return {
    remote: 'origin',
    reference: ORIGIN_MAIN_REFERENCE,
  };
}

async function restoreBranch(
  projectPath: string,
  branch: string,
  reporter?: GitSyncProgressReporter,
): Promise<void> {
  if (!branch || branch === MAIN_BRANCH) return;

  const command = `git checkout ${branch}`;
  report(reporter, {
    stepId: 'restore-branch',
    status: 'running',
    command,
    message: `Retornando para ${branch}.`,
  });

  try {
    await runGit(projectPath, ['checkout', branch]);
    report(reporter, {
      stepId: 'restore-branch',
      status: 'success',
      command,
      message: `Branch ${branch} restaurada.`,
    });
  } catch {
    report(reporter, {
      stepId: 'restore-branch',
      status: 'error',
      command,
      message: `Não foi possível retornar para ${branch}.`,
    });
    throw new GitSyncError(
      'GIT_SYNC_FAILED',
      `A main foi processada, mas não foi possível retornar para a branch "${branch}".`,
    );
  }
}

export class GitSyncService {
  /**
   * Mecanismo compartilhado de confirmação (`git-mutation-confirmation-service.ts`),
   * no lugar do `Map` privado que este serviço mantinha — mesma TTL e mesmo
   * comportamento externo (`GIT_SYNC_CONFIRMATION_REQUIRED`). `sync-integrate`
   * e `sync-main` são operações distintas no catálogo mesmo quando
   * reference/strategy coincidem com os valores fixos da main.
   */
  private readonly confirmations = new GitMutationConfirmationService(
    CONFIRMATION_TTL_MS,
  );

  public prepareConfirmation(
    projectId: string,
    reference: string,
    strategy: GitSyncStrategy,
  ): GitSyncConfirmation {
    validateReference(reference);
    validateStrategy(strategy);

    const { token, expiresAt } = this.confirmations.prepare(
      projectId,
      'sync-integrate' satisfies GitSyncOperationId,
      syncTarget(reference, strategy),
    );

    return { token, reference, strategy, expiresAt };
  }

  public async prepareMainConfirmation(
    projectPath: string,
    projectId: string,
  ): Promise<GitSyncConfirmation> {
    await requireRepository(projectPath);
    const source = await resolvePreparedMainSyncSource(projectPath);
    const { token, expiresAt } = this.confirmations.prepare(
      projectId,
      'sync-main' satisfies GitSyncOperationId,
      MAIN_SYNC_CONFIRMATION_TARGET,
    );

    return {
      token,
      reference: source.reference,
      strategy: MAIN_STRATEGY,
      expiresAt,
    };
  }

  public async compare(
    projectPath: string,
    reference: string,
  ): Promise<GitTrackingComparison> {
    validateReference(reference);
    await requireRepository(projectPath);
    await requireRemoteReference(projectPath, reference);

    const output = await runGit(projectPath, [
      'rev-list',
      '--left-right',
      '--count',
      `HEAD...${reference}`,
    ]);
    const [aheadRaw = '0', behindRaw = '0'] = output.split(/\s+/);

    return {
      reference,
      ahead: Number.parseInt(aheadRaw, 10) || 0,
      behind: Number.parseInt(behindRaw, 10) || 0,
    };
  }

  public async integrate(
    projectPath: string,
    projectId: string,
    reference: string,
    strategy: GitSyncStrategy,
    confirmationToken?: string,
  ): Promise<GitSyncResult> {
    validateReference(reference);
    validateStrategy(strategy);
    await requireRepository(projectPath);
    this.consumeConfirmation(
      projectId,
      'sync-integrate',
      syncTarget(reference, strategy),
      confirmationToken,
    );
    await requireRemoteReference(projectPath, reference);
    await requireCleanWorkingTree(projectPath);

    const branch = await runGit(projectPath, ['branch', '--show-current']);
    if (!branch) {
      throw new GitSyncError(
        'GIT_DETACHED_HEAD',
        'Não é possível sincronizar um HEAD destacado.',
      );
    }
    const previousHead = await runGit(projectPath, ['rev-parse', 'HEAD']);

    try {
      if (strategy === 'ff-only') {
        await runGit(projectPath, ['merge', '--ff-only', reference]);
      } else if (strategy === 'rebase') {
        await runGit(projectPath, ['rebase', reference]);
      } else {
        await runGit(projectPath, ['merge', '--no-edit', reference]);
      }
    } catch (error) {
      const details = failureText(error);
      await abortOperation(projectPath, strategy);

      if (strategy === 'ff-only' && FAST_FORWARD_PATTERN.test(details)) {
        throw new GitSyncError(
          'GIT_SYNC_DIVERGED',
          'A branch divergiu da referência selecionada. Use rebase ou merge.',
        );
      }
      if (CONFLICT_PATTERN.test(details)) {
        throw new GitSyncError(
          'GIT_SYNC_CONFLICT',
          'A integração encontrou conflitos e foi abortada automaticamente. O repositório voltou ao estado anterior.',
        );
      }
      throw new GitSyncError(
        'GIT_SYNC_FAILED',
        details || 'Não foi possível integrar a referência remota.',
      );
    }

    const currentHead = await runGit(projectPath, ['rev-parse', 'HEAD']);
    return {
      branch,
      reference,
      strategy,
      changed: currentHead !== previousHead,
      previousHead,
      currentHead,
      impact: await computeProjectChangeImpact(
        projectPath,
        previousHead,
        currentHead,
      ),
    };
  }

  public async synchronizeMain(
    projectPath: string,
    projectId: string,
    confirmationToken?: string,
    reporter?: GitSyncProgressReporter,
  ): Promise<GitSyncResult> {
    await requireRepository(projectPath);
    this.consumeConfirmation(
      projectId,
      'sync-main',
      MAIN_SYNC_CONFIRMATION_TARGET,
      confirmationToken,
    );
    await requireCleanWorkingTree(projectPath);
    await requireLocalMain(projectPath);

    const originalBranch = await runGit(projectPath, [
      'branch',
      '--show-current',
    ]);
    const previousHead = await runGit(projectPath, ['rev-parse', MAIN_BRANCH]);
    const previousOriginHead = await optionalReferenceHead(
      projectPath,
      ORIGIN_MAIN_REFERENCE,
    );
    const source = await resolveMainSyncSource(projectPath, reporter);

    report(reporter, {
      stepId: 'checkout-main',
      status: 'running',
      command: 'git checkout main',
      message: 'Selecionando a main.',
    });
    try {
      await runGit(projectPath, ['checkout', MAIN_BRANCH]);
      report(reporter, {
        stepId: 'checkout-main',
        status: 'success',
        command: 'git checkout main',
        message: 'main selecionada.',
      });
    } catch {
      report(reporter, {
        stepId: 'checkout-main',
        status: 'error',
        command: 'git checkout main',
        message: 'Não foi possível selecionar a main.',
      });
      throw new GitSyncError(
        'GIT_SYNC_FAILED',
        'Não foi possível selecionar a branch main.',
      );
    }

    const mergeCommand = `git merge --no-edit ${source.reference}`;
    report(reporter, {
      stepId: 'merge-main',
      status: 'running',
      command: mergeCommand,
      message: 'Integrando a referência principal na main.',
    });
    try {
      await runGit(projectPath, ['merge', '--no-edit', source.reference]);
      report(reporter, {
        stepId: 'merge-main',
        status: 'success',
        command: mergeCommand,
        message: 'main atualizada.',
      });
    } catch (error) {
      const details = failureText(error);
      report(reporter, {
        stepId: 'merge-main',
        status: 'error',
        command: mergeCommand,
        message: 'A integração da main falhou.',
      });

      if (CONFLICT_PATTERN.test(details)) {
        report(reporter, {
          stepId: 'abort-merge',
          status: 'running',
          command: 'git merge --abort',
          message: 'Abortando merge com conflito.',
        });
        try {
          await runGit(projectPath, ['merge', '--abort']);
          report(reporter, {
            stepId: 'abort-merge',
            status: 'success',
            command: 'git merge --abort',
            message: 'Merge abortado; main restaurada.',
          });
        } catch {
          report(reporter, {
            stepId: 'abort-merge',
            status: 'warning',
            command: 'git merge --abort',
            message: 'O Git não confirmou o abort do merge.',
          });
        }

        try {
          await restoreBranch(projectPath, originalBranch, reporter);
        } catch {
          // Preserva o erro primário da integração.
        }
        throw new GitSyncError(
          'GIT_SYNC_CONFLICT',
          'A integração encontrou conflitos e foi abortada automaticamente. A main voltou ao estado anterior.',
        );
      }

      try {
        await restoreBranch(projectPath, originalBranch, reporter);
      } catch {
        // Preserva o erro primário da integração.
      }
      throw new GitSyncError(
        'GIT_SYNC_FAILED',
        `Não foi possível integrar ${source.reference} na main.`,
      );
    }

    const pushCommand = 'git push origin main:main';
    report(reporter, {
      stepId: 'push-origin',
      status: 'running',
      command: pushCommand,
      message: 'Publicando main em origin/main.',
    });
    try {
      await runGit(projectPath, [
        'push',
        'origin',
        `${MAIN_BRANCH}:${MAIN_BRANCH}`,
      ]);
      report(reporter, {
        stepId: 'push-origin',
        status: 'success',
        command: pushCommand,
        message: 'origin/main publicada.',
      });
    } catch {
      report(reporter, {
        stepId: 'push-origin',
        status: 'error',
        command: pushCommand,
        message:
          'A main local foi atualizada, mas a publicação em origin falhou.',
      });
      try {
        await restoreBranch(projectPath, originalBranch, reporter);
      } catch {
        // Preserva o erro de publicação como causa principal.
      }
      throw new GitSyncError(
        'GIT_SYNC_FAILED',
        'A main foi atualizada localmente, mas não foi possível publicá-la em origin/main.',
      );
    }

    const currentHead = await runGit(projectPath, ['rev-parse', MAIN_BRANCH]);
    const impact = await computeProjectChangeImpact(
      projectPath,
      previousHead,
      currentHead,
    );

    await restoreBranch(projectPath, originalBranch, reporter);

    return {
      branch: MAIN_BRANCH,
      reference: source.reference,
      strategy: MAIN_STRATEGY,
      changed:
        currentHead !== previousHead || previousOriginHead !== currentHead,
      previousHead,
      currentHead,
      impact,
    };
  }

  private consumeConfirmation(
    projectId: string,
    operationId: GitSyncOperationId,
    target: string,
    token: string | undefined,
  ): void {
    try {
      this.confirmations.consume(projectId, operationId, target, token);
    } catch (error) {
      if (error instanceof GitMutationConfirmationError) {
        throw new GitSyncError(
          'GIT_SYNC_CONFIRMATION_REQUIRED',
          'Confirmação obrigatória para sincronizar a branch.',
        );
      }
      throw error;
    }
  }
}
