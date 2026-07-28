const enhancedAttribute = 'data-log-enhanced';
const originalTextAttribute = 'logOriginalText';

const sqlKeywords = new Set([
  'ALL',
  'ALTER',
  'AND',
  'AS',
  'ASC',
  'BEGIN',
  'BETWEEN',
  'BY',
  'CASE',
  'COMMIT',
  'CREATE',
  'DELETE',
  'DESC',
  'DISTINCT',
  'DROP',
  'ELSE',
  'END',
  'EXISTS',
  'FALSE',
  'FROM',
  'FULL',
  'GROUP',
  'HAVING',
  'IN',
  'INNER',
  'INSERT',
  'INTO',
  'IS',
  'JOIN',
  'LEFT',
  'LIKE',
  'LIMIT',
  'NOT',
  'NULL',
  'OFFSET',
  'ON',
  'OR',
  'ORDER',
  'OUTER',
  'RIGHT',
  'ROLLBACK',
  'SELECT',
  'SET',
  'TABLE',
  'THEN',
  'TRUE',
  'UNION',
  'UPDATE',
  'VALUES',
  'WHEN',
  'WHERE',
]);

const sqlFunctions = new Set([
  'AVG',
  'COALESCE',
  'COUNT',
  'MAX',
  'MIN',
  'SUM',
]);

let activeSearchQuery = '';

function text(element: Element): string {
  return element.textContent?.trim() ?? '';
}

function rememberOriginalText(element: HTMLElement, value = text(element)): string {
  const remembered = element.dataset[originalTextAttribute];
  if (remembered !== undefined) return remembered;

  element.dataset[originalTextAttribute] = value;
  return value;
}

function appendHighlightedText(
  parent: HTMLElement,
  value: string,
  className?: string,
): HTMLElement {
  const target = className ? document.createElement('span') : parent;
  if (className) target.className = className;

  const query = activeSearchQuery.trim();
  if (!query) {
    target.append(document.createTextNode(value));
    if (target !== parent) parent.append(target);
    return target;
  }

  const lowerValue = value.toLocaleLowerCase();
  const lowerQuery = query.toLocaleLowerCase();
  let cursor = 0;
  let matchIndex = lowerValue.indexOf(lowerQuery);

  while (matchIndex >= 0) {
    if (matchIndex > cursor) {
      target.append(document.createTextNode(value.slice(cursor, matchIndex)));
    }

    const mark = document.createElement('mark');
    mark.className = 'log-search-highlight';
    mark.textContent = value.slice(matchIndex, matchIndex + query.length);
    target.append(mark);

    cursor = matchIndex + query.length;
    matchIndex = lowerValue.indexOf(lowerQuery, cursor);
  }

  if (cursor < value.length) {
    target.append(document.createTextNode(value.slice(cursor)));
  }

  if (target !== parent) parent.append(target);
  return target;
}

function isErrorMessage(value: string): boolean {
  return /(?:^|\s)(?:ERROR|FATAL|Error|TypeError|ReferenceError|SyntaxError|NoMethodError|RoutingError|RecordInvalid|Exception|ActionController::|ActiveRecord::|Errno::)|Failed to (?:compile|build|load)|Module not found|Unhandled Runtime Error|⨯/i.test(value);
}

function renderPlainLine(line: HTMLElement, value: string): void {
  line.replaceChildren();
  appendHighlightedText(line, value);
  line.classList.toggle('enhanced-search-match', Boolean(activeSearchQuery) && value.toLocaleLowerCase().includes(activeSearchQuery.toLocaleLowerCase()));
}

