export class GitCommitDetailsError extends Error {
  public constructor(
    public readonly code:
      | 'GIT_COMMIT_INVALID'
      | 'GIT_COMMIT_NOT_FOUND'
      | 'GIT_COMMIT_FILE_NOT_FOUND'
      | 'GIT_NOT_REPOSITORY',
    message: string,
  ) {
    super(message);
    this.name = 'GitCommitDetailsError';
  }
}
