import { enhance } from './git-history-inline-diff-fix/enhance';

function scan(root: ParentNode = document): void {
  if (root instanceof HTMLElement && root.matches('.git-history-page-detail')) enhance(root);
  root.querySelectorAll<HTMLElement>('.git-history-page-detail').forEach(enhance);
}

export function installGitHistoryInlineDiffFix(): void {
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
