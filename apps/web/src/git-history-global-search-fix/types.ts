export type CompatibleTimer = number | ReturnType<typeof setTimeout>;

export interface HistorySearchState {
  search: string;
  author: string;
  kind: 'all' | 'regular' | 'merge';
  pendingFirstPage: boolean;
  debounceTimer: CompatibleTimer | undefined;
  total: number;
  returned: number;
}

export interface HistoryResponsePayload {
  history?: {
    total?: number;
    commits?: unknown[];
  };
}
