import { sqlFunctions, sqlKeywords } from './constants';
import { rememberOriginalText } from './dom-helpers';
import { appendHighlightedText, getActiveSearchQuery } from './search';

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

function appendSqlStatement(parent: HTMLElement, statement: string): void {
  const tokenPattern = /(`[^`]*`|'(?:''|[^'])*'|"(?:\\"|[^"])*"|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_$]*\b|[(),.=<>!*+\-/]+|\s+|.)/g;

  for (const match of statement.matchAll(tokenPattern)) {
    const token = match[0];
    const className = sqlTokenClass(token);
    appendHighlightedText(parent, token, className);
  }
}

export function decorateSqlLine(line: HTMLElement): void {
  const value = rememberOriginalText(line);
  const match = value.match(/^(.+?)\s+\(([\d.]+)ms\)\s+((?:SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK)\b.*)$/i);
  if (!match) return;

  line.dataset.logEnhanced = 'true';
  const [, label = 'SQL', duration = '', statement = ''] = match;
  const operation = statement.match(/^(SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK)/i)?.[1]?.toUpperCase() ?? 'SQL';
  const matchesSearch = Boolean(getActiveSearchQuery()) && value.toLocaleLowerCase().includes(getActiveSearchQuery().toLocaleLowerCase());

  line.classList.toggle('enhanced-search-match', matchesSearch);
  line.replaceChildren();

  const header = document.createElement('span');
  header.className = 'enhanced-sql-header';

  const operationBadge = document.createElement('span');
  operationBadge.className = `enhanced-sql-operation enhanced-sql-${operation.toLowerCase()}`;
  operationBadge.textContent = operation;

  const labelNode = document.createElement('strong');
  appendHighlightedText(labelNode, label);

  const durationNode = document.createElement('span');
  durationNode.className = Number(duration) >= 10
    ? 'enhanced-sql-duration enhanced-log-slow'
    : 'enhanced-sql-duration';
  durationNode.textContent = `${duration}ms`;

  const sqlNode = document.createElement('span');
  sqlNode.className = 'enhanced-sql-statement';
  appendSqlStatement(sqlNode, statement);

  header.append(operationBadge, labelNode, durationNode);
  line.append(header, sqlNode);
}
