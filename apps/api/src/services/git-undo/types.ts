export type GitUndoOperation = 'commit' | 'file';
export type GitUndoStrategy = 'reset' | 'revert';

export interface CommitSummary {
  hash: string;
  shortHash: string;
  subject: string;
}

export interface GitUndoConfirmation {
  token: string;
  operation: GitUndoOperation;
  target: string;
  expiresAt: string;
}

export interface GitUndoCommitResult {
  strategy: GitUndoStrategy;
  undone: CommitSummary;
  result?: CommitSummary;
}
