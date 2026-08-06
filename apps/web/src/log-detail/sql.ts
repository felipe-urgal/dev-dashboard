import { sqlFunctions, sqlKeywords } from './constants';
import {
  appendHighlightedText,
  originalText,
  searchQuery,
} from './dom-helpers';

function sqlTokenClass(token: string): string | undefined {
  const upper = token.toUpperCase();

  if (sqlKeywords.has(upper)) return 'sql-token sql-token-keyword';
  if (sqlFunctions.has(upper)) return 'sql-token sql-token-function';
  if (/^`[^`]*`$/.test(token)) return 'sql-token sql-token-identifier';
  if (/^'(?:''|[^'])*'$/.test(token) || /^"(?:\\"|[^"])*"$/.test(token)) {
    return 'sql-token sql-token-string';
  }
  if (/^\d+(?:\.\d+)?$/.test(token)) return 'sql-token sql-token-number';
  if (/^[(),.=<>!*+\-/]+$/.test(token)) return 'sql-token sql-token-operator';

  return undefined;
}

function appendSql(
  parent: HTMLElement,
  statement: string,
  query: string,
): void {
  const pattern =
    /(`[^`]*`|'(?:''|[^'])*'|"(?:\\"|[^"])*"|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_$]*\b|[(),.=<>!*+\-/]+|\s+|.)/g;

  for (const match of statement.matchAll(pattern)) {
    const token = match[0];
    appendHighlightedText(parent, token, query, sqlTokenClass(token));
  }
}

function splitRawSql(value: string): {
  prefix: string;
  statement: string;
  operation: string;
} | null {
  const match = value.match(
    /^(.*?)(\b(?:SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK)\b[\s\S]*)$/i,
  );
  if (!match) return null;

  const statement = match[2]?.trimStart() ?? '';
  const operation = statement
    .match(/^(SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK)/i)?.[1]
    ?.toUpperCase();
  if (!statement || !operation) return null;

  return {
    prefix: match[1]?.trimEnd() ?? '',
    statement,
    operation,
  };
}

export function decorateRawSql(line: HTMLElement): void {
  if (!line.classList.contains('project-log-line-sql')) return;

  const value = originalText(line);
  const parsed = splitRawSql(value);
  if (!parsed) return;

  const query = searchQuery();
  const renderKey = `${value}\u0000${query}`;
  if (line.dataset.rawSqlRenderKey === renderKey) return;
  line.dataset.rawSqlRenderKey = renderKey;

  line.replaceChildren();
  line.classList.add('enhanced-log-raw-sql');

  const metadata = document.createElement('span');
  metadata.className = 'enhanced-log-raw-sql-meta';

  const operation = document.createElement('span');
  operation.className = `enhanced-sql-operation enhanced-sql-${parsed.operation.toLowerCase()}`;
  operation.textContent = parsed.operation;
  metadata.append(operation);

  if (parsed.prefix) {
    appendHighlightedText(
      metadata,
      parsed.prefix,
      query,
      'enhanced-log-sql-prefix',
    );
  }

  const statement = document.createElement('span');
  statement.className = 'enhanced-log-raw-sql-statement';
  appendSql(statement, parsed.statement, query);

  line.append(metadata, statement);
}
