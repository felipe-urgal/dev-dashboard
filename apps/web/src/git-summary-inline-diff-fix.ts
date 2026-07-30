import { enhance } from './git-summary-inline-diff-fix/enhance';

function scan(): void {
  document.querySelectorAll<HTMLElement>('.git-summary-commit-detail').forEach(enhance);
}

export function installGitSummaryInlineDiffFix(): void {
  if (typeof document === 'undefined') return;
  scan();

  let scheduled = false;
  const scheduleScan = (): void => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      scan();
    });
  };

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
