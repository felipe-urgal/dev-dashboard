export interface GitOverviewResponse {
  git: {
    branch?: string;
    detached: boolean;
    files: Array<{ path: string }>;
  };
}

export interface GitStashSummary {
  index: number;
  reference: string;
  hash: string;
  message: string;
  branch: string;
  createdAt: string;
  fileCount: number;
  additions: number;
  deletions: number;
  includesUntracked: boolean;
}

export interface GitStashFile {
  path: string;
  previousPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked' | 'conflicted' | 'type-changed';
  additions: number;
  deletions: number;
  binary: boolean;
}

export interface GitStashDetail extends GitStashSummary {
  files: GitStashFile[];
  patch: string;
  truncated: boolean;
  masked: boolean;
  redactionCount: number;
}

export interface StashListResponse {
  stashes: GitStashSummary[];
}

export interface StashDetailResponse {
  detail: GitStashDetail;
}

export interface ConfirmationResponse {
  confirmation: {
    token: string;
  };
}

export interface MutationResponse {
  result: {
    stash: GitStashSummary;
    applied: boolean;
    removed: boolean;
  };
}

export type StashOperation = 'create' | 'apply' | 'pop' | 'drop';

export interface StashPageState {
  projectId: string;
  branch: string;
  detached: boolean;
  changedFiles: number;
  stashes: GitStashSummary[];
  selectedReference: string;
  detail: GitStashDetail | null;
  busy: boolean;
  listRequest: AbortController | undefined;
  detailRequest: AbortController | undefined;
}

export interface PersistedNotice {
  message: string;
  selectedReference?: string;
}
