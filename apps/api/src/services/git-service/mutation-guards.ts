import path from 'node:path';

import { COMMIT_MESSAGE_MAX_LENGTH, GIT_BRANCH_NAME_PATTERN } from './constants.js';
import { GitMutationError } from './errors.js';
import { ensurePathInsideProject } from './diff-helpers.js';
import { runGit } from './run.js';

export async function assertWorkingTreeClean(projectPath: string): Promise<void> {
  const output = await runGit(projectPath, ['status', '--porcelain=v2', '-z', '--untracked-files=all']);
  const dirty = output.split('\0').some((record) =>
    record.startsWith('1 ') || record.startsWith('2 ') || record.startsWith('u ') || record.startsWith('? '),
  );
  if (dirty) {
    throw new GitMutationError('GIT_WORKING_TREE_DIRTY', 'A árvore de trabalho tem alterações não commitadas ou arquivos não rastreados.');
  }
}

export async function requireRepository(projectPath: string): Promise<void> {
  try {
    await runGit(projectPath, ['rev-parse', '--is-inside-work-tree']);
  } catch {
    throw new GitMutationError('GIT_NOT_REPOSITORY', 'O projeto não é um repositório Git.');
  }
}

export function validateBranchName(name: string): void {
  if (!name || name.length > 200 || !GIT_BRANCH_NAME_PATTERN.test(name)) {
    throw new GitMutationError('GIT_BRANCH_INVALID', 'Nome de branch inválido.');
  }
}

export function validateMutationPath(filePath: string): void {
  if (
    !filePath
    || filePath.length > 4096
    || filePath.includes('\0')
    || path.isAbsolute(filePath)
    || filePath.split(/[\\/]/).includes('..')
  ) {
    throw new GitMutationError(
      'GIT_FILE_PATH_INVALID',
      'Caminho de arquivo inválido.',
    );
  }
}

export function ensureMutationPathInsideProject(
  projectPath: string,
  requestedPath: string,
): string {
  validateMutationPath(requestedPath);
  try {
    const relative = ensurePathInsideProject(projectPath, requestedPath);
    if (relative === '.') {
      throw new Error('O caminho precisa apontar para um arquivo.');
    }
    return relative;
  } catch {
    throw new GitMutationError(
      'GIT_FILE_PATH_INVALID',
      'O arquivo precisa estar dentro do projeto.',
    );
  }
}

export async function requireOriginRemote(projectPath: string): Promise<void> {
  try {
    await runGit(projectPath, ['remote', 'get-url', 'origin']);
  } catch {
    throw new GitMutationError('GIT_REMOTE_NOT_CONFIGURED', 'Nenhum remoto "origin" configurado para este projeto.');
  }
}

export function validateCommitMessage(message: string): void {
  if (!message || message.trim().length === 0 || message.length > COMMIT_MESSAGE_MAX_LENGTH) {
    throw new GitMutationError('GIT_COMMIT_MESSAGE_INVALID', 'Mensagem de commit inválida.');
  }
}
