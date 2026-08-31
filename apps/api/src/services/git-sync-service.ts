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
  currentBranch,
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

export { GitSyncError } from './git-sync/errors.js';
export type { GitSyncErrorCode } from './git-sync/errors.js';

/** Identificadores do catálogo (`git-mutation-catalog.ts`) usados pelas duas confirmações deste serviço. */
type GitSyncOperationId = 'sync-integrate' | 'sync-main';

type MainSyncSource = {
  remote: 'origin' | 'upstream';
  reference: string;
};

function syncTarget(reference: string, strategy: GitSyncStrategy): string {
  return `${reference}::${strategy}`;
}

async function resolveMainSyncSource(
  projectPath: string,
): Promise<MainSyncSource> {
  await requireRemote(projectPath, 'origin');

  if (await hasRemote(projectPath, 'upstream')) {
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

export class GitSyncService {
  /**
   * Mecanismo compartilhado de confirmação (`git-mutation-confirmation-service.ts`),
   * no lugar do `Map` privado que este serviço mantinha — mesma TTL e mesmo
   * comportamento externo (`GIT_SYNC_CONFIRMATION_REQUIRED`). `sync-integrate`
   * e `sync-main` são operações distintas no catálogo mesmo quando
   * reference/strategy coincidem com os valores fixos da main, então um
   * token preparado por uma nunca é aceito pela outra — igual ao
   * comportamento anterior, em que os dois fluxos nunca compartilhavam
   * confirmação na prática (rotas e chamadas diferentes).
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
    const source = await resolveMainSyncSource(projectPath);
    const { token, expiresAt } = this.confirmations.prepare(
      projectId,
      'sync-main' satisfies GitSyncOperationId,
      syncTarget(source.reference, MAIN_STRATEGY),
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

    const branch = await currentBranch(projectPath);
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
  ): Promise<GitSyncResult> {
    await requireRepository(projectPath);
    const source = await resolveMainSyncSource(projectPath);
    this.consumeConfirmation(
      projectId,
      'sync-main',
      syncTarget(source.reference, MAIN_STRATEGY),
      confirmationToken,
    );
    await requireCleanWorkingTree(projectPath);
    await requireLocalMain(projectPath);

    const previousHead = await runGit(projectPath, ['rev-parse', MAIN_BRANCH]);
    const previousOriginHead = await optionalReferenceHead(
      projectPath,
      ORIGIN_MAIN_REFERENCE,
    );

    try {
      await runGit(projectPath, ['fetch', '--prune', source.remote]);
    } catch {
      throw new GitSyncError(
        'GIT_SYNC_FAILED',
        `Não foi possível buscar atualizações de ${source.remote}.`,
      );
    }

    await requireRemoteReference(projectPath, source.reference);
    await runGit(projectPath, ['checkout', MAIN_BRANCH]);

    try {
      await runGit(projectPath, ['merge', '--no-edit', source.reference]);
    } catch (error) {
      const details = failureText(error);
      await abortOperation(projectPath, MAIN_STRATEGY);

      if (CONFLICT_PATTERN.test(details)) {
        throw new GitSyncError(
          'GIT_SYNC_CONFLICT',
          'A integração encontrou conflitos e foi abortada automaticamente. A main voltou ao estado anterior.',
        );
      }
      throw new GitSyncError(
        'GIT_SYNC_FAILED',
        `Não foi possível integrar ${source.reference} na main.`,
      );
    }

    try {
      await runGit(projectPath, [
        'push',
        'origin',
        `${MAIN_BRANCH}:${MAIN_BRANCH}`,
      ]);
    } catch {
      throw new GitSyncError(
        'GIT_SYNC_FAILED',
        'A main foi atualizada localmente, mas não foi possível publicá-la em origin/main.',
      );
    }

    const currentHead = await runGit(projectPath, ['rev-parse', 'HEAD']);
    return {
      branch: MAIN_BRANCH,
      reference: source.reference,
      strategy: MAIN_STRATEGY,
      changed:
        currentHead !== previousHead || previousOriginHead !== currentHead,
      previousHead,
      currentHead,
      impact: await computeProjectChangeImpact(
        projectPath,
        previousHead,
        currentHead,
      ),
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
