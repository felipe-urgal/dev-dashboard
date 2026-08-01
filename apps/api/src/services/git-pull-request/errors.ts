export type GitPullRequestErrorCode =
  | 'GIT_NOT_REPOSITORY'
  | 'GIT_DETACHED_HEAD'
  | 'GIT_REMOTE_NOT_CONFIGURED'
  | 'GIT_PULL_REQUEST_NOT_PUBLISHED'
  | 'GIT_PULL_REQUEST_BRANCH_IS_DEFAULT'
  | 'GIT_PULL_REQUEST_REMOTE_UNSUPPORTED'
  | 'GIT_PULL_REQUEST_BASE_NOT_FOUND';

export class GitPullRequestError extends Error {
  public constructor(
    public readonly code: GitPullRequestErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GitPullRequestError';
  }
}
