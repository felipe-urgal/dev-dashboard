import type {
  GitCommit,
  GitDiffScope,
  GitDiffSnapshot,
  GitFileChange,
  GitFileDiff,
  GitFileLines,
  ProjectGitOverview,
} from '@dev-dashboard/contracts';
import { maskSensitiveLogContent } from '@dev-dashboard/process-manager';

import {
  GIT_DIFF_FILE_LIMIT,
  GIT_DIFF_LINES_LIMIT,
  LOG_SEPARATOR,
  RECORD_SEPARATOR,
} from './constants.js';
import {
  resolveDiffBase,
  gitDiffArgs,
  parseNumstat,
  ensurePathInsideProject,
  readIndexBlob,
  readWorkingTreeFile,
} from './diff-helpers.js';
import { GitDiffError } from './errors.js';
import { runGit } from './run.js';
import { parseCommits, parseStatus } from './status-parsing.js';

/** Leituras: visão geral, diff (snapshot/arquivo) e expansão de contexto de linhas. Não têm mutação nem confirmação. */

export async function getOverview(
  projectPath: string,
): Promise<ProjectGitOverview> {
  try {
    await runGit(projectPath, ['rev-parse', '--is-inside-work-tree']);
  } catch {
    return {
      repository: false,
      detached: false,
      ahead: 0,
      behind: 0,
      clean: true,
      files: [],
      recentCommits: [],
    };
  }
  const status = parseStatus(
    await runGit(projectPath, [
      'status',
      '--porcelain=v2',
      '--branch',
      '-z',
      '--untracked-files=all',
    ]),
  );
  let commits: GitCommit[] = [];
  try {
    commits = parseCommits(
      await runGit(projectPath, [
        'log',
        '-n',
        '20',
        `--format=%H${LOG_SEPARATOR}%h${LOG_SEPARATOR}%s${LOG_SEPARATOR}%an${LOG_SEPARATOR}%ae${LOG_SEPARATOR}%aI${RECORD_SEPARATOR}`,
      ]),
    );
  } catch {
    /* repositório sem commits */
  }
  return {
    repository: true,
    ...(status.branch ? { branch: status.branch } : {}),
    detached: status.detached,
    ...(status.upstream ? { upstream: status.upstream } : {}),
    ahead: status.ahead,
    behind: status.behind,
    clean: status.files.length === 0,
    files: status.files,
    ...(commits[0] ? { latestCommit: commits[0] } : {}),
    recentCommits: commits,
  };
}

export async function getDiffSnapshot(
  projectPath: string,
  scope: GitDiffScope = 'combined',
): Promise<GitDiffSnapshot> {
  try {
    await runGit(projectPath, ['rev-parse', '--is-inside-work-tree']);
  } catch {
    return { repository: false, scope, files: [] };
  }
  const status = parseStatus(
    await runGit(projectPath, [
      'status',
      '--porcelain=v2',
      '--branch',
      '-z',
      '--untracked-files=all',
    ]),
  );
  const statusByPath = new Map<string, GitFileChange>();
  for (const file of status.files) statusByPath.set(file.path, file);
  const base = await resolveDiffBase(projectPath, scope);
  const numstat = await runGit(projectPath, [
    ...gitDiffArgs(scope, base, ['--numstat', '-z']),
  ]);
  const files = parseNumstat(numstat, statusByPath);
  return { repository: true, scope, files };
}

