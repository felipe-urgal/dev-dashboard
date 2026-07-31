export type GitFileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked' | 'conflicted' | 'type-changed';
export interface GitFileChange { path: string; previousPath?: string; indexStatus: string; worktreeStatus: string; status: GitFileStatus; }
export interface GitCommit { hash: string; shortHash: string; subject: string; authorName: string; authorEmail: string; authoredAt: string; }
export interface GitStashEntry { index: number; message: string; createdAt: string; }

export type GitRemoteRole = 'origin' | 'upstream' | 'other';
export interface GitRemote {
  name: string;
  fetchUrl: string;
  pushUrl: string;
  role: GitRemoteRole;
}

export type GitBranchKind = 'local' | 'remote';
export interface GitBranch {
  name: string;
  shortName: string;
  kind: GitBranchKind;
  current: boolean;
  remote?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  latestCommit?: GitCommit;
}

export interface GitTrackingComparison {
  reference: string;
  ahead: number;
  behind: number;
}

export interface ProjectGitWorkspace {
  branches: GitBranch[];
  remotes: GitRemote[];
  originComparison?: GitTrackingComparison;
  upstreamComparison?: GitTrackingComparison;
}

export type GitSyncStrategy = 'ff-only' | 'rebase' | 'merge';

export interface GitSyncConfirmation {
  token: string;
  reference: string;
  strategy: GitSyncStrategy;
  expiresAt: string;
}

export interface GitSyncResult {
  branch: string;
  reference: string;
  strategy: GitSyncStrategy;
  changed: boolean;
  previousHead: string;
  currentHead: string;
}

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

export type GitMutationOperation = 'create-branch' | 'track-branch' | 'switch-branch' | 'pull' | 'push' | 'commit' | 'amend' | 'save' | 'stash-push' | 'stash-pop' | 'discard-file' | 'remove-untracked-file';

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

export interface GitFileLines {
  path: string;
  scope: GitDiffScope;
  start: number;
  end: number;
  totalLines: number;
  lines: string[];
  masked: boolean;
  redactionCount: number;
}


export type GitCommitFileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'type-changed';

export interface GitCommitDetailFile {
  path: string;
  previousPath?: string;
  status: GitCommitFileStatus;
  additions: number;
  deletions: number;
  binary: boolean;
}

export interface GitCommitDetails {
  hash: string;
  shortHash: string;
  subject: string;
  body: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  files: GitCommitDetailFile[];
  additions: number;
  deletions: number;
  patch: string;
  truncated: boolean;
  masked: boolean;
  redactionCount: number;
}

export interface GitCommitFileDiff {
  hash: string;
  path: string;
  status: GitCommitFileStatus;
  binary: boolean;
  content: string;
  truncated: boolean;
  masked: boolean;
  redactionCount: number;
}

export interface GitCommitHistoryEntry {
  hash: string;
  shortHash: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  parentCount: number;
}

export interface GitCommitHistoryPage {
  branch: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  commits: GitCommitHistoryEntry[];
}

export type GitCommitHistoryKind = 'all' | 'merge' | 'regular';

export type GitPullRequestProvider = 'github' | 'gitlab';

export interface GitPullRequestUrl {
  provider: GitPullRequestProvider;
  url: string;
  branch: string;
  defaultBranch: string;
}

export interface GitOpenPullRequest {
  provider: GitPullRequestProvider;
  number: number;
  title: string;
  url: string;
  sourceBranch: string;
  baseBranch: string;
}

export interface GitPullRequestLookup {
  checked: boolean;
  existing?: GitOpenPullRequest;
}
