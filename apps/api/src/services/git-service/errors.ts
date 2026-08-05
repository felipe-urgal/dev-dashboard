import type { GitMutationOperation } from '@dev-dashboard/contracts';

export class GitDiffError extends Error {
  public constructor(
    public readonly code:
      | 'GIT_NOT_REPOSITORY'
      | 'GIT_DIFF_PATH_OUTSIDE_PROJECT'
      | 'GIT_DIFF_PATH_INVALID'
      | 'GIT_DIFF_PATH_NOT_IN_DIFF'
      | 'GIT_DIFF_RANGE_INVALID'
      | 'GIT_DIFF_LINES_UNAVAILABLE',
    message: string,
  ) {
    super(message);
    this.name = 'GitDiffError';
  }
}

export type GitMutationErrorCode =
  | 'GIT_NOT_REPOSITORY'
  | 'GIT_BRANCH_INVALID'
  | 'GIT_BRANCH_EXISTS'
  | 'GIT_BRANCH_NOT_FOUND'
  | 'GIT_REMOTE_BRANCH_NOT_FOUND'
  | 'GIT_WORKING_TREE_DIRTY'
  | 'GIT_MUTATION_CONFIRMATION_REQUIRED'
  | 'GIT_DETACHED_HEAD'
  | 'GIT_NO_UPSTREAM'
  | 'GIT_REMOTE_NOT_CONFIGURED'
  | 'GIT_PULL_DIVERGED'
  | 'GIT_PULL_FAILED'
  | 'GIT_PUSH_REJECTED'
  | 'GIT_FORCE_PUSH_CURRENT_BRANCH_REQUIRED'
  | 'GIT_PROTECTED_BRANCH'
  | 'GIT_FORCE_WITH_LEASE_REJECTED'
  | 'GIT_PUSH_FAILED'
  | 'GIT_REMOTE_UNAVAILABLE'
  | 'GIT_COMMIT_MESSAGE_INVALID'
  | 'GIT_NOTHING_TO_COMMIT'
  | 'GIT_COMMIT_FAILED'
  | 'GIT_FILE_PATH_INVALID'
  | 'GIT_FILE_NOT_FOUND'
  | 'GIT_FILE_OPERATION_NOT_ALLOWED'
  | 'GIT_FILE_MUTATION_FAILED';

export class GitMutationError extends Error {
  public constructor(public readonly code: GitMutationErrorCode, message: string) {
    super(message);
    this.name = 'GitMutationError';
  }
}

export interface StoredMutationConfirmation {
  token: string;
  projectId: string;
  operation: GitMutationOperation;
  target: string;
  expiresAt: number;
}
