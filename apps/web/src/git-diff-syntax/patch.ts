import { highlightGitPatch } from '../utils/git-syntax-highlight';
import { sourceByPatch } from './state';

function looksLikePatch(value: string): boolean {
  return /^diff --git /m.test(value)
    || /^@@\s+-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@/m.test(value);
}

export function enhancePatch(element: HTMLElement): void {
  const source = element.dataset.rawPatch ?? element.textContent ?? '';
  if (!source.trim() || !looksLikePatch(source)) return;
  if (!element.dataset.rawPatch) element.dataset.rawPatch = source;
  if (sourceByPatch.get(element) === source) return;

  sourceByPatch.set(element, source);
  element.classList.add('git-syntax-patch');
  element.innerHTML = highlightGitPatch(source);
}
