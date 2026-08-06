import { highlightGitDiffCode } from '../utils/git-syntax-highlight';
import { stateByCode } from './state';

function syntaxContext(
  code: HTMLElement,
): { filePath: string; query: string } | null {
  const inline = code.closest<HTMLElement>('.git-inline-file-diff');
  if (inline) {
    const filePath =
      inline
        .querySelector<HTMLElement>(':scope > header code')
        ?.textContent?.trim() ?? '';
    return filePath ? { filePath, query: '' } : null;
  }

  const page = code.closest<HTMLElement>('.git-diff-page');
  if (page) {
    const filePath =
      page
        .querySelector<HTMLElement>('.git-diff-selected-file h3')
        ?.textContent?.trim() ?? '';
    const query =
      page.querySelector<HTMLInputElement>('.git-diff-content-search input')
        ?.value ?? '';
    return filePath ? { filePath, query } : null;
  }

  return null;
}

export function enhanceCode(code: HTMLElement): void {
  const context = syntaxContext(code);
  if (!context) return;
  const source = code.textContent ?? '';
  const state = `${context.filePath}\u0000${context.query}\u0000${source}`;
  if (stateByCode.get(code) === state) return;

  stateByCode.set(code, state);
  code.classList.add('git-syntax-code');
  code.innerHTML = highlightGitDiffCode(
    source,
    context.filePath,
    context.query,
  );
}
