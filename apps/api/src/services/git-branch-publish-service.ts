import type { GitMutationConfirmation } from '@dev-dashboard/contracts';

import {
  GIT_MUTATION_CONFIRMATION_TTL_MS,
  REMOTE_UNAVAILABLE_PATTERN,
} from './git-service/constants.js';
import { GitMutationError } from './git-service/errors.js';
import {
  requireOriginRemote,
  requireRepository,
  validateBranchName,
} from './git-service/mutation-guards.js';
import { commandFailureText, runGit } from './git-service/run.js';
import {
  GitMutationConfirmationError,
  GitMutationConfirmationService,
} from './git-mutation-confirmation-service.js';

const PUBLISH_OPERATION_ID = 'branch-publish';
const FORCE_PUSH_OPERATION_ID = 'branch-force-push-with-lease';

function forcePushTarget(branch: string, expectedRemoteSha: string): string {
  return `${branch}::${expectedRemoteSha}`;
}

export class GitBranchPublishService {
  private readonly confirmations = new GitMutationConfirmationService(
    GIT_MUTATION_CONFIRMATION_TTL_MS,
  );

  public preparePublishConfirmation(
    projectId: string,
    branch: string,
  ): GitMutationConfirmation {
    validateBranchName(branch);
    const { token, expiresAt } = this.confirmations.prepare(
      projectId,
      PUBLISH_OPERATION_ID,
      branch,
    );
    return { token, operation: 'push', target: branch, expiresAt };
  }