export async function getFileDiff(
  projectPath: string,
  requestedPath: string,
  scope: GitDiffScope = 'combined',
): Promise<GitFileDiff> {
  try {
    await runGit(projectPath, ['rev-parse', '--is-inside-work-tree']);
  } catch {
    throw new GitDiffError(
      'GIT_NOT_REPOSITORY',
      'O projeto não é um repositório Git.',
    );
  }
  const safePath = ensurePathInsideProject(projectPath, requestedPath);
  const statusOutput = await runGit(projectPath, [
    'status',
    '--porcelain=v2',
    '--branch',
    '-z',
    '--untracked-files=all',
  ]);
  const status = parseStatus(statusOutput);
  const change = status.files.find((file) => file.path === safePath);

  let raw = '';
  let binary = false;
  const base = await resolveDiffBase(projectPath, scope);
  try {
    raw = await runGit(projectPath, [
      ...gitDiffArgs(scope, base, ['--', safePath]),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/binary files? .* differ/i.test(message)) {
      binary = true;
    } else {
      throw error;
    }
  }
  if (!binary && /^Binary files /m.test(raw)) binary = true;

  const truncated = raw.length > GIT_DIFF_FILE_LIMIT;
  const trimmed = truncated ? raw.slice(0, GIT_DIFF_FILE_LIMIT) : raw;
  const masked = maskSensitiveLogContent(trimmed);
  return {
    path: safePath,
    scope,
    status: change?.status ?? 'modified',
    binary,
    content: binary ? '' : masked.content,
    truncated,
    masked: masked.masked,
    redactionCount: masked.redactionCount,
  };
}

/**
 * Lê uma faixa de linhas do lado "novo" de um arquivo que já aparece no diff
 * do escopo pedido — é o que alimenta a expansão de contexto na interface.
 *
 * O navegador nunca escolhe um caminho livre: além da checagem de contenção
 * no projeto, o caminho precisa estar na lista de arquivos do próprio diff.
 */
export async function getFileLines(
  projectPath: string,
  requestedPath: string,
  scope: GitDiffScope,
  start: number,
  end: number,
): Promise<GitFileLines> {
  try {
    await runGit(projectPath, ['rev-parse', '--is-inside-work-tree']);
  } catch {
    throw new GitDiffError(
      'GIT_NOT_REPOSITORY',
      'O projeto não é um repositório Git.',
    );
  }

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 1 ||
    end < start
  ) {
    throw new GitDiffError(
      'GIT_DIFF_RANGE_INVALID',
      'Faixa de linhas inválida.',
    );
  }
  if (end - start + 1 > GIT_DIFF_LINES_LIMIT) {
    throw new GitDiffError(
      'GIT_DIFF_RANGE_INVALID',
      `A faixa excede ${GIT_DIFF_LINES_LIMIT} linhas.`,
    );
  }

  const safePath = ensurePathInsideProject(projectPath, requestedPath);
  const snapshot = await getDiffSnapshot(projectPath, scope);
  const entry = snapshot.files.find((file) => file.path === safePath);
  if (!entry) {
    throw new GitDiffError(
      'GIT_DIFF_PATH_NOT_IN_DIFF',
      'O arquivo não faz parte do diff deste escopo.',
    );
  }
  if (entry.binary) {
    throw new GitDiffError(
      'GIT_DIFF_LINES_UNAVAILABLE',
      'Arquivo binário não tem expansão de contexto.',
    );
  }
  if (entry.status === 'deleted') {
    throw new GitDiffError(
      'GIT_DIFF_LINES_UNAVAILABLE',
      'Arquivo removido não tem conteúdo para expandir.',
    );
  }

  const content =
    scope === 'index'
      ? await readIndexBlob(projectPath, safePath)
      : await readWorkingTreeFile(projectPath, safePath);

  const allLines = content.split('\n');
  if (allLines.at(-1) === '') allLines.pop();
  const totalLines = allLines.length;
  const effectiveStart = Math.min(start, totalLines + 1);
  const effectiveEnd = Math.min(end, totalLines);
  const slice =
    effectiveEnd < effectiveStart
      ? []
      : allLines.slice(effectiveStart - 1, effectiveEnd);

  const masked = maskSensitiveLogContent(slice.join('\n'));
  return {
    path: safePath,
    scope,
    start: effectiveStart,
    end: effectiveEnd < effectiveStart ? effectiveStart - 1 : effectiveEnd,
    totalLines,
    lines: slice.length === 0 ? [] : masked.content.split('\n'),
    masked: masked.masked,
    redactionCount: masked.redactionCount,
  };
}
