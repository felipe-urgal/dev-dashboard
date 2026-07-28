export type GitFileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked' | 'conflicted' | 'type-changed';
export interface GitFileChange { path: string; previousPath?: string; indexStatus: string; worktreeStatus: string; status: GitFileStatus; }
export interface GitCommit { hash: string; shortHash: string; subject: string; authorName: string; authorEmail: string; authoredAt: string; }
export interface GitStashEntry { index: number; message: string; createdAt: string; }
export interface ProjectGitOverview { repository: boolean; branch?: string; detached: boolean; upstream?: string; ahead: number; behind: number; clean: boolean; files: GitFileChange[]; latestCommit?: GitCommit; recentCommits: GitCommit[]; stashes: GitStashEntry[]; }

export type GitDiffScope = 'worktree' | 'index' | 'combined';

export interface GitDiffFile {
  path: string;
  previousPath?: string;
  status: GitFileStatus;
  additions: number;
  deletions: number;
  binary: boolean;
}

export interface GitDiffSnapshot {
  repository: boolean;
  scope: GitDiffScope;
  files: GitDiffFile[];
}

export type GitMutationOperation = 'create-branch' | 'switch-branch' | 'pull' | 'push' | 'commit' | 'save' | 'stash-push' | 'stash-pop';

export interface GitMutationConfirmation {
  token: string;
  operation: GitMutationOperation;
  target: string;
  expiresAt: string;
}

export interface GitCommitResult { hash: string; shortHash: string; subject: string; }

export interface GitFileDiff {
  path: string;
  scope: GitDiffScope;
  status: GitFileStatus;
  binary: boolean;
  content: string;
  truncated: boolean;
  masked: boolean;
  redactionCount: number;
}
