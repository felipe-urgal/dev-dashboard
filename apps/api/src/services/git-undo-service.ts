import { CONFIRMATION_TTL_MS } from './git-undo/constants.js';
import { headCommit } from './git-undo/commit-helpers.js';
import { GitUndoError } from './git-undo/errors.js';
import {
  ensurePathInsideProject,
  pathExistsInHead,
  renameInfo,
  unlinkIfPresent,
} from './git-undo/file-helpers.js';
import {
  currentBranch,
  requireRepository,
  undoTrackingComparison,
  workingTreeClean,
} from './git-undo/repository-guards.js';
import { optionalGit, runGit } from './git-undo/run.js';
import type {
  GitUndoCommitStatus,
  GitUndoConfirmation,
  GitUndoCommitResult,
  GitUndoOperation,
} from './git-undo/types.js';
import {
  GitMutationConfirmationError,
  GitMutationConfirmationService,
} from './git-mutation-confirmation-service.js';

export { GitUndoError } from './git-undo/errors.js';
export type { GitUndoErrorCode } from './git-undo/errors.js';
export type {
  GitUndoCommitBlockedReason,
  GitUndoCommitResult,
  GitUndoCommitStatus,
  GitUndoConfirmation,
  GitUndoOperation,
  GitUndoStrategy,
} from './git-undo/types.js';

function undoCatalogOperationId(operation: GitUndoOperation): string {
  return operation === 'commit' ? 'undo-commit' : 'undo-file';
}

export class GitUndoService {
  private readonly confirmations = new GitMutationConfirmationService(
    CONFIRMATION_TTL_MS,
  );

  public async getCommitStatus(
    projectPath: string,
  ): Promise<GitUndoCommitStatus> {
    await requireRepository(projectPath);

    let branch: string;
    try {
      branch = await currentBranch(projectPath);
    } catch (error) {
      if (error instanceof GitUndoError && error.code === 'GIT_DETACHED_HEAD') {
        return { available: false, reason: 'detached' };
      }
      throw error;
    }

    try {
      await headCommit(projectPath);
    } catch {
      return { available: false, branch, reason: 'no-commit' };
    }

    const parent = await optionalGit(projectPath, [
      'rev-parse',
      '--verify',
      'HEAD^',
    ]);
    if (!parent?.trim()) {
      return { available: false, branch, reason: 'first-commit' };
    }

    if (!(await workingTreeClean(projectPath))) {
      return { available: false, branch, reason: 'dirty' };
    }

    const tracking = await undoTrackingComparison(projectPath, branch);
    if (tracking?.behind) {
      return {
        available: false,
        branch,
        reason: tracking.ahead > 0 ? 'diverged' : 'behind',
        reference: tracking.reference,
      };
    }

    if (tracking && tracking.ahead === 0) {
      return {
        available: true,
        branch,
        strategy: 'revert',
        reference: tracking.reference,
      };
    }

    return {
      available: true,
      branch,
      strategy: 'reset',
      ...(tracking ? { reference: tracking.reference } : {}),
    };
  }

  public async prepareConfirmation(
    projectPath: string,
    projectId: string,
    operation: GitUndoOperation,
    requestedTarget: string,
  ): Promise<GitUndoConfirmation> {
    await requireRepository(projectPath);
    const target =
      operation === 'file'
        ? ensurePathInsideProject(projectPath, requestedTarget)
        : await currentBranch(projectPath);

    if (operation === 'commit' && requestedTarget !== target) {
      throw new GitUndoError(
        'GIT_MUTATION_CONFIRMATION_REQUIRED',
        'A branch mudou antes da confirmação. Atualize a tela e tente novamente.',
      );
    }

    const { token, expiresAt } = this.confirmations.prepare(
      projectId,
      undoCatalogOperationId(operation),
      target,
    );
    return { token, operation, target, expiresAt };
  }

