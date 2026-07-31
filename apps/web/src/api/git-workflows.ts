import type {
  GitPullRequestLookup,
  GitPullRequestUrl,
} from '@dev-dashboard/contracts';

import { requestJson } from './core';

export type GitUndoOperation = 'commit' | 'file';
export type GitPullRequestTargetRemote = 'origin' | 'upstream';

export interface GitUndoConfirmation {
  token: string;
  operation: GitUndoOperation;
  target: string;
  expiresAt: string;
}

export interface GitUndoCommitResult {
  strategy: 'reset' | 'revert';
  undone: {
    hash: string;
    shortHash: string;
    subject: string;
  };
  result?: {
    hash: string;
    shortHash: string;
    subject: string;
  };
}

interface UndoConfirmationResponse {
  confirmation: GitUndoConfirmation;
}

interface UndoCommitResponse {
  undo: GitUndoCommitResult;
}

interface UndoFileResponse {
  file: { path: string };
}

interface PullRequestUrlResponse {
  pullRequest: GitPullRequestUrl;
}

interface PullRequestLookupResponse {
  lookup: GitPullRequestLookup;
}

export async function prepareProjectGitUndo(
  projectId: string,
  operation: GitUndoOperation,
  target: string,
): Promise<GitUndoConfirmation> {
  const response = await requestJson<UndoConfirmationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/undo/confirmations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation, target }),
    },
  );
  return response.confirmation;
}

export async function undoProjectGitCommit(
  projectId: string,
  confirmationToken: string,
): Promise<GitUndoCommitResult> {
  const response = await requestJson<UndoCommitResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/undo/commit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmationToken }),
    },
  );
  return response.undo;
}

export async function undoProjectGitFile(
  projectId: string,
  filePath: string,
  confirmationToken: string,
): Promise<string> {
  const response = await requestJson<UndoFileResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/undo/file`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, confirmationToken }),
    },
  );
  return response.file.path;
}

export async function getProjectGitPullRequestStatus(
  projectId: string,
  input: {
    targetRemote: GitPullRequestTargetRemote;
    baseBranch: string;
  },
): Promise<GitPullRequestLookup> {
  const query = [
    `targetRemote=${encodeURIComponent(input.targetRemote)}`,
    `baseBranch=${encodeURIComponent(input.baseBranch)}`,
  ].join('&');
  const response = await requestJson<PullRequestLookupResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/pull-request-status?${query}`,
  );
  return response.lookup;
}

export async function composeProjectGitPullRequest(
  projectId: string,
  input: {
    targetRemote: GitPullRequestTargetRemote;
    baseBranch: string;
    title: string;
    description: string;
  },
): Promise<GitPullRequestUrl> {
  const response = await requestJson<PullRequestUrlResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/pull-request-url`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return response.pullRequest;
}
