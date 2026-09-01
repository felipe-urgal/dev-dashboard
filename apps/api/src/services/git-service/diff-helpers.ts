import { open, realpath } from 'node:fs/promises';
import path from 'node:path';

import type {
  GitDiffFile,
  GitDiffScope,
  GitFileChange,
  GitFileStatus,
  GitImageDiffPreview,
  GitImagePreviewContent,
} from '@dev-dashboard/contracts';

import {
  GIT_DIFF_BINARY_PREVIEW_LIMIT,
  GIT_DIFF_FILE_LIMIT,
  EMPTY_TREE_HASH,
} from './constants.js';
import { GitDiffError } from './errors.js';
import { runGit, runGitBuffer } from './run.js';

const IMAGE_MIME_TYPES = new Map<string, string>([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
]);
const PDF_MIME_TYPE = 'application/pdf';

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

async function runGitDiffAllowChanges(
  projectPath: string,
  args: readonly string[],
): Promise<string> {
  try {
    return await runGit(projectPath, args);
  } catch (error) {
    const failure = error as Error & {
      code?: number | string;
      stdout?: string;
    };
    if (
      (failure.code === 1 || failure.code === '1') &&
      typeof failure.stdout === 'string' &&
      failure.stdout.length > 0
    ) {
      return failure.stdout;
    }
    throw error;
  }
}

export async function readUntrackedDiffStat(
  projectPath: string,
  safePath: string,
): Promise<GitDiffFile> {
  const output = await runGitDiffAllowChanges(projectPath, [
    'diff',
    '--no-index',
    '--numstat',
    '-z',
    '--',
    '/dev/null',
    safePath,
  ]);
  const record = output.split('\0')[0] ?? '';
  const [additionsRaw = '0', deletionsRaw = '0'] = record.split('\t');
  const binary = additionsRaw === '-' && deletionsRaw === '-';
  return {
    path: safePath,
    status: 'untracked',
    additions: binary ? 0 : Number.parseInt(additionsRaw, 10) || 0,
    deletions: binary ? 0 : Number.parseInt(deletionsRaw, 10) || 0,
    binary,
  };
}

export async function readUntrackedDiff(
  projectPath: string,
  safePath: string,
): Promise<string> {
  return runGitDiffAllowChanges(projectPath, [
    'diff',
    '--no-index',
    '--',
    '/dev/null',
    safePath,
  ]);
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

export function imageMimeTypeForPath(filePath: string): string | null {
  return IMAGE_MIME_TYPES.get(path.extname(filePath).toLowerCase()) ?? null;
}

export function pdfMimeTypeForPath(filePath: string): string | null {
  return path.extname(filePath).toLowerCase() === '.pdf' ? PDF_MIME_TYPE : null;
}

function previewContent(
  buffer: Buffer,
  mimeType: string,
): GitImagePreviewContent {
  return { mimeType, base64: buffer.toString('base64') };
}

function assertPreviewSize(size: number, label: string): void {
  if (size <= GIT_DIFF_BINARY_PREVIEW_LIMIT) return;
  throw new GitDiffError(
    'GIT_DIFF_LINES_UNAVAILABLE',
    `${label} excede o limite de ${Math.round(GIT_DIFF_BINARY_PREVIEW_LIMIT / 1024 / 1024)} MiB para pré-visualização.`,
  );
}

async function resolveWorkingTreePreviewPath(
  projectPath: string,
  safePath: string,
  label: string,
): Promise<string> {
  try {
    const [canonicalProject, canonicalTarget] = await Promise.all([
      realpath(projectPath),
      realpath(path.resolve(projectPath, safePath)),
    ]);
    const relative = path.relative(canonicalProject, canonicalTarget);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new GitDiffError(
        'GIT_DIFF_PATH_OUTSIDE_PROJECT',
        `${label} aponta para fora do projeto.`,
      );
    }
    return canonicalTarget;
  } catch (error) {
    if (error instanceof GitDiffError) throw error;
    throw new GitDiffError(
      'GIT_DIFF_LINES_UNAVAILABLE',
      `${label} indisponível na árvore de trabalho.`,
    );
  }
}