  public async undoLastCommit(
    projectPath: string,
    projectId: string,
    confirmationToken?: string,
  ): Promise<GitUndoCommitResult> {
    await requireRepository(projectPath);
    const branch = await currentBranch(projectPath);
    this.consumeConfirmation(projectId, 'commit', branch, confirmationToken);

    const status = await this.getCommitStatus(projectPath);
    if (!status.available || !status.strategy) {
      switch (status.reason) {
        case 'dirty':
          throw new GitUndoError(
            'GIT_WORKING_TREE_DIRTY',
            'Registre ou desfaça as alterações atuais antes de desfazer um commit.',
          );
        case 'behind':
          throw new GitUndoError(
            'GIT_BRANCH_BEHIND',
            'A branch está atrás do remoto. Sincronize antes de desfazer o commit.',
          );
        case 'diverged':
          throw new GitUndoError(
            'GIT_BRANCH_DIVERGED',
            'A branch divergiu do remoto. Sincronize ou resolva a divergência antes de desfazer o commit.',
          );
        case 'detached':
          throw new GitUndoError(
            'GIT_DETACHED_HEAD',
            'Não é possível desfazer um commit em HEAD destacado.',
          );
        case 'first-commit':
          throw new GitUndoError(
            'GIT_COMMIT_FAILED',
            'O primeiro commit do repositório não pode ser desfeito por esta ação.',
          );
        default:
          throw new GitUndoError(
            'GIT_COMMIT_FAILED',
            'O repositório ainda não possui commit para desfazer.',
          );
      }
    }

    const undone = await headCommit(projectPath);
    if (status.strategy === 'revert') {
      try {
        await runGit(projectPath, ['revert', '--no-edit', 'HEAD']);
      } catch (error) {
        await optionalGit(projectPath, ['revert', '--abort']);
        throw new GitUndoError(
          'GIT_COMMAND_FAILED',
          error instanceof Error
            ? error.message
            : 'Não foi possível reverter o commit publicado.',
        );
      }
      return {
        strategy: 'revert',
        undone,
        result: await headCommit(projectPath),
      };
    }

    try {
      await runGit(projectPath, ['reset', '--soft', 'HEAD^']);
    } catch (error) {
      throw new GitUndoError(
        'GIT_COMMAND_FAILED',
        error instanceof Error
          ? error.message
          : 'Não foi possível desfazer o último commit.',
      );
    }
    return { strategy: 'reset', undone };
  }

  public async undoFile(
    projectPath: string,
    projectId: string,
    requestedPath: string,
    confirmationToken?: string,
  ): Promise<{ path: string }> {
    await requireRepository(projectPath);
    const safePath = ensurePathInsideProject(projectPath, requestedPath);
    this.consumeConfirmation(projectId, 'file', safePath, confirmationToken);

    const status = await runGit(projectPath, [
      'status',
      '--porcelain',
      '-z',
      '--untracked-files=all',
      '--',
      safePath,
    ]);
    if (!status) {
      throw new GitUndoError(
        'GIT_FILE_NOT_FOUND',
        'O arquivo não possui alterações para desfazer.',
      );
    }

    try {
      if (status.startsWith('?? ')) {
        await unlinkIfPresent(projectPath, safePath);
        return { path: safePath };
      }

      const moved = await renameInfo(projectPath, safePath);
      if (moved?.kind === 'rename') {
        const previousPath = ensurePathInsideProject(
          projectPath,
          moved.previousPath,
        );
        await runGit(projectPath, [
          'reset',
          'HEAD',
          '--',
          safePath,
          previousPath,
        ]);
        await unlinkIfPresent(projectPath, safePath);
        await runGit(projectPath, [
          'restore',
          '--source=HEAD',
          '--staged',
          '--worktree',
          '--',
          previousPath,
        ]);
        return { path: safePath };
      }

      if (moved?.kind === 'copy') {
        await runGit(projectPath, ['reset', 'HEAD', '--', safePath]);
        await unlinkIfPresent(projectPath, safePath);
        return { path: safePath };
      }

      if (await pathExistsInHead(projectPath, safePath)) {
        await runGit(projectPath, [
          'restore',
          '--source=HEAD',
          '--staged',
          '--worktree',
          '--',
          safePath,
        ]);
      } else {
        await runGit(projectPath, ['reset', 'HEAD', '--', safePath]);
        await unlinkIfPresent(projectPath, safePath);
      }
      return { path: safePath };
    } catch (error) {
      if (error instanceof GitUndoError) throw error;
      throw new GitUndoError(
        'GIT_COMMAND_FAILED',
        error instanceof Error
          ? error.message
          : 'Não foi possível desfazer as alterações do arquivo.',
      );
    }
  }

  private consumeConfirmation(
    projectId: string,
    operation: GitUndoOperation,
    target: string,
    token: string | undefined,
  ): void {
    try {
      this.confirmations.consume(
        projectId,
        undoCatalogOperationId(operation),
        target,
        token,
      );
    } catch (error) {
      if (error instanceof GitMutationConfirmationError) {
        throw new GitUndoError(
          'GIT_MUTATION_CONFIRMATION_REQUIRED',
          'Confirmação obrigatória para esta operação.',
        );
      }
      throw error;
    }
  }
}
