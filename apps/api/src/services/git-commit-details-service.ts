import type {
  GitImageDiffPreview,
  GitImagePreviewContent,
} from '@dev-dashboard/contracts';
import { maskSensitiveLogContent } from '@dev-dashboard/process-manager';

import {
  COMMIT_HASH_PATTERN,
  FIELD_SEPARATOR,
  FILE_PATCH_LIMIT,
  HISTORY_FORMAT,
  HISTORY_PAGE_SIZE_LIMIT,
  PATCH_LIMIT,
} from './git-commit-details/constants.js';
import { GitCommitDetailsError } from './git-commit-details/errors.js';
import {
  parseNameStatus,
  parseNumstat,
} from './git-commit-details/file-status-parsing.js';
import {
  filterHistory,
  hasHistoryFilters,
  parseHistory,
  resolveHistoryReference,
} from './git-commit-details/history-parsing.js';
import {
  requireRepository,
  runGit,
  runGitBuffer,
} from './git-commit-details/run.js';
import type {
  GitCommitDetails,
  GitCommitFileDiff,
  GitCommitFileStatus,
  GitCommitHistoryFilters,
  GitCommitHistoryPage,
} from './git-commit-details/types.js';
import { GIT_DIFF_BINARY_PREVIEW_LIMIT } from './git-service/constants.js';

export { GitCommitDetailsError } from './git-commit-details/errors.js';
export type {
  GitCommitDetailFile,
  GitCommitDetails,
  GitCommitFileDiff,
  GitCommitFileStatus,
  GitCommitHistoryEntry,
  GitCommitHistoryFilters,
  GitCommitHistoryKind,
  GitCommitHistoryPage,
} from './git-commit-details/types.js';

const PDF_MIME_TYPE = 'application/pdf';

function isPdfPath(filePath: string | undefined): boolean {
  return filePath?.toLowerCase().endsWith('.pdf') === true;
}

async function readPdfAtRevision(
  projectPath: string,
  revisionPath: string,
): Promise<GitImagePreviewContent | undefined> {
  try {
    const sizeText = await runGit(projectPath, [
      'cat-file',
      '-s',
      revisionPath,
    ]);
    const size = Number.parseInt(sizeText.trim(), 10);
    if (
      !Number.isFinite(size) ||
      size < 0 ||
      size > GIT_DIFF_BINARY_PREVIEW_LIMIT
    ) {
      return undefined;
    }
    const buffer = await runGitBuffer(
      projectPath,
      ['cat-file', 'blob', revisionPath],
      GIT_DIFF_BINARY_PREVIEW_LIMIT + 1024,
    );
    return {
      mimeType: PDF_MIME_TYPE,
      base64: buffer.toString('base64'),
    };
  } catch {
    return undefined;
  }
}

async function readCommitPdfPreview(
  projectPath: string,
  commitHash: string,
  entry: {
    path: string;
    previousPath?: string;
    status: GitCommitFileStatus;
  },
): Promise<GitImageDiffPreview | undefined> {
  const beforePath = entry.previousPath ?? entry.path;
  const hasBefore = entry.status !== 'added' && isPdfPath(beforePath);
  const hasAfter = entry.status !== 'deleted' && isPdfPath(entry.path);
  if (!hasBefore && !hasAfter) return undefined;

  const [before, after] = await Promise.all([
    hasBefore
      ? readPdfAtRevision(projectPath, `${commitHash}^:${beforePath}`)
      : Promise.resolve(undefined),
    hasAfter
      ? readPdfAtRevision(projectPath, `${commitHash}:${entry.path}`)
      : Promise.resolve(undefined),
  ]);

  if (!before && !after) return undefined;
  return {
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
  };
}

export async function listBranchCommits(
  projectPath: string,
  requestedReference: string | undefined,
  requestedPage = 1,
  requestedPageSize = 10,
  filters: GitCommitHistoryFilters = {},
): Promise<GitCommitHistoryPage> {
  await requireRepository(projectPath);

  const page = Math.max(1, Math.floor(requestedPage));
  const pageSize = Math.min(
    HISTORY_PAGE_SIZE_LIMIT,
    Math.max(1, Math.floor(requestedPageSize)),
  );
  const reference = await resolveHistoryReference(
    projectPath,
    requestedReference,
  );

  if (!reference.exists) {
    return {
      branch: reference.label,
      page: 1,
      pageSize,
      total: 0,
      totalPages: 0,
      commits: [],
    };
  }

  if (hasHistoryFilters(filters)) {
    const output = await runGit(projectPath, [
      'log',
      HISTORY_FORMAT,
      reference.revision,
      '--',
    ]);
    const filtered = filterHistory(parseHistory(output), filters);
    const total = filtered.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    const effectivePage = totalPages === 0 ? 1 : Math.min(page, totalPages);
    const start = (effectivePage - 1) * pageSize;
    return {
      branch: reference.label,
      page: effectivePage,
      pageSize,
      total,
      totalPages,
      commits: filtered.slice(start, start + pageSize),
    };
  }

  const total =
    Number.parseInt(
      (
        await runGit(projectPath, ['rev-list', '--count', reference.revision])
      ).trim(),
      10,
    ) || 0;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const effectivePage = totalPages === 0 ? 1 : Math.min(page, totalPages);
  const skip = (effectivePage - 1) * pageSize;
  const output = await runGit(projectPath, [
    'log',
    `--skip=${skip}`,
    `-n${pageSize}`,
    HISTORY_FORMAT,
    reference.revision,
    '--',
  ]);

  return {
    branch: reference.label,
    page: effectivePage,
    pageSize,
    total,
    totalPages,
    commits: parseHistory(output),
  };
}

