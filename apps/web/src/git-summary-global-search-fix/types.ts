export interface CommitSummary {
  hash: string;
  shortHash: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
}

export interface HistoryResponse {
  history: {
    branch: string;
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    commits: CommitSummary[];
  };
}

export interface CommitFile {
  path: string;
  previousPath?: string;
  status:
    'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'type-changed';
  additions: number;
  deletions: number;
  binary: boolean;
}

export interface CommitDetail extends CommitSummary {
  body: string;
  files: CommitFile[];
  additions: number;
  deletions: number;
  patch: string;
  truncated: boolean;
  masked: boolean;
  redactionCount: number;
}

export interface DetailResponse {
  detail: CommitDetail;
}

export interface OriginalSnapshot {
  listNodes: Node[];
  detailNodes: Node[];
  countText: string;
  pageLabel: string;
  previousDisabled: boolean;
  nextDisabled: boolean;
  inspecting: boolean;
}

export interface SummarySearchState {
  projectId: string;
  query: string;
  branch: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  commits: CommitSummary[];
  selectedHash: string;
  debounceTimer: number | undefined;
  historyRequest: AbortController | undefined;
  detailRequest: AbortController | undefined;
  snapshot: OriginalSnapshot | undefined;
}
