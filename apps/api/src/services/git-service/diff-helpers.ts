import { open } from 'node:fs/promises';
import path from 'node:path';

import type {
  GitDiffFile,
  GitDiffScope,
  GitFileChange,
} from '@dev-dashboard/contracts';

import { GIT_DIFF_FILE_LIMIT, EMPTY_TREE_HASH } from './constants.js';
import { GitDiffError } from './errors.js';
import { runGit } from './run.js';

export async function resolveDiffBase(
  projectPath: string,
  scope: GitDiffScope,
): Promise<string | null> {
  if (scope === 'worktree') return null;
  try {
    await runGit(projectPath, ['rev-parse', '--verify', '--quiet', 'HEAD']);
    return 'HEAD';
  } catch {
    return EMPTY_TREE_HASH;
  }
}

export function gitDiffArgs(
  scope: GitDiffScope,
  base: string | null,
  extra: readonly string[] = [],
): string[] {
  if (scope === 'index')
    return ['diff', '--cached', ...(base ? [base] : []), ...extra];
  if (scope === 'combined') return ['diff', ...(base ? [base] : []), ...extra];
  return ['diff', ...extra];
}

export function parseNumstat(
  output: string,
  statusByPath: Map<string, GitFileChange>,
): GitDiffFile[] {
  const files: GitDiffFile[] = [];
  const records = output.split('\0');
  let index = 0;
  while (index < records.length) {
    const record = records[index];
    index += 1;
    if (!record) continue;
    const fields = record.split('\t');
    const additionsRaw = fields[0] ?? '0';
    const deletionsRaw = fields[1] ?? '0';
    const pathPart = fields.slice(2).join('\t');
    const binary = additionsRaw === '-' && deletionsRaw === '-';
    const additions = binary ? 0 : Number.parseInt(additionsRaw, 10) || 0;
    const deletions = binary ? 0 : Number.parseInt(deletionsRaw, 10) || 0;

    let filePath = pathPart;
    let previousPath: string | undefined;
    if (!filePath) {
      previousPath = records[index] ?? '';
      index += 1;
      filePath = records[index] ?? '';
      index += 1;
      if (!filePath) continue;
    }

    const change = statusByPath.get(filePath);
    const effectivePreviousPath = previousPath || change?.previousPath;
    const effectiveStatus =
      change?.status ?? (previousPath ? 'renamed' : 'modified');
    files.push({
      path: filePath,
      ...(effectivePreviousPath ? { previousPath: effectivePreviousPath } : {}),
      status: effectiveStatus,
      additions,
      deletions,
      binary,
    });
  }
  return files;
}

export function ensurePathInsideProject(
  projectPath: string,
  requested: string,
): string {
  if (!requested || requested.includes('\0')) {
    throw new GitDiffError(
      'GIT_DIFF_PATH_INVALID',
      'Caminho inválido para diff.',
    );
  }
  const normalizedProject = path.resolve(projectPath);
  const resolved = path.resolve(normalizedProject, requested);
  const relative = path.relative(normalizedProject, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new GitDiffError(
      'GIT_DIFF_PATH_OUTSIDE_PROJECT',
      'Caminho fora do projeto.',
    );
  }
  return relative || '.';
}

export async function readIndexBlob(
  projectPath: string,
  safePath: string,
): Promise<string> {
  try {
    return await runGit(projectPath, ['show', `:${safePath}`]);
  } catch {
    throw new GitDiffError(
      'GIT_DIFF_LINES_UNAVAILABLE',
      'O arquivo não está no índice.',
    );
  }
}

/**
 * Lê no máximo `GIT_DIFF_FILE_LIMIT` bytes do início do arquivo: a expansão de
 * contexto numera linhas a partir do topo, então o começo é o trecho útil —
 * ao contrário dos logs, onde o final é que importa.
 */
export async function readWorkingTreeFile(
  projectPath: string,
  safePath: string,
): Promise<string> {
  const absolute = path.resolve(projectPath, safePath);
  let handle;
  try {
    handle = await open(absolute, 'r');
  } catch {
    throw new GitDiffError(
      'GIT_DIFF_LINES_UNAVAILABLE',
      'Arquivo indisponível na árvore de trabalho.',
    );
  }
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) {
      throw new GitDiffError(
        'GIT_DIFF_LINES_UNAVAILABLE',
        'O caminho não é um arquivo comum.',
      );
    }
    const size = Math.min(stats.size, GIT_DIFF_FILE_LIMIT);
    const buffer = Buffer.alloc(size);
    await handle.read(buffer, 0, size, 0);
    return buffer.toString('utf8');
  } finally {
    await handle.close();
  }
}
