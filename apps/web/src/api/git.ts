import type {
  GitBranchMutationResult,
  GitCommitDetails,
  GitCommitFileDiff,
  GitCommitHistoryKind,
  GitCommitHistoryPage,
  GitCommitResult,
  GitDiffScope,
  GitDiffSnapshot,
  GitFileDiff,
  GitFileLines,
  GitMutationConfirmation,
  GitMutationHistoryPage,
  GitMutationOperation,
  ProjectGitOverview,
} from '@dev-dashboard/contracts';

import { requestJson } from './core';

interface ProjectGitResponse {
  git: ProjectGitOverview;
}

export async function fetchProjectGit(
  projectId: string,
): Promise<ProjectGitOverview> {
  const response = await requestJson<ProjectGitResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git`,
  );
  return response.git;
}

interface ProjectGitDiffResponse {
  diff: GitDiffSnapshot;
}
interface ProjectGitFileDiffResponse {
  file: GitFileDiff;
}

export async function fetchProjectGitDiff(
  projectId: string,
  scope: GitDiffScope = 'combined',
  signal?: AbortSignal,
): Promise<GitDiffSnapshot> {
  const query = new URLSearchParams({ scope });
  const init: RequestInit = signal ? { signal } : {};
  const response = await requestJson<ProjectGitDiffResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/diff?${query}`,
    init,
  );
  return response.diff;
}

export async function fetchProjectGitFileDiff(
  projectId: string,
  filePath: string,
  scope: GitDiffScope = 'combined',
  signal?: AbortSignal,
): Promise<GitFileDiff> {
  const query = new URLSearchParams({ path: filePath, scope });
  const init: RequestInit = signal ? { signal } : {};
  const response = await requestJson<ProjectGitFileDiffResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/diff/file?${query}`,
    init,
  );
  return response.file;
}

interface ProjectGitCommitsResponse {
  history: GitCommitHistoryPage;
}
interface ProjectGitCommitDetailResponse {
  detail: GitCommitDetails;
}
interface ProjectGitCommitFileResponse {
  file: GitCommitFileDiff;
}

export interface ProjectGitCommitsQuery {
  ref?: string;
  page?: number;
  pageSize?: number;
  search?: string;
  author?: string;
  kind?: GitCommitHistoryKind;
}

export type ProjectGitHistoryScope = 'exclusive' | 'all';

export async function fetchProjectGitCommits(
  projectId: string,
  query: ProjectGitCommitsQuery = {},
  signal?: AbortSignal,
  scope: ProjectGitHistoryScope = 'exclusive',
): Promise<GitCommitHistoryPage> {
  const search = new URLSearchParams();
  if (query.ref) search.set('ref', query.ref);
  if (query.page) search.set('page', String(query.page));
  if (query.pageSize) search.set('pageSize', String(query.pageSize));
  if (query.search) search.set('search', query.search);
  if (query.author) search.set('author', query.author);
  if (query.kind && query.kind !== 'all') search.set('kind', query.kind);

  const endpoint =
    scope === 'exclusive' ? 'exclusive-branch-commits' : 'commits';
  const init: RequestInit = signal ? { signal } : {};
  const response = await requestJson<ProjectGitCommitsResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/${endpoint}?${search}`,
    init,
  );
  return response.history;
}

export async function fetchProjectGitCommitDetail(
  projectId: string,
  commitHash: string,
  signal?: AbortSignal,
): Promise<GitCommitDetails> {
  const init: RequestInit = signal ? { signal } : {};
  const response = await requestJson<ProjectGitCommitDetailResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/commits/${encodeURIComponent(commitHash)}`,
    init,
  );
  return response.detail;
}

export async function fetchProjectGitCommitFileDiff(
  projectId: string,
  commitHash: string,
  filePath: string,
  signal?: AbortSignal,
): Promise<GitCommitFileDiff> {
  const query = new URLSearchParams({ path: filePath });
  const init: RequestInit = signal ? { signal } : {};
  const response = await requestJson<ProjectGitCommitFileResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/commits/${encodeURIComponent(commitHash)}/file?${query}`,
    init,
  );
  return response.file;
}

interface ProjectGitFileLinesResponse {
  lines: GitFileLines;
}

