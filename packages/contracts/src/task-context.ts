import type { GitOpenPullRequest } from './git.js';

export interface TaskContextIssueRef {
  repository: string;
  number: number;
}

export interface TaskContextPullRequestRef {
  repository: string;
  number: number;
}

export interface TaskContext {
  id: string;
  projectId: string;
  branch: string;
  environmentInstanceId?: string;
  worktreeId?: string;
  issue?: TaskContextIssueRef;
  pullRequest?: TaskContextPullRequestRef;
  createdAt: string;
  updatedAt: string;
}

export type TaskContextReadinessStatus =
  'pass' | 'warning' | 'block' | 'unknown';

export interface TaskContextEvidence {
  observedAt: string;
  currentBranch?: string;
  branchMatches?: boolean;
  headSha?: string;
  pullRequestObservedAt?: string;
  pullRequest?: GitOpenPullRequest;
  readiness?: {
    status: TaskContextReadinessStatus;
    observedAt: string;
  };
}

export interface TaskContextSnapshot {
  context: TaskContext;
  evidence?: TaskContextEvidence;
}
