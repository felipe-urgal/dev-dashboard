import type { RailsLogLine } from './rails-log-parser';

const KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL',
  'LEFT', 'RIGHT', 'INNER', 'OUTER', 'JOIN', 'ON', 'ORDER', 'BY', 'GROUP',
  'HAVING', 'LIMIT', 'OFFSET', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET',
  'DELETE', 'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'RELEASE', 'AS',
  'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'LIKE', 'BETWEEN',
  'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'ASC', 'DESC', 'UNION',
  'ALL', 'TRANSACTION', 'TO', 'USING',
];

const TOKEN_PATTERN = new RegExp(
  '(`[^`]*`)' +
    "|('(?:[^'\\\\]|\\\\.)*')" +
    '|(\\b\\d+(?:\\.\\d+)?\\b)' +
    '|(\\?)' +
    `|(\\b(?:${KEYWORDS.join('|')})\\b)`,
  'gi',
);

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Renders a single SQL statement as HTML with token-colored spans (already HTML-escaped). */
export function highlightSqlHtml(text: string): string {
  let result = '';
  let lastIndex = 0;
  TOKEN_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = TOKEN_PATTERN.exec(text))) {
    result += escapeHtml(text.slice(lastIndex, match.index));
    const [full, ident, str, num, placeholder, keyword] = match;

    if (ident) result += `<span class="sql-tk-ident">${escapeHtml(ident)}</span>`;
    else if (str) result += `<span class="sql-tk-str">${escapeHtml(str)}</span>`;
    else if (num) result += `<span class="sql-tk-num">${escapeHtml(num)}</span>`;
    else if (placeholder) result += `<span class="sql-tk-num">?</span>`;
    else if (keyword) result += `<span class="sql-tk-kw">${escapeHtml(keyword.toUpperCase())}</span>`;

    lastIndex = match.index + full.length;
  }

  result += escapeHtml(text.slice(lastIndex));
  return result;
}

export interface SqlLineMeta {
  label: string | undefined;
  durationMs: number | undefined;
  sql: string;
}

/** Splits a Rails SQL log line like `Site Load (0.3ms)  SELECT ...` into its parts. */
export function parseSqlLine(text: string): SqlLineMeta {
  const match = text.match(/^(.*?)\s*\(([\d.]+)ms\)\s*(.*)$/);

  if (!match) return { label: undefined, durationMs: undefined, sql: text };

  return {
    label: match[1] || undefined,
    durationMs: Number(match[2]),
    sql: match[3] ?? '',
  };
}

function normalizeSqlPattern(sql: string): string {
  return sql
    .replace(/'(?:[^'\\]|\\.)*'/g, '?')
    .replace(/\b\d+(?:\.\d+)?\b/g, '?')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SqlGroup {
  pattern: string;
  label: string | undefined;
  count: number;
  totalMs: number;
  avgMs: number;
  n1Suspect: boolean;
  lines: RailsLogLine[];
}

/** Groups a request's SQL lines by normalized statement shape, surfacing likely N+1 queries. */
export function groupSqlLines(sqlLines: RailsLogLine[]): SqlGroup[] {
  const groups = new Map<string, SqlGroup>();

  for (const line of sqlLines) {
    const { label, durationMs, sql } = parseSqlLine(line.text);
    const pattern = normalizeSqlPattern(sql);
    const key = `${label ?? ''}::${pattern}`;

    let group = groups.get(key);
    if (!group) {
      group = {
        pattern,
        label,
        count: 0,
        totalMs: 0,
        avgMs: 0,
        n1Suspect: false,
        lines: [],
      };
      groups.set(key, group);
    }

    group.count += 1;
    group.totalMs += durationMs ?? 0;
    group.lines.push(line);
  }

  const result = [...groups.values()].map((group) => ({
    ...group,
    avgMs: group.count ? group.totalMs / group.count : 0,
    n1Suspect: group.count >= 3,
  }));

  result.sort((a, b) => {
    if (a.n1Suspect !== b.n1Suspect) return a.n1Suspect ? -1 : 1;
    return b.totalMs - a.totalMs;
  });

  return result;
}
