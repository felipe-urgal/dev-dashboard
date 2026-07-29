import { highlightGitPatch } from './utils/git-syntax-highlight';

const PATCH_SELECTOR = [
  '.git-summary-detail-diff pre',
  '.git-history-page-diff pre',
  '.git-stash-diff pre',
  'pre.git-commit-detail-patch',
  '.git-commit-detail-patch pre',
  'pre.git-history-page-patch',
  '.git-history-page-patch pre',
  'pre.git-stash-patch',
  '.git-stash-patch pre',
].join(', ');

const sourceByPatch = new WeakMap<HTMLElement, string>();

function looksLikePatch(value: string): boolean {
  return /^diff --git /m.test(value)
    || /^@@\s+-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@/m.test(value);
}

function enhancePatch(element: HTMLElement): void {
  const source = element.textContent ?? '';
  if (!source.trim() || !looksLikePatch(source)) return;
  if (sourceByPatch.get(element) === source) return;

  sourceByPatch.set(element, source);
  element.classList.add('git-syntax-patch');
  element.innerHTML = highlightGitPatch(source);
}

function scan(root: ParentNode = document): void {
  if (root instanceof HTMLElement && root.matches(PATCH_SELECTOR)) enhancePatch(root);
  root.querySelectorAll<HTMLElement>(PATCH_SELECTOR).forEach(enhancePatch);
}

function patchFromMutationTarget(target: Node): HTMLElement | null {
  const element = target instanceof HTMLElement ? target : target.parentElement;
  return element?.closest<HTMLElement>(PATCH_SELECTOR) ?? null;
}

export function installGitDiffSyntaxEnhancer(): void {
  if (typeof document === 'undefined') return;
  if (document.documentElement.dataset.gitDiffSyntax === 'true') return;
  document.documentElement.dataset.gitDiffSyntax = 'true';

  scan();
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const patch = patchFromMutationTarget(mutation.target);
      if (patch) enhancePatch(patch);
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) scan(node);
      }
    }
  });

  observer.observe(document.documentElement, {
    characterData: true,
    childList: true,
    subtree: true,
  });
}