export async function listCurrentBranchCommits(
  projectPath: string,
  requestedPage = 1,
  requestedPageSize = 10,
): Promise<GitCommitHistoryPage> {
  return listBranchCommits(
    projectPath,
    undefined,
    requestedPage,
    requestedPageSize,
  );
}

export async function inspectGitCommit(
  projectPath: string,
  commitHash: string,
): Promise<GitCommitDetails> {
  if (!COMMIT_HASH_PATTERN.test(commitHash)) {
    throw new GitCommitDetailsError(
      'GIT_COMMIT_INVALID',
      'Hash de commit inválido.',
    );
  }

  await requireRepository(projectPath);

  try {
    await runGit(projectPath, [
      'rev-parse',
      '--verify',
      `${commitHash}^{commit}`,
    ]);
  } catch {
    throw new GitCommitDetailsError(
      'GIT_COMMIT_NOT_FOUND',
      'Commit não encontrado neste repositório.',
    );
  }

  const metadata = await runGit(projectPath, [
    'show',
    '--no-patch',
    `--format=%H${FIELD_SEPARATOR}%h${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%ae${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%B`,
    commitHash,
  ]);
  const [
    hash = '',
    shortHash = '',
    subject = '',
    authorName = '',
    authorEmail = '',
    authoredAt = '',
    ...bodyParts
  ] = metadata.split(FIELD_SEPARATOR);

  const [nameStatus, numstat, rawPatch] = await Promise.all([
    runGit(projectPath, [
      'show',
      '--format=',
      '--name-status',
      '-z',
      '--find-renames',
      commitHash,
    ]),
    runGit(projectPath, [
      'show',
      '--format=',
      '--numstat',
      '-z',
      '--find-renames',
      commitHash,
    ]),
    runGit(projectPath, [
      'show',
      '--format=',
      '--find-renames',
      '--no-ext-diff',
      '--unified=3',
      commitHash,
    ]),
  ]);

  const statuses = parseNameStatus(nameStatus);
  const files = parseNumstat(numstat, statuses);
  const additions = files.reduce((total, file) => total + file.additions, 0);
  const deletions = files.reduce((total, file) => total + file.deletions, 0);
  const truncated = rawPatch.length > PATCH_LIMIT;
  const patchSlice = truncated ? rawPatch.slice(0, PATCH_LIMIT) : rawPatch;
  const maskedPatch = maskSensitiveLogContent(patchSlice);

  return {
    hash: hash.trim(),
    shortHash: shortHash.trim(),
    subject: subject.trim(),
    body: bodyParts.join(FIELD_SEPARATOR).trim(),
    authorName: authorName.trim(),
    authorEmail: authorEmail.trim(),
    authoredAt: authoredAt.trim(),
    files,
    additions,
    deletions,
    patch: maskedPatch.content,
    truncated,
    masked: maskedPatch.masked,
    redactionCount: maskedPatch.redactionCount,
  };
}

/**
 * Diff de um único arquivo dentro de um commit — é o que a tela de histórico
 * carrega sob demanda, em vez de trazer o patch inteiro de uma vez.
 *
 * O caminho vem do navegador, mas só é aceito se constar da própria lista de
 * arquivos do commit; nada de caminho arbitrário chegando ao `git show`.
 */
export async function inspectGitCommitFile(
  projectPath: string,
  commitHash: string,
  filePath: string,
): Promise<GitCommitFileDiff> {
  if (!COMMIT_HASH_PATTERN.test(commitHash)) {
    throw new GitCommitDetailsError(
      'GIT_COMMIT_INVALID',
      'Hash de commit inválido.',
    );
  }

  await requireRepository(projectPath);

  try {
    await runGit(projectPath, [
      'rev-parse',
      '--verify',
      `${commitHash}^{commit}`,
    ]);
  } catch {
    throw new GitCommitDetailsError(
      'GIT_COMMIT_NOT_FOUND',
      'Commit não encontrado neste repositório.',
    );
  }

  const nameStatus = await runGit(projectPath, [
    'show',
    '--format=',
    '--name-status',
    '-z',
    '--find-renames',
    commitHash,
  ]);
  const numstat = await runGit(projectPath, [
    'show',
    '--format=',
    '--numstat',
    '-z',
    '--find-renames',
    commitHash,
  ]);
  const entry = parseNumstat(numstat, parseNameStatus(nameStatus)).find(
    (file) => file.path === filePath,
  );

  if (!entry) {
    throw new GitCommitDetailsError(
      'GIT_COMMIT_FILE_NOT_FOUND',
      'O arquivo não faz parte deste commit.',
    );
  }

  // Renomeados precisam do caminho anterior para o git localizar as duas pontas.
  const pathArguments = entry.previousPath
    ? [entry.previousPath, entry.path]
    : [entry.path];
  const raw = await runGit(projectPath, [
    'show',
    '--format=',
    '--find-renames',
    '--no-ext-diff',
    '--unified=3',
    commitHash,
    '--',
    ...pathArguments,
  ]);

  const binary = entry.binary || /^Binary files /m.test(raw);
  const truncated = raw.length > FILE_PATCH_LIMIT;
  const masked = maskSensitiveLogContent(
    truncated ? raw.slice(0, FILE_PATCH_LIMIT) : raw,
  );
  const pdfPreview = await readCommitPdfPreview(projectPath, commitHash, entry);

  return {
    hash: commitHash,
    path: entry.path,
    status: entry.status,
    binary,
    content: binary ? '' : masked.content,
    truncated,
    masked: masked.masked,
    redactionCount: masked.redactionCount,
    ...(pdfPreview ? { pdfPreview } : {}),
  };
}
