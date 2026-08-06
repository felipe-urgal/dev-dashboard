import { CODE_SELECTOR, PATCH_SELECTOR } from './git-diff-syntax/constants';
import { enhanceCode } from './git-diff-syntax/code';
import { enhancePatch } from './git-diff-syntax/patch';

function scan(root: ParentNode = document): void {
  if (root instanceof HTMLElement) {
    if (root.matches(PATCH_SELECTOR)) enhancePatch(root);
    if (root.matches(CODE_SELECTOR)) enhanceCode(root);
  }
  root.querySelectorAll<HTMLElement>(PATCH_SELECTOR).forEach(enhancePatch);
  root.querySelectorAll<HTMLElement>(CODE_SELECTOR).forEach(enhanceCode);
}

function closestFromMutationTarget(
  target: Node,
  selector: string,
): HTMLElement | null {
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
