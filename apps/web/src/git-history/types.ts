export interface GitBranch {
  name: string;
  shortName: string;
  kind: 'local' | 'remote';
  current: boolean;
  remote?: string;
}

export interface GitWorkspaceResponse {
  workspace: {
    branches: GitBranch[];
  };
}

export interface GitHistoryCommit {
  hash: string;
  shortHash: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  parentCount: number;
}

export interface GitHistoryPage {
  branch: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  commits: GitHistoryCommit[];
}

export interface GitHistoryResponse {
  history: GitHistoryPage;
}

export interface CommitFile {
  path: string;
  previousPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'type-changed';
  additions: number;
  deletions: number;
  binary: boolean;
}

export interface CommitDetail extends Omit<GitHistoryCommit, 'parentCount'> {
  body: string;
  files: CommitFile[];
  additions: number;
  deletions: number;
  patch: string;
  truncated: boolean;
  masked: boolean;
  redactionCount: number;
}

export interface CommitDetailResponse {
  detail: CommitDetail;
}

export type HistoryCommitKind = 'all' | 'merge' | 'regular';

export interface HistoryPageState {
  projectId: string;
  reference: string;
  resolvedReference: string;
  branches: GitBranch[];
  commits: GitHistoryCommit[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  search: string;
  author: string;
  kind: HistoryCommitKind;
  selectedHash: string;
  copiedHash: string;
  historyRequest: AbortController | undefined;
  detailRequest: AbortController | undefined;
}
