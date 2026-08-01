import type { SyntaxTokenKind } from './types';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function renderText(value: string, query: string): string {
  const normalized = query.trim();
  if (!normalized) return escapeHtml(value);

  const expression = new RegExp(escapeRegExp(normalized), 'gi');
  let cursor = 0;
  let result = '';
  for (const match of value.matchAll(expression)) {
    const start = match.index ?? 0;
    result += escapeHtml(value.slice(cursor, start));
    result += `<mark>${escapeHtml(match[0] ?? '')}</mark>`;
    cursor = start + (match[0]?.length ?? 0);
  }
  return result + escapeHtml(value.slice(cursor));
}

export function renderToken(kind: SyntaxTokenKind | null, value: string, query: string): string {
  const content = renderText(value, query);
  return kind ? `<span class="git-syntax-${kind}">${content}</span>` : content;
}
