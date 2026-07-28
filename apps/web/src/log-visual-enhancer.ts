const enhancedAttribute = 'data-log-enhanced';

function text(element: Element): string {
  return element.textContent?.trim() ?? '';
}

function decorateRawLine(line: HTMLElement): void {
  const value = text(line);
  if (!value || line.dataset.logEnhanced === 'true') return;

  line.dataset.logEnhanced = 'true';

  if (/^(?:yarn run|\$\s|▲\s+Next\.js|[- ]Local:|[- ]Network:|[- ]Environments?:|[- ]Experiments?)/i.test(value)) {
    line.classList.add('enhanced-log-boot');
    return;
  }

  if (/^[✓✔]\s*(?:Ready|Compiled|Starting)/i.test(value)) {
    line.classList.add('enhanced-log-success');
    return;
  }

  if (/^[○◌]\s*Compiling/i.test(value)) {
    line.classList.add('enhanced-log-build');
    return;
  }

  const request = value.match(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(.+?)\s+(\d{3})\s+in\s+([\d.]+)ms$/i);
  if (request) {
    line.classList.add('enhanced-log-request');
    const [, method = '', path = '', status = '', duration = ''] = request;
    line.replaceChildren();

    const methodBadge = document.createElement('span');
    methodBadge.className = `enhanced-log-method enhanced-log-method-${method.toLowerCase()}`;
    methodBadge.textContent = method;

    const pathLabel = document.createElement('span');
    pathLabel.className = 'enhanced-log-path';
    pathLabel.textContent = path;

    const statusBadge = document.createElement('span');
    statusBadge.className = `enhanced-log-http enhanced-log-http-${status[0] ?? '0'}xx`;
    statusBadge.textContent = status;

    const durationLabel = document.createElement('span');
    durationLabel.className = Number(duration) >= 500 ? 'enhanced-log-duration enhanced-log-slow' : 'enhanced-log-duration';
    durationLabel.textContent = `${duration}ms`;

    line.append(methodBadge, pathLabel, statusBadge, durationLabel);
    return;
  }

  if (/^(?:Error|ERROR|FATAL|TypeError|ReferenceError|SyntaxError)\b/i.test(value)) {
    line.classList.add('enhanced-log-error');
    return;
  }

  if (/^(?:warn|warning)\b/i.test(value)) {
    line.classList.add('enhanced-log-warning');
  }
}

function decorateSqlLine(line: HTMLElement): void {
  if (line.dataset.logEnhanced === 'true') return;
  const value = text(line);
  const match = value.match(/^(.+?)\s+\(([\d.]+)ms\)\s+((?:SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK)\b.*)$/i);
  if (!match) return;

  line.dataset.logEnhanced = 'true';
  const [, label = 'SQL', duration = '', statement = ''] = match;
  const operation = statement.match(/^(SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK)/i)?.[1]?.toUpperCase() ?? 'SQL';

  line.replaceChildren();

  const header = document.createElement('span');
  header.className = 'enhanced-sql-header';

  const operationBadge = document.createElement('span');
  operationBadge.className = `enhanced-sql-operation enhanced-sql-${operation.toLowerCase()}`;
  operationBadge.textContent = operation;

  const labelNode = document.createElement('strong');
  labelNode.textContent = label;

  const durationNode = document.createElement('span');
  durationNode.className = Number(duration) >= 10 ? 'enhanced-sql-duration enhanced-log-slow' : 'enhanced-sql-duration';
  durationNode.textContent = `${duration}ms`;

  const sqlNode = document.createElement('span');
  sqlNode.className = 'enhanced-sql-statement';
  sqlNode.textContent = statement;

  header.append(operationBadge, labelNode, durationNode);
  line.append(header, sqlNode);
}

function decorateRenderLine(line: HTMLElement): void {
  if (line.dataset.logEnhanced === 'true') return;
  const value = text(line);
  const match = value.match(/^(Rendering|Rendered)\s+(.+?)(?:\s+\(Duration:\s*([\d.]+)ms\s*\|\s*GC:\s*([\d.]+)ms\))?$/i);
  if (!match) return;

  line.dataset.logEnhanced = 'true';
  const [, phase = '', template = '', duration, gc] = match;
  line.replaceChildren();

  const phaseNode = document.createElement('span');
  phaseNode.className = phase.toLowerCase() === 'rendered' ? 'enhanced-render-phase done' : 'enhanced-render-phase';
  phaseNode.textContent = phase;

  const templateNode = document.createElement('span');
  templateNode.className = 'enhanced-render-template';
  templateNode.textContent = template;

  line.append(phaseNode, templateNode);

  if (duration) {
    const timing = document.createElement('span');
    timing.className = Number(duration) >= 20 ? 'enhanced-render-duration enhanced-log-slow' : 'enhanced-render-duration';
    timing.textContent = `${duration}ms${gc ? ` · GC ${gc}ms` : ''}`;
    line.append(timing);
  }
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
}

export function installLogVisualEnhancer(): void {
  if (typeof document === 'undefined') return;

  const run = () => enhance(document);
  run();

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) enhance(node);
      }
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
}