  public async prepareForcePushWithLeaseConfirmation(
    projectPath: string,
    projectId: string,
    branch: string,
  ): Promise<GitMutationConfirmation> {
    validateBranchName(branch);
    await requireRepository(projectPath);
    await requireOriginRemote(projectPath);
    await this.requireLocalBranch(projectPath, branch);
    await this.requireCurrentBranch(projectPath, branch);
    await this.requireRewriteAllowed(projectPath, branch);

    try {
      await runGit(projectPath, [
        'fetch',
        '--quiet',
        '--no-tags',
        'origin',
        `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
      ]);
    } catch (error) {
      const details = commandFailureText(error);
      if (/couldn.t find remote ref|remote ref does not exist|not found/i.test(details)) {
        throw new GitMutationError(
          'GIT_REMOTE_BRANCH_NOT_FOUND',
          `A branch remota "origin/${branch}" não foi encontrada.`,
        );
      }
      if (REMOTE_UNAVAILABLE_PATTERN.test(details)) {
        throw new GitMutationError(
          'GIT_REMOTE_UNAVAILABLE',
          'Não foi possível acessar o remote "origin".',
        );
      }
      throw new GitMutationError('GIT_PUSH_FAILED', details);
    }

    const expectedRemoteSha = await this.remoteTrackingSha(projectPath, branch);
    const target = forcePushTarget(branch, expectedRemoteSha);
    const { token, expiresAt } = this.confirmations.prepare(
      projectId,
      FORCE_PUSH_OPERATION_ID,
      target,
    );
    return { token, operation: 'push', target, expiresAt };
  }

  public async publishLocalBranch(
    projectPath: string,
    projectId: string,
    branch: string,
    confirmationToken?: string,
  ): Promise<{ branch: string }> {
    validateBranchName(branch);
    await requireRepository(projectPath);
    this.consumeConfirmation(
      projectId,
      PUBLISH_OPERATION_ID,
      branch,
      confirmationToken,
      'Confirmação obrigatória para publicar a branch no origin.',
    );
    await requireOriginRemote(projectPath);
    await this.requireLocalBranch(projectPath, branch);

    try {
      await runGit(projectPath, [
        'push',
        '--set-upstream',
        'origin',
        `refs/heads/${branch}:refs/heads/${branch}`,
      ]);
    } catch (error) {
      const details = commandFailureText(error);
      if (/\[rejected\]|non-fast-forward|fetch first/i.test(details)) {
        throw new GitMutationError(
          'GIT_PUSH_REJECTED',
          'O origin tem commits que a branch local não possui; atualize a branch antes de publicar.',
        );
      }
      if (REMOTE_UNAVAILABLE_PATTERN.test(details)) {
        throw new GitMutationError(
          'GIT_REMOTE_UNAVAILABLE',
          'Não foi possível acessar o remote "origin".',
        );
      }
      throw new GitMutationError('GIT_PUSH_FAILED', details);
    }

    return { branch };
  }

  public async forcePushWithLease(
    projectPath: string,
    projectId: string,
    branch: string,
    confirmationToken?: string,
  ): Promise<{ branch: string }> {
    validateBranchName(branch);
    await requireRepository(projectPath);
    await requireOriginRemote(projectPath);
    await this.requireLocalBranch(projectPath, branch);
    await this.requireCurrentBranch(projectPath, branch);
    await this.requireRewriteAllowed(projectPath, branch);

    // Não faz fetch aqui: o SHA remoto local continua sendo o lease preparado
    // e confirmado. Se o remoto mudar depois, o próprio Git recusa o push.
    const expectedRemoteSha = await this.remoteTrackingSha(projectPath, branch);
    this.consumeConfirmation(
      projectId,
      FORCE_PUSH_OPERATION_ID,
      forcePushTarget(branch, expectedRemoteSha),
      confirmationToken,
      'Confirmação obrigatória para reenviar a branch com lease.',
    );

    try {
      await runGit(projectPath, [
        'push',
        `--force-with-lease=refs/heads/${branch}:${expectedRemoteSha}`,
        'origin',
        `refs/heads/${branch}:refs/heads/${branch}`,
      ]);
    } catch (error) {
      const details = commandFailureText(error);
      if (/stale info|\[rejected\]|non-fast-forward|fetch first/i.test(details)) {
        throw new GitMutationError(
          'GIT_FORCE_WITH_LEASE_REJECTED',
          `O origin/${branch} mudou depois da confirmação. Atualize a branch e revise os commits antes de tentar novamente.`,
        );
      }
      if (REMOTE_UNAVAILABLE_PATTERN.test(details)) {
        throw new GitMutationError(
          'GIT_REMOTE_UNAVAILABLE',
          'Não foi possível acessar o remote "origin".',
        );
      }
      throw new GitMutationError('GIT_PUSH_FAILED', details);
    }

    return { branch };
  }

  private async requireLocalBranch(
    projectPath: string,
    branch: string,
  ): Promise<void> {
    try {
      await runGit(projectPath, [
        'show-ref',
        '--verify',
        '--quiet',
        `refs/heads/${branch}`,
      ]);
    } catch {
      throw new GitMutationError(
        'GIT_BRANCH_NOT_FOUND',
        `A branch local "${branch}" não foi encontrada.`,
      );
    }
  }

  private async requireCurrentBranch(
    projectPath: string,
    branch: string,
  ): Promise<void> {
    const current = (await runGit(projectPath, ['branch', '--show-current'])).trim();
    if (current !== branch) {
      throw new GitMutationError(
        'GIT_FORCE_PUSH_CURRENT_BRANCH_REQUIRED',
        `Selecione a branch "${branch}" antes de reenviá-la com lease.`,
      );
    }
  }

  private async requireRewriteAllowed(
    projectPath: string,
    branch: string,
  ): Promise<void> {
    let protectedBranch = branch === 'main' || branch === 'master';
    try {
      const defaultRemote = (await runGit(projectPath, [
        'symbolic-ref',
        '--quiet',
        '--short',
        'refs/remotes/origin/HEAD',
      ])).trim();
      protectedBranch ||= defaultRemote === `origin/${branch}`;
    } catch {
      // origin/HEAD é opcional; main/master continuam protegidas.
    }

    if (protectedBranch) {
      throw new GitMutationError(
        'GIT_PROTECTED_BRANCH',
        `A branch protegida "${branch}" não pode ter o histórico remoto reescrito pelo dashboard.`,
      );
    }
  }

  private async remoteTrackingSha(
    projectPath: string,
    branch: string,
  ): Promise<string> {
    try {
      return (await runGit(projectPath, [
        'rev-parse',
        '--verify',
        `refs/remotes/origin/${branch}`,
      ])).trim();
    } catch {
      throw new GitMutationError(
        'GIT_REMOTE_BRANCH_NOT_FOUND',
        `A branch remota "origin/${branch}" não foi encontrada.`,
      );
    }
  }

  private consumeConfirmation(
    projectId: string,
    operationId: string,
    target: string,
    token: string | undefined,
    message: string,
  ): void {
    try {
      this.confirmations.consume(projectId, operationId, target, token);
    } catch (error) {
      if (error instanceof GitMutationConfirmationError) {
        throw new GitMutationError(
          'GIT_MUTATION_CONFIRMATION_REQUIRED',
          message,
        );
      }
      throw error;
    }
  }
}