async function readWorkingTreePreview(
  projectPath: string,
  safePath: string,
  mimeType: string,
  label: string,
): Promise<GitImagePreviewContent> {
  const absolute = await resolveWorkingTreePreviewPath(
    projectPath,
    safePath,
    label,
  );
  let handle;
  try {
    handle = await open(absolute, 'r');
  } catch {
    throw new GitDiffError(
      'GIT_DIFF_LINES_UNAVAILABLE',
      `${label} indisponível na árvore de trabalho.`,
    );
  }
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) {
      throw new GitDiffError(
        'GIT_DIFF_LINES_UNAVAILABLE',
        `O caminho de ${label.toLowerCase()} não é um arquivo comum.`,
      );
    }
    assertPreviewSize(stats.size, label);
    const buffer = Buffer.alloc(stats.size);
    await handle.read(buffer, 0, stats.size, 0);
    return previewContent(buffer, mimeType);
  } finally {
    await handle.close();
  }
}

async function readGitPreview(
  projectPath: string,
  revisionPath: string,
  mimeType: string,
  label: string,
): Promise<GitImagePreviewContent> {
  const sizeText = await runGit(projectPath, ['cat-file', '-s', revisionPath]);
  const size = Number.parseInt(sizeText.trim(), 10);
  if (!Number.isFinite(size)) {
    throw new GitDiffError(
      'GIT_DIFF_LINES_UNAVAILABLE',
      `Não foi possível determinar o tamanho de ${label.toLowerCase()} no Git.`,
    );
  }
  assertPreviewSize(size, label);
  const buffer = await runGitBuffer(
    projectPath,
    ['cat-file', 'blob', revisionPath],
    { maxBufferBytes: GIT_DIFF_BINARY_PREVIEW_LIMIT + 1024 },
  );
  return previewContent(buffer, mimeType);
}

type PreviewMimeResolver = (filePath: string) => string | null;

async function readBinaryDiffPreview(
  projectPath: string,
  safePath: string,
  previousPath: string | undefined,
  status: GitFileStatus,
  scope: GitDiffScope,
  base: string | null,
  mimeTypeForPath: PreviewMimeResolver,
  label: string,
): Promise<GitImageDiffPreview | undefined> {
  const afterMimeType = mimeTypeForPath(safePath);
  if (!afterMimeType) return undefined;

  const beforePath = previousPath ?? safePath;
  const beforeMimeType = mimeTypeForPath(beforePath) ?? afterMimeType;
  const hasBefore = status !== 'added' && status !== 'untracked';
  const hasAfter = status !== 'deleted';

  const beforePromise = !hasBefore
    ? Promise.resolve(undefined)
    : scope === 'worktree'
      ? readGitPreview(
          projectPath,
          `:${beforePath}`,
          beforeMimeType,
          label,
        ).catch(() => undefined)
      : readGitPreview(
          projectPath,
          `${base ?? 'HEAD'}:${beforePath}`,
          beforeMimeType,
          label,
        ).catch(() => undefined);

  const afterPromise = !hasAfter
    ? Promise.resolve(undefined)
    : scope === 'index'
      ? readGitPreview(projectPath, `:${safePath}`, afterMimeType, label).catch(
          () => undefined,
        )
      : readWorkingTreePreview(
          projectPath,
          safePath,
          afterMimeType,
          label,
        ).catch(() => undefined);

  const [before, after] = await Promise.all([beforePromise, afterPromise]);
  if (!before && !after) return undefined;
  return {
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
  };
}

/**
 * Para imagens suportadas, recupera os dois lados do mesmo escopo usado pelo
 * diff: índice→working tree, HEAD→índice ou HEAD→working tree.
 */
export function readImageDiffPreview(
  projectPath: string,
  safePath: string,
  previousPath: string | undefined,
  status: GitFileStatus,
  scope: GitDiffScope,
  base: string | null,
): Promise<GitImageDiffPreview | undefined> {
  return readBinaryDiffPreview(
    projectPath,
    safePath,
    previousPath,
    status,
    scope,
    base,
    imageMimeTypeForPath,
    'Imagem',
  );
}

/** Mesma leitura antes/depois, usando o viewer PDF nativo do navegador. */
export function readPdfDiffPreview(
  projectPath: string,
  safePath: string,
  previousPath: string | undefined,
  status: GitFileStatus,
  scope: GitDiffScope,
  base: string | null,
): Promise<GitImageDiffPreview | undefined> {
  return readBinaryDiffPreview(
    projectPath,
    safePath,
    previousPath,
    status,
    scope,
    base,
    pdfMimeTypeForPath,
    'PDF',
  );
}
