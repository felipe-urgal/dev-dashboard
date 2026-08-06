import { isRedundantGitDiffHeaderLine } from './utils/git-diff-metadata';

const HEADER_ROW_SELECTOR = [
  '.git-diff-unified-row.is-meta',
  '.git-diff-split-meta',
  '.git-inline-diff-line.is-meta',
  '.git-inline-diff-split-meta.is-meta',
  '.git-syntax-patch-line.is-meta',
].join(', ');

function rowText(row: HTMLElement): string {
  const code = row.querySelector<HTMLElement>('.git-syntax-patch-code, code');
  return (code?.textContent ?? row.textContent ?? '').trim();
}

function removeAdjacentLineBreak(row: HTMLElement): void {
  const next = row.nextSibling;
  if (next?.nodeType === 3 && next.textContent?.startsWith('\n')) {
    next.textContent = next.textContent.slice(1);
    if (!next.textContent) next.remove();
    return;
  }

  const previous = row.previousSibling;
  if (previous?.nodeType === 3 && previous.textContent?.endsWith('\n')) {
    previous.textContent = previous.textContent.slice(0, -1);
    if (!previous.textContent) previous.remove();
  }
}

function removeHeaderRow(row: HTMLElement): void {
  const text = rowText(row);
  if (!isRedundantGitDiffHeaderLine(text)) return;
  removeAdjacentLineBreak(row);
  row.remove();
}

export function removeRedundantGitDiffHeaders(root: ParentNode): void {
  if (root instanceof HTMLElement && root.matches(HEADER_ROW_SELECTOR)) {
    removeHeaderRow(root);
  }
  root
    .querySelectorAll<HTMLElement>(HEADER_ROW_SELECTOR)
    .forEach(removeHeaderRow);
}

export function installGitDiffHeaderCleanup(): void {
  if (typeof document === 'undefined') return;
  if (document.documentElement.dataset.gitDiffHeaderCleanup === 'true') return;
  document.documentElement.dataset.gitDiffHeaderCleanup = 'true';

  removeRedundantGitDiffHeaders(document);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) removeRedundantGitDiffHeaders(node);
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}
