export type GitUndoErrorCode =
  | 'GIT_NOT_REPOSITORY'
  | 'GIT_DETACHED_HEAD'
  | 'GIT_WORKING_TREE_DIRTY'
  | 'GIT_MUTATION_CONFIRMATION_REQUIRED'
  | 'GIT_FILE_PATH_INVALID'
  | 'GIT_FILE_NOT_FOUND'
  | 'GIT_COMMIT_FAILED'
  | 'GIT_COMMAND_FAILED';

export class GitUndoError extends Error {
  public constructor(
    public readonly code: GitUndoErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GitUndoError';
  }
}
