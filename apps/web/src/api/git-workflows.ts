import type {
  GitPullRequestAiReview,
  GitPullRequestAiReviewExecution,
  GitPullRequestLookup,
  GitPullRequestMergeMethod,
  GitPullRequestMutationActionId,
  GitPullRequestMutationConfirmation,
  GitPullRequestMutationResult,
  GitPullRequestReviewFileDiff,
  GitPullRequestReviewFiles,
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

interface PullRequestAiReviewResponse {
  review: GitPullRequestAiReview;
}

interface PullRequestReviewFilesResponse {
  review: GitPullRequestReviewFiles;
}

interface PullRequestReviewFileDiffResponse {
  review: GitPullRequestReviewFileDiff;
}

interface PullRequestAiReviewExecutionResponse {
  execution: GitPullRequestAiReviewExecution;
}

interface LatestPullRequestAiReviewExecutionResponse {
  execution: GitPullRequestAiReviewExecution | null;
}

export interface GitPullRequestMutationInput {
  targetRemote?: GitPullRequestTargetRemote;
  baseBranch?: string;
  title?: string;
  description?: string;
  draft?: boolean;
  number?: number;
  mergeMethod?: GitPullRequestMergeMethod;
}

interface PullRequestMutationConfirmationResponse {
  confirmation: GitPullRequestMutationConfirmation;
}

interface PullRequestMutationResultResponse {
  result: GitPullRequestMutationResult;
}

function pullRequestLookupQuery(input: {
  targetRemote: GitPullRequestTargetRemote;
  baseBranch: string;
}): string {
  return [
    `targetRemote=${encodeURIComponent(input.targetRemote)}`,
    `baseBranch=${encodeURIComponent(input.baseBranch)}`,
  ].join('&');
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
  const response = await requestJson<PullRequestLookupResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/pull-request-status?${pullRequestLookupQuery(input)}`,
  );
  return response.lookup;
}

export async function getProjectGitPullRequestSummary(
  projectId: string,
  input: {
    targetRemote: GitPullRequestTargetRemote;
    baseBranch: string;
  },
): Promise<GitPullRequestLookup> {
  const response = await requestJson<PullRequestLookupResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/pull-request-summary?${pullRequestLookupQuery(input)}`,
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

export async function reviewProjectGitPullRequest(
  projectId: string,
  input: {
    targetRemote: GitPullRequestTargetRemote;
    baseBranch: string;
    model: string;
    path?: string;
  },
): Promise<GitPullRequestAiReview> {
  const response = await requestJson<PullRequestAiReviewResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/pull-request/ai-review`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return response.review;
}

export async function startProjectGitPullRequestAiReview(
  projectId: string,
  input: {
    targetRemote: GitPullRequestTargetRemote;
    baseBranch: string;
    model: string;
    paths: string[];
    concurrency: 1 | 2;
  },
): Promise<GitPullRequestAiReviewExecution> {
  const response = await requestJson<PullRequestAiReviewExecutionResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/pull-request/ai-review-executions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return response.execution;
}

export async function cancelProjectGitPullRequestAiReview(
  projectId: string,
  executionId: string,
): Promise<GitPullRequestAiReviewExecution> {
  const response = await requestJson<PullRequestAiReviewExecutionResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/pull-request/ai-review-executions/${encodeURIComponent(executionId)}/cancel`,
    { method: 'POST' },
  );
  return response.execution;
}

export async function getLatestProjectGitPullRequestAiReview(
  projectId: string,
  input: {
    targetRemote: GitPullRequestTargetRemote;
    baseBranch: string;
  },
): Promise<GitPullRequestAiReviewExecution | null> {
  const response =
    await requestJson<LatestPullRequestAiReviewExecutionResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/git/pull-request/ai-review-executions/latest?${pullRequestLookupQuery(input)}`,
    );
  return response.execution;
}

export async function getProjectGitPullRequestReviewFiles(
  projectId: string,
  input: {
    targetRemote: GitPullRequestTargetRemote;
    baseBranch: string;
  },
): Promise<GitPullRequestReviewFiles> {
  const response = await requestJson<PullRequestReviewFilesResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/pull-request/ai-review-files?${pullRequestLookupQuery(input)}`,
  );
  return response.review;
}

export async function getProjectGitPullRequestReviewFileDiff(
  projectId: string,
  input: {
    targetRemote: GitPullRequestTargetRemote;
    baseBranch: string;
    path: string;
  },
): Promise<GitPullRequestReviewFileDiff> {
  const query = new URLSearchParams({
    targetRemote: input.targetRemote,
    baseBranch: input.baseBranch,
    path: input.path,
  });
  const response = await requestJson<PullRequestReviewFileDiffResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/pull-request/ai-review-file-diff?${query}`,
  );
  return response.review;
}

export async function prepareProjectGitPullRequestAction(
  projectId: string,
  actionId: GitPullRequestMutationActionId,
  input: GitPullRequestMutationInput,
): Promise<GitPullRequestMutationConfirmation> {
  const response = await requestJson<PullRequestMutationConfirmationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/pull-request/confirmations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionId, ...input }),
    },
  );
  return response.confirmation;
}

export async function runProjectGitPullRequestAction(
  projectId: string,
  actionId: GitPullRequestMutationActionId,
  input: GitPullRequestMutationInput,
  confirmationToken: string,
): Promise<GitPullRequestMutationResult> {
  const response = await requestJson<PullRequestMutationResultResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/pull-request/actions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionId, ...input, confirmationToken }),
    },
  );
  return response.result;
}
