export interface GitCommitSummary {
  hash: string;
  shortHash: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
}

export interface GitCommitHistoryPage {
  branch: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  commits: GitCommitSummary[];
}

export interface GitCommitHistoryResponse {
  history: GitCommitHistoryPage;
}

export interface CommitDetailFile {
  path: string;
  previousPath?: string;
  status:
    'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'type-changed';
  additions: number;
  deletions: number;
  binary: boolean;
}

export interface CommitDetail extends GitCommitSummary {
  body: string;
  files: CommitDetailFile[];
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

export interface SummaryState {
  projectId: string;
  branch: string;
  commits: GitCommitSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  selectedHash: string;
  search: string;
  request: AbortController | undefined;
  historyRequest: AbortController | undefined;
  branchObserver: MutationObserver | undefined;
}
