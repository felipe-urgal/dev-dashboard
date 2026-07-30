import {
  highlightGitDiffCode,
  highlightGitPatch,
} from './utils/git-syntax-highlight';

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

const CODE_SELECTOR = [
  '.git-diff-unified-row code',
  '.git-diff-side-cell code',
  '.git-inline-diff-line code',
  '.git-inline-diff-side code',
].join(', ');

const sourceByPatch = new WeakMap<HTMLElement, string>();
const stateByCode = new WeakMap<HTMLElement, string>();

function looksLikePatch(value: string): boolean {
  return /^diff --git /m.test(value)
    || /^@@\s+-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@/m.test(value);
}

function enhancePatch(element: HTMLElement): void {
  const source = element.dataset.rawPatch ?? element.textContent ?? '';
  if (!source.trim() || !looksLikePatch(source)) return;
  if (!element.dataset.rawPatch) element.dataset.rawPatch = source;
  if (sourceByPatch.get(element) === source) return;

  sourceByPatch.set(element, source);
  element.classList.add('git-syntax-patch');
  element.innerHTML = highlightGitPatch(source);
}

function syntaxContext(code: HTMLElement): { filePath: string; query: string } | null {
  const inline = code.closest<HTMLElement>('.git-inline-file-diff');
  if (inline) {
    const filePath = inline.querySelector<HTMLElement>(':scope > header code')?.textContent?.trim() ?? '';
    return filePath ? { filePath, query: '' } : null;
  }

  const page = code.closest<HTMLElement>('.git-diff-page');
  if (page) {
    const filePath = page.querySelector<HTMLElement>('.git-diff-selected-file h3')?.textContent?.trim() ?? '';
    const query = page.querySelector<HTMLInputElement>('.git-diff-content-search input')?.value ?? '';
    return filePath ? { filePath, query } : null;
  }

  return null;
}

function enhanceCode(code: HTMLElement): void {
  const context = syntaxContext(code);
  if (!context) return;
  const source = code.textContent ?? '';
  const state = `${context.filePath}\u0000${context.query}\u0000${source}`;
  if (stateByCode.get(code) === state) return;

  stateByCode.set(code, state);
  code.classList.add('git-syntax-code');
  code.innerHTML = highlightGitDiffCode(source, context.filePath, context.query);
}

function scan(root: ParentNode = document): void {
  if (root instanceof HTMLElement) {
    if (root.matches(PATCH_SELECTOR)) enhancePatch(root);
    if (root.matches(CODE_SELECTOR)) enhanceCode(root);
  }
  root.querySelectorAll<HTMLElement>(PATCH_SELECTOR).forEach(enhancePatch);
  root.querySelectorAll<HTMLElement>(CODE_SELECTOR).forEach(enhanceCode);
}

function closestFromMutationTarget(target: Node, selector: string): HTMLElement | null {
  const element = target instanceof HTMLElement ? target : target.parentElement;
  return element?.closest<HTMLElement>(selector) ?? null;
}

export function installGitDiffSyntaxEnhancer(): void {
  if (typeof document === 'undefined') return;
  if (document.documentElement.dataset.gitDiffSyntax === 'true') return;
  document.documentElement.dataset.gitDiffSyntax = 'true';

  scan();
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const patch = closestFromMutationTarget(mutation.target, PATCH_SELECTOR);
      if (patch) enhancePatch(patch);
      const code = closestFromMutationTarget(mutation.target, CODE_SELECTOR);
      if (code) enhanceCode(code);
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
