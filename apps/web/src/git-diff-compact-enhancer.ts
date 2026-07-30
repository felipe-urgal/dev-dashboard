export { splitLeadingPatchMetadata } from './git-diff-compact/patch-metadata';
export type { LeadingPatchMetadata } from './git-diff-compact/types';

import { updateFilters } from './git-diff-compact/filters';
import { updatePatchMetadata } from './git-diff-compact/patch-metadata';
import { updateCompactSummary } from './git-diff-compact/summary';

function enhancePage(page: HTMLElement): void {
  updateCompactSummary(page);
  updateFilters(page);
  updatePatchMetadata(page);
}

let scheduled = false;

function scan(): void {
  scheduled = false;
  document.querySelectorAll<HTMLElement>('.git-diff-page').forEach(enhancePage);
}

function scheduleScan(): void {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(scan);
}

export function installGitDiffCompactEnhancer(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (document.documentElement.dataset.gitDiffCompactEnhancer === 'true') return;
  document.documentElement.dataset.gitDiffCompactEnhancer = 'true';

  scheduleScan();
  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}
