import { randomBytes } from 'node:crypto';

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

interface StoredPublishConfirmation {
  token: string;
  projectId: string;
  branch: string;
  expiresAt: number;
}

export class GitBranchPublishService {
  private readonly confirmations = new Map<string, StoredPublishConfirmation>();

  public preparePublishConfirmation(
    projectId: string,
    branch: string,
  ): GitMutationConfirmation {
    validateBranchName(branch);
    this.pruneExpired();

    const token = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + GIT_MUTATION_CONFIRMATION_TTL_MS;
    this.confirmations.set(token, {
      token,
      projectId,
      branch,
      expiresAt,
    });

    return {
      token,
      operation: 'push',
      target: branch,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  public async publishLocalBranch(
    projectPath: string,
    projectId: string,
    branch: string,
    confirmationToken?: string,
  ): Promise<{ branch: string }> {
    validateBranchName(branch);
    await requireRepository(projectPath);
    this.consumeConfirmation(projectId, branch, confirmationToken);
    await requireOriginRemote(projectPath);

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

  private consumeConfirmation(
    projectId: string,
    branch: string,
    token: string | undefined,
  ): void {
    this.pruneExpired();
    const confirmation = token ? this.confirmations.get(token) : undefined;
    if (
      !confirmation
      || confirmation.projectId !== projectId
      || confirmation.branch !== branch
    ) {
      throw new GitMutationError(
        'GIT_MUTATION_CONFIRMATION_REQUIRED',
        'Confirmação obrigatória para publicar a branch no origin.',
      );
    }
    this.confirmations.delete(token!);
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [token, confirmation] of this.confirmations) {
      if (confirmation.expiresAt <= now) this.confirmations.delete(token);
    }
  }
}
