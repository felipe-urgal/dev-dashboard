import { control } from './dom-helpers';
import type { HistorySearchState } from './types';

export const stateBySection = new WeakMap<HTMLElement, HistorySearchState>();

export function stateFor(section: HTMLElement): HistorySearchState {
  const existing = stateBySection.get(section);
  if (existing) return existing;
  const state: HistorySearchState = {
    search: control<HTMLInputElement>(section, 'search')?.value ?? '',
    author: control<HTMLSelectElement>(section, 'author')?.value ?? '',
    kind: (control<HTMLSelectElement>(section, 'kind')?.value as HistorySearchState['kind']) || 'all',
    pendingFirstPage: false,
    debounceTimer: undefined,
    total: 0,
    returned: 0,
  };
  stateBySection.set(section, state);
  return state;
}
