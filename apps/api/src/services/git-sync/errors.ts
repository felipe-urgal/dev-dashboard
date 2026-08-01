export type GitSyncErrorCode =
  | 'GIT_NOT_REPOSITORY'
  | 'GIT_REFERENCE_INVALID'
  | 'GIT_REFERENCE_NOT_FOUND'
  | 'GIT_BRANCH_NOT_FOUND'
  | 'GIT_REMOTE_NOT_CONFIGURED'
  | 'GIT_WORKING_TREE_DIRTY'
  | 'GIT_SYNC_CONFIRMATION_REQUIRED'
  | 'GIT_DETACHED_HEAD'
  | 'GIT_SYNC_CONFLICT'
  | 'GIT_SYNC_DIVERGED'
  | 'GIT_SYNC_FAILED';

export class GitSyncError extends Error {
  public constructor(
    public readonly code: GitSyncErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GitSyncError';
  }
}
