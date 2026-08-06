import { unlink } from 'node:fs/promises';
import path from 'node:path';

import { GitUndoError } from './errors.js';
import { optionalGit } from './run.js';

export function ensurePathInsideProject(
  projectPath: string,
  requestedPath: string,
): string {
  if (
    !requestedPath ||
    requestedPath.length > 4096 ||
    requestedPath.includes('\0') ||
    requestedPath.includes('\n') ||
    requestedPath.includes('\r') ||
    requestedPath.includes('\t') ||
    path.isAbsolute(requestedPath) ||
    requestedPath.split(/[\\/]/).includes('..')
  ) {
    throw new GitUndoError(
      'GIT_FILE_PATH_INVALID',
      'Caminho de arquivo inválido.',
    );
  }

  const root = path.resolve(projectPath);
  const resolved = path.resolve(root, requestedPath);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new GitUndoError(
      'GIT_FILE_PATH_INVALID',
      'O arquivo precisa estar dentro do projeto.',
    );
  }
  return relative.replaceAll('\\', '/');
}

export interface RenameInfo {
  kind: 'rename' | 'copy';
  previousPath: string;
}

export async function renameInfo(
  projectPath: string,
  safePath: string,
): Promise<RenameInfo | null> {
  const output = await optionalGit(projectPath, [
    'diff',
    '--name-status',
    '-M',
    '-C',
    'HEAD',
    '--',
    safePath,
  ]);
  if (!output?.trim()) return null;

  for (const line of output.trim().split('\n')) {
    const [status = '', previousPath = '', currentPath = ''] = line.split('\t');
    if (currentPath !== safePath || !previousPath) continue;
    if (status.startsWith('R')) return { kind: 'rename', previousPath };
    if (status.startsWith('C')) return { kind: 'copy', previousPath };
  }
  return null;
}

export async function pathExistsInHead(
  projectPath: string,
  safePath: string,
): Promise<boolean> {
  const output = await optionalGit(projectPath, [
    'ls-tree',
    '--name-only',
    'HEAD',
    '--',
    safePath,
  ]);
  return output?.trim() === safePath;
}

export async function unlinkIfPresent(
  projectPath: string,
  safePath: string,
): Promise<void> {
  try {
    await unlink(path.join(projectPath, safePath));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw error;
  }
}
