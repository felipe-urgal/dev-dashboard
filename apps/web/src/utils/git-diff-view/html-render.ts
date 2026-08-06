import type { GitDiffLineRenderOptions } from './types';

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

export function highlightGitDiffText(text: string, query: string): string {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return escapeHtml(text);

  const expression = new RegExp(escapeRegExp(normalizedQuery), 'gi');
  let result = '';
  let cursor = 0;

  for (const match of text.matchAll(expression)) {
    const start = match.index ?? 0;
    result += escapeHtml(text.slice(cursor, start));
    result += `<mark>${escapeHtml(match[0] ?? '')}</mark>`;
    cursor = start + (match[0]?.length ?? 0);
  }

  result += escapeHtml(text.slice(cursor));
  return result;
}

/**
 * Renderiza uma linha combinando as três camadas de destaque possíveis: o
 * realce de sintaxe, o trecho alterado em relação à linha oposta e as
 * ocorrências da busca dentro do diff.
 */
export function renderGitDiffLineHtml(
  text: string,
  options: GitDiffLineRenderOptions = {},
): string {
  const words = options.words ?? [];
  const syntax = options.syntax ?? [];
  const query = options.query?.trim() ?? '';
  if (words.length === 0 && syntax.length === 0)
    return highlightGitDiffText(text, query);

  const changed = new Array<boolean>(text.length).fill(false);
  for (const range of words) {
    for (
      let index = Math.max(0, range.start);
      index < Math.min(range.end, text.length);
      index += 1
    ) {
      changed[index] = true;
    }
  }

  const tokens = new Array<string>(text.length).fill('');
  for (const range of syntax) {
    for (
      let index = Math.max(0, range.start);
      index < Math.min(range.end, text.length);
      index += 1
    ) {
      tokens[index] = range.className;
    }
  }

  const matched = new Array<boolean>(text.length).fill(false);
  if (query) {
    const expression = new RegExp(escapeRegExp(query), 'gi');
    for (const match of text.matchAll(expression)) {
      const start = match.index ?? 0;
      for (
        let index = start;
        index < start + (match[0]?.length ?? 0);
        index += 1
      ) {
        matched[index] = true;
      }
    }
  }

  let html = '';
  let cursor = 0;
  while (cursor < text.length) {
    const isChanged = changed[cursor];
    const isMatch = matched[cursor];
    const token = tokens[cursor];
    let end = cursor + 1;
    while (
      end < text.length &&
      changed[end] === isChanged &&
      matched[end] === isMatch &&
      tokens[end] === token
    )
      end += 1;

    const chunk = escapeHtml(text.slice(cursor, end));
    const classes = [token, isChanged ? 'git-diff-word' : '']
      .filter(Boolean)
      .join(' ');
    if (isMatch)
      html += `<mark${classes ? ` class="${classes}"` : ''}>${chunk}</mark>`;
    else if (classes) html += `<span class="${classes}">${chunk}</span>`;
    else html += chunk;
    cursor = end;
  }

  return html;
}

export function countGitDiffMatches(content: string, query: string): number {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return 0;
  const expression = new RegExp(escapeRegExp(normalizedQuery), 'gi');
  return Array.from(content.matchAll(expression)).length;
}
