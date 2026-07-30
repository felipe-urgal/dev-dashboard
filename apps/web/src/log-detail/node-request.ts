import { appendHighlightedText, originalText, searchQuery } from './dom-helpers';
import type { NodeRequest, QueryParameter } from './types';

function parseNodeRequest(value: string): NodeRequest | null {
  const match = value.match(
    /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(.+?)\s+(\d{3})\s+in\s+([\d.]+)ms$/i,
  );
  if (!match) return null;

  return {
    method: match[1] ?? '',
    target: match[2] ?? '',
    status: match[3] ?? '',
    duration: match[4] ?? '',
  };
}

function parseRequestTarget(target: string): {
  pathname: string;
  parameters: QueryParameter[];
} {
  try {
    const url = new URL(target, 'http://dev-dashboard.local');
    const parameters: QueryParameter[] = [];

    for (const [key, value] of url.searchParams.entries()) {
      parameters.push({ key, value });
    }

    return {
      pathname: url.pathname || target.split('?')[0] || target,
      parameters,
    };
  } catch {
    const [pathname = target, queryString = ''] = target.split('?', 2);
    const parameters = Array.from(new URLSearchParams(queryString).entries())
      .map(([key, value]) => ({ key, value }));

    return { pathname, parameters };
  }
}

function buildParameters(
  parameters: QueryParameter[],
  target: string,
  query: string,
): HTMLDetailsElement {
  const details = document.createElement('details');
  details.className = 'enhanced-log-params';
  details.open = Boolean(query) && target.toLocaleLowerCase().includes(query.toLocaleLowerCase());

  const summary = document.createElement('summary');
  const count = document.createElement('span');
  count.className = 'enhanced-log-params-count';
  count.textContent = `${parameters.length} ${parameters.length === 1 ? 'parâmetro' : 'parâmetros'}`;
  const help = document.createElement('span');
  help.textContent = 'ver valores enviados';
  summary.append(count, help);

  const list = document.createElement('dl');
  for (const parameter of parameters) {
    const item = document.createElement('div');
    const key = document.createElement('dt');
    const value = document.createElement('dd');
    appendHighlightedText(key, parameter.key, query);
    appendHighlightedText(value, parameter.value || '(vazio)', query);
    item.append(key, value);
    list.append(item);
  }

  details.append(summary, list);
  return details;
}

export function decorateNodeRequest(line: HTMLElement): void {
  if (!line.classList.contains('enhanced-log-request')) return;

  const request = parseNodeRequest(originalText(line));
  if (!request || !request.target.includes('?')) return;

  const { pathname, parameters } = parseRequestTarget(request.target);
  if (!parameters.length) return;

  const query = searchQuery();
  const existing = line.querySelector<HTMLElement>('.enhanced-log-params');
  const renderKey = `${request.target}\u0000${query}`;
  if (existing?.dataset.renderKey === renderKey) return;
  existing?.remove();

  const path = line.querySelector<HTMLElement>('.enhanced-log-path');
  if (path) {
    path.replaceChildren();
    appendHighlightedText(path, pathname, query);
    path.title = request.target;
  }

  const details = buildParameters(parameters, request.target, query);
  details.dataset.renderKey = renderKey;
  line.classList.add('enhanced-log-request-with-params');
  line.append(details);
}