export async function fetchProjectGitFileLines(
  projectId: string,
  filePath: string,
  scope: GitDiffScope,
  start: number,
  end: number,
  signal?: AbortSignal,
): Promise<GitFileLines> {
  const query = new URLSearchParams({
    path: filePath,
    scope,
    start: String(start),
    end: String(end),
  });
  const init: RequestInit = signal ? { signal } : {};
  const response = await requestJson<ProjectGitFileLinesResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/diff/file/lines?${query}`,
    init,
  );
  return response.lines;
}

interface ProjectGitFileMutationResponse {
  file: { path: string };
}

async function mutateProjectGitFile(
  projectId: string,
  action: 'stage' | 'unstage' | 'discard' | 'remove',
  filePath: string,
  confirmationToken?: string,
): Promise<string> {
  const response = await requestJson<ProjectGitFileMutationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/files/${action}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: filePath,
        ...(confirmationToken ? { confirmationToken } : {}),
      }),
    },
  );
  return response.file.path;
}

export function stageProjectGitFile(
  projectId: string,
  filePath: string,
): Promise<string> {
  return mutateProjectGitFile(projectId, 'stage', filePath);
}

export function unstageProjectGitFile(
  projectId: string,
  filePath: string,
): Promise<string> {
  return mutateProjectGitFile(projectId, 'unstage', filePath);
}

export function discardProjectGitFile(
  projectId: string,
  filePath: string,
  confirmationToken: string,
): Promise<string> {
  return mutateProjectGitFile(
    projectId,
    'discard',
    filePath,
    confirmationToken,
  );
}

export function removeProjectGitUntrackedFile(
  projectId: string,
  filePath: string,
  confirmationToken: string,
): Promise<string> {
  return mutateProjectGitFile(projectId, 'remove', filePath, confirmationToken);
}

interface GitMutationConfirmationResponse {
  confirmation: GitMutationConfirmation;
}
interface GitBranchMutationResponse {
  branch: { branch: string };
}
interface GitBranchMutationWithImpactResponse {
  branch: GitBranchMutationResult;
}
interface GitBranchRenameConfirmationResponse {
  confirmation: {
    token: string;
    operation: 'rename-branch';
    currentName: string;
    nextName: string;
    expiresAt: string;
  };
}
interface GitBranchDeleteConfirmationResponse {
  confirmation: {
    token: string;
    operation: 'delete-branch';
    target: string;
    expiresAt: string;
  };
}

export async function prepareProjectGitMutation(
  projectId: string,
  operation: GitMutationOperation,
  target: string,
): Promise<GitMutationConfirmation> {
  const response = await requestJson<GitMutationConfirmationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/mutations/confirmations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation, target }),
    },
  );
  return response.confirmation;
}

export async function createProjectGitBranch(
  projectId: string,
  name: string,
  confirmationToken: string,
): Promise<string> {
  const response = await requestJson<GitBranchMutationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/branches`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, confirmationToken }),
    },
  );
  return response.branch.branch;
}

export async function switchProjectGitBranch(
  projectId: string,
  name: string,
  confirmationToken: string,
): Promise<GitBranchMutationResult> {
  const response = await requestJson<GitBranchMutationWithImpactResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/switch`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, confirmationToken }),
    },
  );
  return response.branch;
}

export async function prepareProjectGitBranchRename(
  projectId: string,
  currentName: string,
  nextName: string,
): Promise<string> {
  const response = await requestJson<GitBranchRenameConfirmationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/branches/rename/confirmations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentName, nextName }),
    },
  );
  return response.confirmation.token;
}

export async function renameProjectGitBranch(
  projectId: string,
  currentName: string,
  nextName: string,
  confirmationToken: string,
): Promise<string> {
  const response = await requestJson<GitBranchMutationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/branches/rename`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentName, nextName, confirmationToken }),
    },
  );
  return response.branch.branch;
}

export async function prepareProjectGitBranchDelete(
  projectId: string,
  branch: string,
): Promise<string> {
  const response = await requestJson<GitBranchDeleteConfirmationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/branches/delete/confirmations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch }),
    },
  );
  return response.confirmation.token;
}

export async function deleteProjectGitBranch(
  projectId: string,
  branch: string,
  confirmationToken: string,
): Promise<string> {
  const response = await requestJson<GitBranchMutationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/branches/delete`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch, confirmationToken }),
    },
  );
  return response.branch.branch;
}

export async function pullProjectGitBranch(
  projectId: string,
  confirmationToken: string,
): Promise<GitBranchMutationResult> {
  const response = await requestJson<GitBranchMutationWithImpactResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/pull`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmationToken }),
    },
  );
  return response.branch;
}

export async function pushProjectGitBranch(
  projectId: string,
  confirmationToken: string,
): Promise<string> {
  const response = await requestJson<GitBranchMutationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/push`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmationToken }),
    },
  );
  return response.branch.branch;
}

interface GitCommitMutationResponse {
  commit: GitCommitResult;
}

export async function commitProjectGit(
  projectId: string,
  message: string,
  includeAllChanges: boolean,
  confirmationToken: string,
): Promise<GitCommitResult> {
  const response = await requestJson<GitCommitMutationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/commit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, includeAllChanges, confirmationToken }),
    },
  );
  return response.commit;
}

export async function amendProjectGit(
  projectId: string,
  message: string,
  confirmationToken: string,
): Promise<GitCommitResult> {
  const response = await requestJson<GitCommitMutationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/commit/amend`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, confirmationToken }),
    },
  );
  return response.commit;
}

export async function saveProjectGit(
  projectId: string,
  message: string,
  confirmationToken: string,
): Promise<GitCommitResult> {
  const response = await requestJson<GitCommitMutationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/save`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, confirmationToken }),
    },
  );
  return response.commit;
}

export async function fetchProjectGitMutationHistory(
  projectId: string,
  page = 1,
  pageSize = 10,
  signal?: AbortSignal,
): Promise<GitMutationHistoryPage> {
  const search = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  const init: RequestInit = signal ? { signal } : {};
  return requestJson<GitMutationHistoryPage>(
    `/api/projects/${encodeURIComponent(projectId)}/git/mutation-history?${search}`,
    init,
  );
}
