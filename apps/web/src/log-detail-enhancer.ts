import { RAW_LINE_SELECTOR, SEARCH_INPUT_SELECTOR } from './log-detail/constants';
import { decorateNodeRequest } from './log-detail/node-request';
import { decorateRawSql } from './log-detail/sql';

function enhanceLine(line: HTMLElement): void {
  decorateNodeRequest(line);
  decorateRawSql(line);
}

function enhance(root: ParentNode = document): void {
  if (root instanceof HTMLElement && root.matches(RAW_LINE_SELECTOR)) {
    enhanceLine(root);
  }

  root.querySelectorAll<HTMLElement>(RAW_LINE_SELECTOR).forEach(enhanceLine);
}

export function installLogDetailEnhancer(): void {
  if (typeof document === 'undefined') return;

  enhance(document);

  document.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches(SEARCH_INPUT_SELECTOR)) return;
    queueMicrotask(() => enhance(document));
  });

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        const line = node.closest<HTMLElement>(RAW_LINE_SELECTOR);
        enhance(line ?? node);
      }
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
}
