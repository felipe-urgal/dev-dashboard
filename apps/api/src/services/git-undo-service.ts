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
  assertWorkingTreeClean,
  currentBranch,
  localAheadOfUpstream,
  requireRepository,
} from './git-undo/repository-guards.js';
import { optionalGit, runGit } from './git-undo/run.js';
import type { GitUndoConfirmation, GitUndoCommitResult, GitUndoOperation } from './git-undo/types.js';
import {
  GitMutationConfirmationError,
  GitMutationConfirmationService,
} from './git-mutation-confirmation-service.js';

export { GitUndoError } from './git-undo/errors.js';
export type { GitUndoErrorCode } from './git-undo/errors.js';
export type {
  GitUndoCommitResult,
  GitUndoConfirmation,
  GitUndoOperation,
  GitUndoStrategy,
} from './git-undo/types.js';

/**
 * `GitUndoOperation` ('commit'|'file') é o vocabulário deste serviço; o
 * catálogo (`git-mutation-catalog.ts`) usa `undo-commit`/`undo-file`.
 */
function undoCatalogOperationId(operation: GitUndoOperation): string {
  return operation === 'commit' ? 'undo-commit' : 'undo-file';
}

export class GitUndoService {
  /**
   * Mecanismo compartilhado de confirmação (`git-mutation-confirmation-service.ts`),
   * no lugar do `Map` privado que este serviço mantinha — mesma TTL e mesmo
   * comportamento externo (`GIT_MUTATION_CONFIRMATION_REQUIRED`).
   */
  private readonly confirmations = new GitMutationConfirmationService(CONFIRMATION_TTL_MS);

  public async prepareConfirmation(
    projectPath: string,
    projectId: string,
    operation: GitUndoOperation,
    requestedTarget: string,
  ): Promise<GitUndoConfirmation> {
    await requireRepository(projectPath);
    const target = operation === 'file'
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
    await assertWorkingTreeClean(projectPath);

    const undone = await headCommit(projectPath);
    const parent = await optionalGit(projectPath, ['rev-parse', '--verify', 'HEAD^']);
    if (!parent?.trim()) {
      throw new GitUndoError(
        'GIT_COMMIT_FAILED',
        'O primeiro commit do repositório não pode ser desfeito por esta ação.',
      );
    }

    const ahead = await localAheadOfUpstream(projectPath);
    if (ahead === 0) {
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
      'status', '--porcelain', '-z', '--untracked-files=all', '--', safePath,
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
        const previousPath = ensurePathInsideProject(projectPath, moved.previousPath);
        await runGit(projectPath, ['reset', 'HEAD', '--', safePath, previousPath]);
        await unlinkIfPresent(projectPath, safePath);
        await runGit(projectPath, [
          'restore', '--source=HEAD', '--staged', '--worktree', '--', previousPath,
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
          'restore', '--source=HEAD', '--staged', '--worktree', '--', safePath,
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
      this.confirmations.consume(projectId, undoCatalogOperationId(operation), target, token);
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
