import type { ViewMode } from './types';

const MODE_KEY = 'dev-dashboard-git-inline-diff-mode';

export function readMode(): ViewMode {
  try {
    return window.localStorage.getItem(MODE_KEY) === 'split'
      ? 'split'
      : 'unified';
  } catch {
    return 'unified';
  }
}

export function saveMode(mode: ViewMode): void {
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Preferência visual opcional.
  }
}
