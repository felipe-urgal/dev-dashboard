import type { GitMutationConfirmation } from '@dev-dashboard/contracts';

import { requestJson } from './core';

interface GitPublishConfirmationResponse {
  confirmation: GitMutationConfirmation;
}

interface GitBranchMutationResponse {
  branch: {
    branch: string;
  };
}

export async function prepareProjectGitBranchPublish(
  projectId: string,
  branch: string,
): Promise<GitMutationConfirmation> {
  const response = await requestJson<GitPublishConfirmationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/branches/publish/confirmations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch }),
    },
  );
  return response.confirmation;
}

export async function publishProjectGitBranch(
  projectId: string,
  branch: string,
  confirmationToken: string,
): Promise<string> {
  const response = await requestJson<GitBranchMutationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/branches/publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch, confirmationToken }),
    },
  );
  return response.branch.branch;
}

export async function prepareProjectGitForcePushWithLease(
  projectId: string,
  branch: string,
): Promise<GitMutationConfirmation> {
  const response = await requestJson<GitPublishConfirmationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/branches/force-push-with-lease/confirmations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch }),
    },
  );
  return response.confirmation;
}

export async function forcePushProjectGitBranchWithLease(
  projectId: string,
  branch: string,
  confirmationToken: string,
): Promise<string> {
  const response = await requestJson<GitBranchMutationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/branches/force-push-with-lease`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch, confirmationToken }),
    },
  );
  return response.branch.branch;
}
