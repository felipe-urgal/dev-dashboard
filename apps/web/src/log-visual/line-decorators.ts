import { rememberOriginalText } from './dom-helpers';
import { appendHighlightedText, getActiveSearchQuery } from './search';

export function isErrorMessage(value: string): boolean {
  return /(?:^|\s)(?:ERROR|FATAL|Error|TypeError|ReferenceError|SyntaxError|NoMethodError|RoutingError|RecordInvalid|Exception|ActionController::|ActiveRecord::|Errno::)|Failed to (?:compile|build|load)|Module not found|Unhandled Runtime Error|⨯/i.test(value);
}

export function renderPlainLine(line: HTMLElement, value: string): void {
  line.replaceChildren();
  appendHighlightedText(line, value);
  line.classList.toggle('enhanced-search-match', Boolean(getActiveSearchQuery()) && value.toLocaleLowerCase().includes(getActiveSearchQuery().toLocaleLowerCase()));
}

export function decorateRawLine(line: HTMLElement): void {
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
      Boolean(getActiveSearchQuery()) && value.toLocaleLowerCase().includes(getActiveSearchQuery().toLocaleLowerCase()),
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
      Boolean(getActiveSearchQuery()) && value.toLocaleLowerCase().includes(getActiveSearchQuery().toLocaleLowerCase()),
    );
    return;
  }

  if (/^(?:warn|warning)\b/i.test(value)) {
    line.classList.add('enhanced-log-warning');
  }

  renderPlainLine(line, value);
}