function decorateRawLine(line: HTMLElement): void {
  const value = rememberOriginalText(line);
  if (!value) return;

  line.dataset.logEnhanced = 'true';
  line.classList.remove(
    'enhanced-log-boot',
    'enhanced-log-build',
    'enhanced-log-error',
    'enhanced-log-request',
    'enhanced-log-request-error',
    'enhanced-log-success',
    'enhanced-log-warning',
    'enhanced-search-match',
  );

  if (/^(?:yarn run|\$\s|▲\s+Next\.js|[- ]Local:|[- ]Network:|[- ]Environments?:|[- ]Experiments?)/i.test(value)) {
    line.classList.add('enhanced-log-boot');
    renderPlainLine(line, value);
    return;
  }

  if (/^[✓✔]\s*(?:Ready|Compiled|Starting)/i.test(value)) {
    line.classList.add('enhanced-log-success');
    renderPlainLine(line, value);
    return;
  }

  if (/^[○◌]\s*Compiling/i.test(value)) {
    line.classList.add('enhanced-log-build');
    renderPlainLine(line, value);
    return;
  }

  const request = value.match(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(.+?)\s+(\d{3})\s+in\s+([\d.]+)ms$/i);
  if (request) {
    const [, method = '', path = '', status = '', duration = ''] = request;
    const failed = Number(status) >= 400;

    line.classList.add('enhanced-log-request');
    line.classList.toggle('enhanced-log-request-error', failed);
    line.classList.toggle(
      'enhanced-search-match',
      Boolean(activeSearchQuery) && value.toLocaleLowerCase().includes(activeSearchQuery.toLocaleLowerCase()),
    );
    line.title = failed
      ? `Requisição com erro HTTP ${status}`
      : `Requisição HTTP ${status}`;
    line.replaceChildren();

    const methodBadge = document.createElement('span');
    methodBadge.className = `enhanced-log-method enhanced-log-method-${method.toLowerCase()}`;
    appendHighlightedText(methodBadge, method);

    const pathLabel = document.createElement('span');
    pathLabel.className = 'enhanced-log-path';
    appendHighlightedText(pathLabel, path);

    const statusBadge = document.createElement('span');
    statusBadge.className = `enhanced-log-http enhanced-log-http-${status[0] ?? '0'}xx`;
    statusBadge.textContent = failed ? `ERRO ${status}` : status;

    const durationLabel = document.createElement('span');
    durationLabel.className = Number(duration) >= 500
      ? 'enhanced-log-duration enhanced-log-slow'
      : 'enhanced-log-duration';
    durationLabel.textContent = `${duration}ms`;

    line.append(methodBadge, pathLabel, statusBadge, durationLabel);
    return;
  }

  if (isErrorMessage(value)) {
    line.classList.add('enhanced-log-error');
    line.replaceChildren();

    const flag = document.createElement('span');
    flag.className = 'enhanced-log-error-flag';
    flag.textContent = 'ERRO';
    line.append(flag);
    appendHighlightedText(line, value, 'enhanced-log-error-message');
    line.classList.toggle(
      'enhanced-search-match',
      Boolean(activeSearchQuery) && value.toLocaleLowerCase().includes(activeSearchQuery.toLocaleLowerCase()),
    );
    return;
  }

  if (/^(?:warn|warning)\b/i.test(value)) {
    line.classList.add('enhanced-log-warning');
  }

  renderPlainLine(line, value);
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

function appendSqlStatement(parent: HTMLElement, statement: string): void {
  const tokenPattern = /(`[^`]*`|'(?:''|[^'])*'|"(?:\\"|[^"])*"|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_$]*\b|[(),.=<>!*+\-/]+|\s+|.)/g;

  for (const match of statement.matchAll(tokenPattern)) {
    const token = match[0];
    const className = sqlTokenClass(token);
    appendHighlightedText(parent, token, className);
  }
}

function decorateSqlLine(line: HTMLElement): void {
  const value = rememberOriginalText(line);
  const match = value.match(/^(.+?)\s+\(([\d.]+)ms\)\s+((?:SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK)\b.*)$/i);
  if (!match) return;

  line.dataset.logEnhanced = 'true';
  const [, label = 'SQL', duration = '', statement = ''] = match;
  const operation = statement.match(/^(SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK)/i)?.[1]?.toUpperCase() ?? 'SQL';
  const matchesSearch = Boolean(activeSearchQuery) && value.toLocaleLowerCase().includes(activeSearchQuery.toLocaleLowerCase());

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

function decorateRenderLine(line: HTMLElement): void {
  const value = rememberOriginalText(line);
  const match = value.match(/^(Rendering|Rendered)\s+(.+?)(?:\s+\(Duration:\s*([\d.]+)ms\s*\|\s*GC:\s*([\d.]+)ms\))?$/i);
  if (!match) return;

  line.dataset.logEnhanced = 'true';
  const [, phase = '', template = '', duration, gc] = match;
  line.classList.toggle(
    'enhanced-search-match',
    Boolean(activeSearchQuery) && value.toLocaleLowerCase().includes(activeSearchQuery.toLocaleLowerCase()),
  );
  line.replaceChildren();

  const phaseNode = document.createElement('span');
  phaseNode.className = phase.toLowerCase() === 'rendered'
    ? 'enhanced-render-phase done'
    : 'enhanced-render-phase';
  phaseNode.textContent = phase;

  const templateNode = document.createElement('span');
  templateNode.className = 'enhanced-render-template';
  appendHighlightedText(templateNode, template);

  line.append(phaseNode, templateNode);

  if (duration) {
    const timing = document.createElement('span');
    timing.className = Number(duration) >= 20
      ? 'enhanced-render-duration enhanced-log-slow'
      : 'enhanced-render-duration';
    timing.textContent = `${duration}ms${gc ? ` · GC ${gc}ms` : ''}`;
    line.append(timing);
  }
}

function highlightPlainElement(element: HTMLElement): void {
  const value = rememberOriginalText(element);
  element.replaceChildren();
  appendHighlightedText(element, value);
  element.classList.toggle(
    'enhanced-search-match',
    Boolean(activeSearchQuery) && value.toLocaleLowerCase().includes(activeSearchQuery.toLocaleLowerCase()),
  );
}

function decorateRailsCards(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('.rails-request-card').forEach((card) => {
    const failed = card.classList.contains('rails-request-failed') ||
      card.querySelector('.rails-error-lines') !== null ||
      /\b(?:ERRO\s+)?[45]\d{2}\b/.test(text(card.querySelector('.rails-status') ?? card));

    card.classList.toggle('enhanced-request-error-card', failed);
    card.classList.toggle(
      'enhanced-search-result-card',
      Boolean(activeSearchQuery) && text(card).toLocaleLowerCase().includes(activeSearchQuery.toLocaleLowerCase()),
    );
  });

  root.querySelectorAll<HTMLElement>([
    '.rails-request-heading strong',
    '.rails-request-context > span',
    '.rails-parameters code',
    '.rails-error-lines span',
    '.rails-system-group code',
    '.rails-detail-source',
  ].join(',')).forEach(highlightPlainElement);
}

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
  activeSearchQuery = input?.value.trim() ?? '';
  enhance(document);
}

export function installLogVisualEnhancer(): void {
  if (typeof document === 'undefined') return;

  refreshSearchQuery();

  document.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches('.project-log-search input')) return;

    activeSearchQuery = target.value.trim();
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