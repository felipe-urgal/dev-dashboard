export type GitCommitFileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'type-changed';

export type GitCommitHistoryKind = 'all' | 'merge' | 'regular';

export interface GitCommitHistoryFilters {
  search?: string;
  author?: string;
  kind?: GitCommitHistoryKind;
}

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
