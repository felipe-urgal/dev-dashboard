const RAW_LINE_SELECTOR = '.project-log-raw-lines .project-log-line';
const SEARCH_INPUT_SELECTOR = '.project-log-search input';

const sqlKeywords = new Set([
  'ALL', 'AND', 'AS', 'ASC', 'BEGIN', 'BETWEEN', 'BY', 'CASE', 'COMMIT',
  'DELETE', 'DESC', 'DISTINCT', 'ELSE', 'END', 'EXISTS', 'FALSE', 'FROM',
  'FULL', 'GROUP', 'HAVING', 'IN', 'INNER', 'INSERT', 'INTO', 'IS', 'JOIN',
  'LEFT', 'LIKE', 'LIMIT', 'NOT', 'NULL', 'OFFSET', 'ON', 'OR', 'ORDER',
  'OUTER', 'RIGHT', 'ROLLBACK', 'SELECT', 'SET', 'THEN', 'TRUE', 'UNION',
  'UPDATE', 'VALUES', 'WHEN', 'WHERE',
]);

const sqlFunctions = new Set([
  'AVG', 'COALESCE', 'COUNT', 'MAX', 'MIN', 'SUM',
]);

interface NodeRequest {
  method: string;
  target: string;
  status: string;
  duration: string;
}

interface QueryParameter {
  key: string;
  value: string;
}

function searchQuery(): string {
  return document.querySelector<HTMLInputElement>(SEARCH_INPUT_SELECTOR)?.value.trim() ?? '';
}

function originalText(line: HTMLElement): string {
  return line.dataset.logOriginalText ?? line.textContent?.trim() ?? '';
}

function appendHighlightedText(
  parent: HTMLElement,
  value: string,
  query: string,
  className?: string,
): HTMLElement {
  const target = className ? document.createElement('span') : parent;
  if (className) target.className = className;

  if (!query) {
    target.append(document.createTextNode(value));
  } else {
    const lowerValue = value.toLocaleLowerCase();
    const lowerQuery = query.toLocaleLowerCase();
    let cursor = 0;
    let index = lowerValue.indexOf(lowerQuery);

    while (index >= 0) {
      if (index > cursor) {
        target.append(document.createTextNode(value.slice(cursor, index)));
      }

      const mark = document.createElement('mark');
      mark.className = 'log-search-highlight';
      mark.textContent = value.slice(index, index + query.length);
      target.append(mark);

      cursor = index + query.length;
      index = lowerValue.indexOf(lowerQuery, cursor);
    }

    if (cursor < value.length) {
      target.append(document.createTextNode(value.slice(cursor)));
    }
  }

  if (target !== parent) parent.append(target);
  return target;
}

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

function decorateNodeRequest(line: HTMLElement): void {
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

function appendSql(parent: HTMLElement, statement: string, query: string): void {
  const pattern = /(`[^`]*`|'(?:''|[^'])*'|"(?:\\"|[^"])*"|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_$]*\b|[(),.=<>!*+\-/]+|\s+|.)/g;

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
  const operation = statement.match(/^(SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK)/i)?.[1]?.toUpperCase();
  if (!statement || !operation) return null;

  return {
    prefix: match[1]?.trimEnd() ?? '',
    statement,
    operation,
  };
}

function decorateRawSql(line: HTMLElement): void {
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
    appendHighlightedText(metadata, parsed.prefix, query, 'enhanced-log-sql-prefix');
  }

  const statement = document.createElement('span');
  statement.className = 'enhanced-log-raw-sql-statement';
  appendSql(statement, parsed.statement, query);

  line.append(metadata, statement);
}

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
