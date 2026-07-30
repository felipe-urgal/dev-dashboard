import { projectIdFromLocation } from './dom-helpers';
import type { SummarySearchState } from './types';

export const stateBySection = new WeakMap<HTMLElement, SummarySearchState>();

export function stateFor(section: HTMLElement): SummarySearchState {
  const existing = stateBySection.get(section);
  if (existing) return existing;
  const state: SummarySearchState = {
    projectId: projectIdFromLocation(),
    query: '',
    branch: '',
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
    commits: [],
    selectedHash: '',
    debounceTimer: undefined,
    historyRequest: undefined,
    detailRequest: undefined,
    snapshot: undefined,
  };
  stateBySection.set(section, state);
  return state;
}
