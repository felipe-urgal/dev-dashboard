import { rememberOriginalText } from './dom-helpers';
import { appendHighlightedText, getActiveSearchQuery } from './search';
import { appendLogSyntax } from './tokens';

export function isErrorMessage(value: string): boolean {
  return /(?:^|\s)(?:ERROR|FATAL|Error|TypeError|ReferenceError|SyntaxError|NoMethodError|RoutingError|RecordInvalid|Exception|ActionController::|ActiveRecord::|Errno::)|Failed to (?:compile|build|load)|Module not found|Unhandled Runtime Error|⨯/i.test(
    value,
  );
}

export function isWarningMessage(value: string): boolean {
  return /^(?:<w>\s*)?(?:warn|warning)\b|webpack\.cache|Serializing big strings|deprecated|deprecation/i.test(
    value,
  );
}

function matchesSearch(value: string): boolean {
  const query = getActiveSearchQuery().trim();
  return (
    Boolean(query) &&
    value.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  );
}

function updateSearchMatch(line: HTMLElement, value: string): void {
  line.classList.toggle('enhanced-search-match', matchesSearch(value));
}

function sourceBadge(label: string, tone: 'rails' | 'node'): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.className = `enhanced-log-source-badge enhanced-log-source-${tone}`;
  badge.textContent = label;
  return badge;
}

function kindBadge(label: string, tone = ''): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.className = `enhanced-log-kind-badge${tone ? ` enhanced-log-kind-${tone}` : ''}`;
  badge.textContent = label;
  return badge;
}

export function renderPlainLine(line: HTMLElement, value: string): void {
  line.replaceChildren();
  appendLogSyntax(line, value);
  updateSearchMatch(line, value);
}

function renderRailsEvent(line: HTMLElement, value: string): boolean {
  if (
    !/^(?:Started\s+[A-Z]+\s+"|Processing by\s+|Completed\s+\d{3}\b)/i.test(
      value,
    )
  ) {
    return false;
  }

  line.classList.add(
    'enhanced-log-framework-event',
    'enhanced-log-framework-rails',
  );
  line.replaceChildren(sourceBadge('RAILS', 'rails'));
  appendLogSyntax(line, value, 'enhanced-log-framework-message');
  updateSearchMatch(line, value);
  return true;
}

function renderBuildEvent(line: HTMLElement, value: string): boolean {
  const compiled = value.match(
    /^[✓✔]\s*Compiled\s+(.+?)\s+in\s+([\d.]+(?:ms|s))(?:\s+\((\d+)\s+modules?\))?$/i,
  );
  const compiling = value.match(/^[○◌]\s*Compiling\s+(.+?)(?:\s*\.\.\.)?$/i);
  const ready = value.match(
    /^[✓✔]\s*(Ready|Starting)(?:\s+in\s+([\d.]+(?:ms|s)))?\s*\.*$/i,
  );

  if (!compiled && !compiling && !ready) return false;

  line.classList.add('enhanced-log-build-card');
  if (compiled || ready) line.classList.add('enhanced-log-success');
  else line.classList.add('enhanced-log-build');
  line.replaceChildren(
    sourceBadge('NODE', 'node'),
    kindBadge('BUILD', 'build'),
  );

  const message = document.createElement('span');
  message.className = 'enhanced-log-build-message';
  const messageText = compiled?.[1]
    ? `Compilado ${compiled[1]}`
    : compiling?.[1]
      ? `Compilando ${compiling[1]}`
      : (ready?.[1] ?? value);
  appendLogSyntax(message, messageText);
  line.append(message);

  const meta = document.createElement('span');
  meta.className = 'enhanced-log-build-meta';
  const duration = compiled?.[2] ?? ready?.[2];
  const modules = compiled?.[3];
  if (duration) {
    const durationLabel = document.createElement('span');
    durationLabel.className = 'enhanced-log-duration';
    durationLabel.textContent = duration;
    meta.append(durationLabel);
  }
  if (modules) {
    const modulesLabel = document.createElement('span');
    modulesLabel.className = 'enhanced-log-modules';
    modulesLabel.textContent = `${modules} módulos`;
    meta.append(modulesLabel);
  }
  if (meta.childElementCount) line.append(meta);

  updateSearchMatch(line, value);
  return true;
}

function renderWarning(line: HTMLElement, value: string): void {
  line.classList.add('enhanced-log-warning', 'enhanced-log-warning-card');
  line.replaceChildren(kindBadge('AVISO', 'warning'));
  appendLogSyntax(line, value, 'enhanced-log-warning-message');
  updateSearchMatch(line, value);
}

export function decorateRawLine(line: HTMLElement): void {
  const value = rememberOriginalText(line);
  if (!value) return;

  line.dataset.logEnhanced = 'true';
  line.classList.remove(
    'enhanced-log-boot',
    'enhanced-log-build',
    'enhanced-log-build-card',
    'enhanced-log-error',
    'enhanced-log-framework-event',
    'enhanced-log-framework-rails',
    'enhanced-log-request',
    'enhanced-log-request-error',
    'enhanced-log-success',
    'enhanced-log-warning',
    'enhanced-log-warning-card',
    'enhanced-search-match',
  );

  if (renderBuildEvent(line, value)) return;
  if (renderRailsEvent(line, value)) return;

  if (
    /^(?:yarn run|\$\s|▲\s+Next\.js|[- ]Local:|[- ]Network:|[- ]Environments?:|[- ]Experiments?)/i.test(
      value,
    )
  ) {
    line.classList.add('enhanced-log-boot');
    line.replaceChildren(sourceBadge('NODE', 'node'));
    appendLogSyntax(line, value, 'enhanced-log-boot-message');
    updateSearchMatch(line, value);
    return;
  }

  const request = value.match(
    /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(.+?)\s+(\d{3})\s+in\s+([\d.]+)ms$/i,
  );
  if (request) {
    const [, method = '', path = '', status = '', duration = ''] = request;
    const failed = Number(status) >= 400;

    line.classList.add('enhanced-log-request');
    line.classList.toggle('enhanced-log-request-error', failed);
    updateSearchMatch(line, value);
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
    durationLabel.className =
      Number(duration) >= 500
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
    appendLogSyntax(line, value, 'enhanced-log-error-message');
    updateSearchMatch(line, value);
    return;
  }

  if (isWarningMessage(value)) {
    renderWarning(line, value);
    return;
  }

  renderPlainLine(line, value);
}
