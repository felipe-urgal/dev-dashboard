export type GitStashErrorCode =
  | 'GIT_NOT_REPOSITORY'
  | 'GIT_WORKING_TREE_DIRTY'
  | 'GIT_NOTHING_TO_STASH'
  | 'GIT_STASH_REFERENCE_INVALID'
  | 'GIT_STASH_NOT_FOUND'
  | 'GIT_STASH_CONFIRMATION_REQUIRED'
  | 'GIT_STASH_PUSH_FAILED'
  | 'GIT_STASH_APPLY_FAILED'
  | 'GIT_STASH_POP_FAILED'
  | 'GIT_STASH_DROP_FAILED'
  | 'GIT_STASH_CONFLICT';

export class GitStashError extends Error {
  public constructor(
    public readonly code: GitStashErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GitStashError';
  }
}
