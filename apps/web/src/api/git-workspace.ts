import type {
  GitMutationConfirmation,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

import { ApiRequestError } from '../api';

interface ErrorResponse {
  error?: string;
  message?: string;
}

interface GitWorkspaceResponse {
  workspace: ProjectGitWorkspace;
}

interface GitTrackingConfirmationResponse {
  confirmation: GitMutationConfirmation;
}

interface GitBranchMutationResponse {
  branch: {
    branch: string;
  };
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    credentials: 'same-origin',
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = payload && typeof payload === 'object'
      ? payload as ErrorResponse
      : null;

    throw new ApiRequestError({
      status: response.status,
      ...(error?.error ? { code: error.error } : {}),
      message: error?.message ?? `A API respondeu com HTTP ${response.status}`,
    });
  }

  return payload as T;
}

export async function fetchProjectGitWorkspace(
  projectId: string,
): Promise<ProjectGitWorkspace> {
  const response = await requestJson<GitWorkspaceResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/workspace`,
  );

  return response.workspace;
}

export async function fetchProjectGitRemote(
  projectId: string,
  remote: string,
): Promise<string> {
  const response = await requestJson<{ remote: string }>(
    `/api/projects/${encodeURIComponent(projectId)}/git/remotes/${encodeURIComponent(remote)}/fetch`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '{}',
    },
  );

  return response.remote;
}

export async function prepareProjectGitTrackingBranch(
  projectId: string,
  remoteBranch: string,
): Promise<GitMutationConfirmation> {
  const response = await requestJson<GitTrackingConfirmationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/branches/track/confirmations`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ remoteBranch }),
    },
  );

  return response.confirmation;
}

export async function trackProjectGitBranch(
  projectId: string,
  remoteBranch: string,
  confirmationToken: string,
): Promise<string> {
  const response = await requestJson<GitBranchMutationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/branches/track`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ remoteBranch, confirmationToken }),
    },
  );

  return response.branch.branch;
}
