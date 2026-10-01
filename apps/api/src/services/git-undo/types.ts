export type GitUndoOperation = 'commit' | 'file';
export type GitUndoStrategy = 'reset' | 'revert';
export type GitUndoCommitBlockedReason =
  'no-commit' | 'first-commit' | 'detached' | 'dirty' | 'behind' | 'diverged';

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

export interface GitUndoCommitStatus {
  available: boolean;
  branch?: string;
  strategy?: GitUndoStrategy;
  reason?: GitUndoCommitBlockedReason;
  reference?: string;
}

export interface GitUndoCommitResult {
  strategy: GitUndoStrategy;
  undone: CommitSummary;
  result?: CommitSummary;
}
