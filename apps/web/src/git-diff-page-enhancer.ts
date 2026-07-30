import { cleanup, enhanceDiffSection } from './git-diff-page/lifecycle';

function scan(root: ParentNode = document): void {
  if (root instanceof HTMLElement) enhanceDiffSection(root);
  root.querySelectorAll<HTMLElement>('.git-tab-page').forEach(enhanceDiffSection);
}

export function installGitDiffPageEnhancer(): void {
  if (typeof document === 'undefined') return;
  scan(document);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach(cleanup);
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) scan(node);
      });
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}
