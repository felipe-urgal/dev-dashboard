import { enhancedAttribute } from './log-visual/constants';
import { decorateRawLine } from './log-visual/line-decorators';
import { decorateRailsCards } from './log-visual/rails-cards';
import { decorateRenderLine } from './log-visual/render-line';
import { setActiveSearchQuery } from './log-visual/search';
import { decorateSqlLine } from './log-visual/sql';

function enhance(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('.project-log-raw-lines .project-log-line').forEach(decorateRawLine);
  root.querySelectorAll<HTMLElement>('.rails-sql-lines code.rails-detail-sql').forEach(decorateSqlLine);
  root.querySelectorAll<HTMLElement>('.rails-request-details details:nth-of-type(2) .rails-detail-lines code').forEach(decorateRenderLine);

  root.querySelectorAll<HTMLElement>('.rails-request-details details').forEach((details) => {
    if (details.getAttribute(enhancedAttribute) === 'true') return;
    details.setAttribute(enhancedAttribute, 'true');
    const summary = details.querySelector('summary');
    const lines = details.querySelectorAll('.rails-detail-lines code');
    if (summary && lines.length > 8) summary.classList.add('enhanced-detail-summary');
  });

  decorateRailsCards(root);
}

function refreshSearchQuery(): void {
  const input = document.querySelector<HTMLInputElement>('.project-log-search input');
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

  observer.observe(document.documentElement, { childList: true, subtree: true });
}
