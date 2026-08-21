import type { GitMutationConfirmation } from '@dev-dashboard/contracts';

import { requestJson } from './core';

interface GitBranchSquashStatusResponse {
  branch: string;
  commitCount: number;
}

interface GitSquashConfirmationResponse {
  confirmation: GitMutationConfirmation;
}

interface GitBranchMutationResponse {
  branch: {
    branch: string;
  };
}

export async function fetchProjectGitBranchSquashStatus(
  projectId: string,
  branch: string,
): Promise<GitBranchSquashStatusResponse> {
  const params = new URLSearchParams({ branch });
  return requestJson<GitBranchSquashStatusResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/branches/squash/status?${params.toString()}`,
  );
}

export async function prepareProjectGitBranchSquash(
  projectId: string,
  branch: string,
): Promise<GitMutationConfirmation> {
  const response = await requestJson<GitSquashConfirmationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/branches/squash/confirmations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch }),
    },
  );
  return response.confirmation;
}

export async function squashProjectGitBranch(
  projectId: string,
  branch: string,
  message: string,
  confirmationToken: string,
): Promise<string> {
  const response = await requestJson<GitBranchMutationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/branches/squash`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch, message, confirmationToken }),
    },
  );
  return response.branch.branch;
}
