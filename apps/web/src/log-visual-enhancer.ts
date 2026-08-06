import { decorateRawLine } from './log-visual/line-decorators';
import { decorateRailsCards } from './log-visual/rails-cards';
import { setActiveSearchQuery } from './log-visual/search';

function enhance(root: ParentNode = document): void {
  root
    .querySelectorAll<HTMLElement>('.project-log-raw-lines .project-log-line')
    .forEach(decorateRawLine);
  decorateRailsCards(root);
}

function refreshSearchQuery(): void {
  const input = document.querySelector<HTMLInputElement>(
    '.project-log-search input',
  );
  setActiveSearchQuery(input?.value.trim() ?? '');
  enhance(document);
}

export function installLogVisualEnhancer(): void {
  if (typeof document === 'undefined') return;

  refreshSearchQuery();

  document.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches('.project-log-search input')) return;

    setActiveSearchQuery(target.value.trim());
    queueMicrotask(() => enhance(document));
  });

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) enhance(node);
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}
