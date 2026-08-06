import { unlink } from 'node:fs/promises';
import path from 'node:path';

import { consumeMutationConfirmation } from './confirmation.js';
import { GitMutationError } from './errors.js';
import {
  ensureMutationPathInsideProject,
  requireRepository,
} from './mutation-guards.js';
import { runGit } from './run.js';
import { parseStatus } from './status-parsing.js';
import type { GitMutationConfirmationService } from '../git-mutation-confirmation-service.js';

/** Mutações de arquivo: stage/unstage e descarte (rastreado ou não rastreado). */
export function createFileOperations(
  confirmations: GitMutationConfirmationService,
) {
  async function stageFile(
    projectPath: string,
    requestedPath: string,
  ): Promise<{ path: string }> {
    await requireRepository(projectPath);
    const safePath = ensureMutationPathInsideProject(
      projectPath,
      requestedPath,
    );
    const status = parseStatus(
      await runGit(projectPath, [
        'status',
        '--porcelain=v2',
        '--branch',
        '-z',
        '--untracked-files=all',
      ]),
    );
    const file = status.files.find((candidate) => candidate.path === safePath);
    if (!file) {
      throw new GitMutationError(
        'GIT_FILE_NOT_FOUND',
        'O arquivo não possui alterações para adicionar ao staged.',
      );
    }
    try {
      await runGit(projectPath, ['add', '--', safePath]);
    } catch (error) {
      throw new GitMutationError(
        'GIT_FILE_MUTATION_FAILED',
        error instanceof Error
          ? error.message
          : 'Falha ao adicionar o arquivo ao staged.',
      );
    }
    return { path: safePath };
  }

  async function unstageFile(
    projectPath: string,
    requestedPath: string,
  ): Promise<{ path: string }> {
    await requireRepository(projectPath);
    const safePath = ensureMutationPathInsideProject(
      projectPath,
      requestedPath,
    );
    const status = parseStatus(
      await runGit(projectPath, [
        'status',
        '--porcelain=v2',
        '--branch',
        '-z',
        '--untracked-files=all',
      ]),
    );
    const file = status.files.find((candidate) => candidate.path === safePath);
    if (!file || file.indexStatus === '.' || file.indexStatus === '?') {
      throw new GitMutationError(
        'GIT_FILE_OPERATION_NOT_ALLOWED',
        'O arquivo não está staged.',
      );
    }
    try {
      await runGit(projectPath, ['restore', '--staged', '--', safePath]);
    } catch {
      try {
        await runGit(projectPath, ['reset', '--', safePath]);
      } catch (error) {
        throw new GitMutationError(
          'GIT_FILE_MUTATION_FAILED',
          error instanceof Error
            ? error.message
            : 'Falha ao remover o arquivo do staged.',
        );
      }
    }
    return { path: safePath };
  }

  async function discardFile(
    projectPath: string,
    projectId: string,
    requestedPath: string,
    confirmationToken?: string,
  ): Promise<{ path: string }> {
    await requireRepository(projectPath);
    const safePath = ensureMutationPathInsideProject(
      projectPath,
      requestedPath,
    );
    const status = parseStatus(
      await runGit(projectPath, [
        'status',
        '--porcelain=v2',
        '--branch',
        '-z',
        '--untracked-files=all',
      ]),
    );
    const file = status.files.find((candidate) => candidate.path === safePath);
    if (!file) {
      throw new GitMutationError(
        'GIT_FILE_NOT_FOUND',
        'O arquivo modificado não foi encontrado.',
      );
    }
    if (file.status === 'untracked' || file.worktreeStatus === '.') {
      throw new GitMutationError(
        'GIT_FILE_OPERATION_NOT_ALLOWED',
        'Somente alterações rastreadas fora do staged podem ser desfeitas.',
      );
    }
    consumeMutationConfirmation(
      confirmations,
      projectId,
      'discard-file',
      safePath,
      confirmationToken,
    );
    try {
      await runGit(projectPath, ['restore', '--worktree', '--', safePath]);
    } catch (error) {
      throw new GitMutationError(
        'GIT_FILE_MUTATION_FAILED',
        error instanceof Error
          ? error.message
          : 'Falha ao desfazer as alterações do arquivo.',
      );
    }
    return { path: safePath };
  }

  async function removeUntrackedFile(
    projectPath: string,
    projectId: string,
    requestedPath: string,
    confirmationToken?: string,
  ): Promise<{ path: string }> {
    await requireRepository(projectPath);
    const safePath = ensureMutationPathInsideProject(
      projectPath,
      requestedPath,
    );
    const status = parseStatus(
      await runGit(projectPath, [
        'status',
        '--porcelain=v2',
        '--branch',
        '-z',
        '--untracked-files=all',
      ]),
    );
    const file = status.files.find((candidate) => candidate.path === safePath);
    if (!file) {
      throw new GitMutationError(
        'GIT_FILE_NOT_FOUND',
        'O arquivo novo não foi encontrado.',
      );
    }
    if (file.status !== 'untracked') {
      throw new GitMutationError(
        'GIT_FILE_OPERATION_NOT_ALLOWED',
        'Somente arquivos não rastreados podem ser removidos por esta ação.',
      );
    }
    consumeMutationConfirmation(
      confirmations,
      projectId,
      'remove-untracked-file',
      safePath,
      confirmationToken,
    );
    try {
      await unlink(path.join(projectPath, safePath));
    } catch (error) {
      throw new GitMutationError(
        'GIT_FILE_MUTATION_FAILED',
        error instanceof Error
          ? error.message
          : 'Falha ao remover o arquivo novo.',
      );
    }
    return { path: safePath };
  }

  return { stageFile, unstageFile, discardFile, removeUntrackedFile };
}
