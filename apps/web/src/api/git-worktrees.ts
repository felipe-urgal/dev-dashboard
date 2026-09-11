import { requestJson } from './core';

export interface ProjectGitWorktree {
  id: string;
  path: string;
  head: string;
  branch?: string;
  detached: boolean;
  bare: boolean;
  kind: 'main' | 'linked' | 'unknown';
  locked: boolean;
  lockReason?: string;
  prunable: boolean;
  pruneReason?: string;
  environmentInstanceId?: string;
}

export interface ProjectGitWorktreeInspection {
  state: 'ready' | 'unavailable' | 'invalid-output';
  observedAt: string;
  worktrees: ProjectGitWorktree[];
  diagnostic?: string;
}

export interface CreateProjectGitWorktreeInput {
  branch: string;
  directoryName: string;
  createBranch: boolean;
}

export interface CreateProjectGitWorktreeResult {
  state: 'created' | 'already-present' | 'blocked' | 'failed' | 'unverified';
  path: string;
  branch: string;
  worktree?: ProjectGitWorktree;
  environmentInstanceId?: string;
  diagnostic?: string;
}

export interface PrepareProjectGitWorktreeRemovalResult {
  state: 'ready' | 'blocked' | 'not-found';
  worktreeId: string;
  environmentInstanceId?: string;
  path?: string;
  branch?: string;
  confirmationToken?: string;
  expiresAt?: string;
  diagnostic?: string;
}

export interface RemoveProjectGitWorktreeResult {
  state:
    | 'removed'
    | 'already-absent'
    | 'blocked'
    | 'failed'
    | 'unverified'
    | 'cleanup-required';
  worktreeId: string;
  environmentInstanceId?: string;
  path?: string;
  branch?: string;
  diagnostic?: string;
}

export async function fetchProjectGitWorktrees(
  projectId: string,
): Promise<ProjectGitWorktreeInspection> {
  const response = await requestJson<{
    inspection: ProjectGitWorktreeInspection;
  }>(`/api/projects/${encodeURIComponent(projectId)}/worktrees`);
  return response.inspection;
}

export async function createProjectGitWorktree(
  projectId: string,
  input: CreateProjectGitWorktreeInput,
): Promise<CreateProjectGitWorktreeResult> {
  const response = await requestJson<{ result: CreateProjectGitWorktreeResult }>(
    `/api/projects/${encodeURIComponent(projectId)}/worktrees`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return response.result;
}

export async function prepareProjectGitWorktreeRemoval(
  projectId: string,
  worktreeId: string,
): Promise<PrepareProjectGitWorktreeRemovalResult> {
  const response = await requestJson<{
    result: PrepareProjectGitWorktreeRemovalResult;
  }>(
    `/api/projects/${encodeURIComponent(projectId)}/worktrees/${encodeURIComponent(worktreeId)}/removal/confirmations`,
    { method: 'POST' },
  );
  return response.result;
}

export async function removeProjectGitWorktree(
  projectId: string,
  worktreeId: string,
  confirmationToken: string,
): Promise<RemoveProjectGitWorktreeResult> {
  const response = await requestJson<{ result: RemoveProjectGitWorktreeResult }>(
    `/api/projects/${encodeURIComponent(projectId)}/worktrees/${encodeURIComponent(worktreeId)}/removal`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmationToken }),
    },
  );
  return response.result;
}
