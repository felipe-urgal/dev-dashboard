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

/** Identificador do catálogo (`git-mutation-catalog.ts`) para esta operação. */
const CATALOG_OPERATION_ID = 'branch-publish';

export class GitBranchPublishService {
  /**
   * Mecanismo compartilhado de confirmação (`git-mutation-confirmation-service.ts`),
   * no lugar do `Map` privado que este serviço mantinha — mesma TTL e mesmo
   * comportamento externo (`GIT_MUTATION_CONFIRMATION_REQUIRED`).
   */
  private readonly confirmations = new GitMutationConfirmationService(GIT_MUTATION_CONFIRMATION_TTL_MS);

  public preparePublishConfirmation(
    projectId: string,
    branch: string,
  ): GitMutationConfirmation {
    validateBranchName(branch);
    const { token, expiresAt } = this.confirmations.prepare(projectId, CATALOG_OPERATION_ID, branch);
    return { token, operation: 'push', target: branch, expiresAt };
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
    try {
      this.confirmations.consume(projectId, CATALOG_OPERATION_ID, branch, token);
    } catch (error) {
      if (error instanceof GitMutationConfirmationError) {
        throw new GitMutationError(
          'GIT_MUTATION_CONFIRMATION_REQUIRED',
          'Confirmação obrigatória para publicar a branch no origin.',
        );
      }
      throw error;
    }
  }
}
