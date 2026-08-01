import { randomBytes } from 'node:crypto';

import type {
  GitSyncConfirmation,
  GitSyncResult,
  GitSyncStrategy,
  GitTrackingComparison,
} from '@dev-dashboard/contracts';

import {
  CONFIRMATION_TTL_MS,
  CONFLICT_PATTERN,
  FAST_FORWARD_PATTERN,
  MAIN_BRANCH,
  MAIN_REFERENCE,
  MAIN_STRATEGY,
} from './git-sync/constants.js';
import { GitSyncError } from './git-sync/errors.js';
import {
  abortOperation,
  currentBranch,
  optionalReferenceHead,
  requireCleanWorkingTree,
  requireLocalMain,
  requireRemote,
  requireRemoteReference,
  requireRepository,
} from './git-sync/repository-guards.js';
import { failureText, runGit } from './git-sync/run.js';
import { validateReference, validateStrategy } from './git-sync/validation.js';

export { GitSyncError } from './git-sync/errors.js';
export type { GitSyncErrorCode } from './git-sync/errors.js';

interface StoredConfirmation {
  token: string;
  projectId: string;
  reference: string;
  strategy: GitSyncStrategy;
  expiresAt: number;
}

export class GitSyncService {
  private readonly confirmations = new Map<string, StoredConfirmation>();

  public prepareConfirmation(
    projectId: string,
    reference: string,
    strategy: GitSyncStrategy,
  ): GitSyncConfirmation {
    validateReference(reference);
    validateStrategy(strategy);
    this.pruneExpiredConfirmations();

    const token = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + CONFIRMATION_TTL_MS;
    this.confirmations.set(token, {
      token,
      projectId,
      reference,
      strategy,
      expiresAt,
    });

    return {
      token,
      reference,
      strategy,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  public prepareMainConfirmation(
    projectId: string,
  ): GitSyncConfirmation {
    return this.prepareConfirmation(
      projectId,
      MAIN_REFERENCE,
      MAIN_STRATEGY,
    );
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
      reference,
      strategy,
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
    };
  }

  public async synchronizeMain(
    projectPath: string,
    projectId: string,
    confirmationToken?: string,
  ): Promise<GitSyncResult> {
    await requireRepository(projectPath);
    this.consumeConfirmation(
      projectId,
      MAIN_REFERENCE,
      MAIN_STRATEGY,
      confirmationToken,
    );
    await requireCleanWorkingTree(projectPath);
    await requireRemote(projectPath, 'upstream');
    await requireRemote(projectPath, 'origin');
    await requireLocalMain(projectPath);

    const previousHead = await runGit(
      projectPath,
      ['rev-parse', MAIN_BRANCH],
    );
    const previousOriginHead = await optionalReferenceHead(
      projectPath,
      'origin/main',
    );

    try {
      await runGit(projectPath, ['fetch', '--prune', 'upstream']);
    } catch {
      throw new GitSyncError(
        'GIT_SYNC_FAILED',
        'Não foi possível buscar atualizações do repositório principal.',
      );
    }

    await requireRemoteReference(projectPath, MAIN_REFERENCE);
    await runGit(projectPath, ['checkout', MAIN_BRANCH]);

    try {
      await runGit(projectPath, ['merge', '--no-edit', MAIN_REFERENCE]);
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
        'Não foi possível integrar upstream/main na main.',
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
      reference: MAIN_REFERENCE,
      strategy: MAIN_STRATEGY,
      changed:
        currentHead !== previousHead
        || previousOriginHead !== currentHead,
      previousHead,
      currentHead,
    };
  }

  private consumeConfirmation(
    projectId: string,
    reference: string,
    strategy: GitSyncStrategy,
    token: string | undefined,
  ): void {
    this.pruneExpiredConfirmations();
    const confirmation = token
      ? this.confirmations.get(token)
      : undefined;

    if (
      !confirmation
      || confirmation.projectId !== projectId
      || confirmation.reference !== reference
      || confirmation.strategy !== strategy
    ) {
      throw new GitSyncError(
        'GIT_SYNC_CONFIRMATION_REQUIRED',
        'Confirmação obrigatória para sincronizar a branch.',
      );
    }
    this.confirmations.delete(token!);
  }

  private pruneExpiredConfirmations(): void {
    const now = Date.now();
    for (const [token, confirmation] of this.confirmations) {
      if (confirmation.expiresAt <= now) {
        this.confirmations.delete(token);
      }
    }
  }
}
