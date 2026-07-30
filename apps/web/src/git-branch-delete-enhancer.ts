import { enhancePanel } from './git-branch-delete/enhance';

function scan(root: ParentNode = document): void {
  if (root instanceof HTMLElement && root.matches('.git-branches-page .branch-detail-panel')) {
    enhancePanel(root);
  }
  root.querySelectorAll<HTMLElement>('.git-branches-page .branch-detail-panel').forEach(enhancePanel);
}

export function installGitBranchDeleteEnhancer(): void {
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
  observer.observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true,
  });
}
