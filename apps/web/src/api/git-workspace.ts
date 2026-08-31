import type {
  GitMutationConfirmation,
  GitPullRequestUrl,
  GitSyncConfirmation,
  GitSyncResult,
  GitSyncStrategy,
  GitTrackingComparison,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

import { requestJson as requestApiJson } from './core';

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

async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  return requestApiJson<T>(input, init);
}

export async function fetchProjectGitWorkspace(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectGitWorkspace> {
  const response = await requestJson<GitWorkspaceResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/workspace`,
    signal ? { signal } : undefined,
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

export async function prepareProjectGitRemoteBranchDelete(
  projectId: string,
  remoteBranch: string,
): Promise<GitMutationConfirmation> {
  const response = await requestJson<GitTrackingConfirmationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/branches/remote/delete/confirmations`,
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

export async function deleteProjectGitRemoteBranch(
  projectId: string,
  remoteBranch: string,
  confirmationToken: string,
): Promise<string> {
  const response = await requestJson<GitBranchMutationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/branches/remote/delete`,
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

export async function compareProjectGitReference(
  projectId: string,
  reference: string,
): Promise<GitTrackingComparison> {
  const query = new URLSearchParams({ reference });
  const response = await requestJson<{ comparison: GitTrackingComparison }>(
    `/api/projects/${encodeURIComponent(projectId)}/git/sync/compare?${query.toString()}`,
  );
  return response.comparison;
}

export async function prepareProjectGitSync(
  projectId: string,
  reference: string,
  strategy: GitSyncStrategy,
): Promise<GitSyncConfirmation> {
  const response = await requestJson<{ confirmation: GitSyncConfirmation }>(
    `/api/projects/${encodeURIComponent(projectId)}/git/sync/confirmations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference, strategy }),
    },
  );
  return response.confirmation;
}

export async function fetchProjectGitPullRequestUrl(
  projectId: string,
): Promise<GitPullRequestUrl> {
  const response = await requestJson<{ pullRequest: GitPullRequestUrl }>(
    `/api/projects/${encodeURIComponent(projectId)}/git/pull-request-url`,
  );
  return response.pullRequest;
}

export async function integrateProjectGitReference(
  projectId: string,
  reference: string,
  strategy: GitSyncStrategy,
  confirmationToken: string,
): Promise<GitSyncResult> {
  const response = await requestJson<{ result: GitSyncResult }>(
    `/api/projects/${encodeURIComponent(projectId)}/git/sync`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reference,
        strategy,
        confirmationToken,
      }),
    },
  );
  return response.result;
}

export async function prepareProjectGitMainSync(
  projectId: string,
): Promise<GitSyncConfirmation> {
  const response = await requestJson<{ confirmation: GitSyncConfirmation }>(
    `/api/projects/${encodeURIComponent(projectId)}/git/sync/main/confirmations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    },
  );
  return response.confirmation;
}

export async function synchronizeProjectGitMain(
  projectId: string,
  confirmationToken: string,
): Promise<GitSyncResult> {
  const response = await requestJson<{ result: GitSyncResult }>(
    `/api/projects/${encodeURIComponent(projectId)}/git/sync/main`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmationToken }),
    },
  );
  return response.result;
}
