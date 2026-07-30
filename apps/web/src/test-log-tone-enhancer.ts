const TEST_LOG_TONE_CLASSES = [
  'test-log-visual-progress',
  'test-log-visual-file',
  'test-log-visual-summary',
  'test-log-visual-command',
  'test-log-visual-runtime',
  'test-log-visual-stack',
] as const;

const TEST_LOG_ROW_TONE_CLASSES = [
  'tests-log-line-default',
  'tests-log-line-success',
  'tests-log-line-error',
  'tests-log-line-warning',
  'tests-log-line-muted',
] as const;

const RSPEC_PROGRESS_PATTERN = /^[.·•*EFSPX]+$/i;
const TEST_FILE_PATTERN = /(?:^|\s)(?:spec|test|tests|__tests__)\/[\w./@-]+|[\w./@-]+(?:\.spec|\.test|_spec|_test)\.(?:[cm]?[jt]sx?|rb|py)\b/i;

export type TestLogVisualTone =
  | 'progress'
  | 'file'
  | 'summary'
  | 'command'
  | 'runtime'
  | 'stack';

export type TestLogSemanticTone =
  | 'default'
  | 'success'
  | 'error'
  | 'warning'
  | 'muted';

function normalizedLine(value: string): string {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '').trim();
}

function hasNonZeroFailureSummary(line: string): boolean {
  return (
    /\b[1-9]\d*\s+(?:failed|failures|errors)\b/i.test(line)
    || /\b\d+\s+(?:runs?|examples?),[^\n]*\b[1-9]\d*\s+(?:failures?|errors?)\b/i.test(line)
  );
}

export function isTestLogSuccessLine(value: string): boolean {
  const line = normalizedLine(value);
  if (!line) return false;

  if (/^(?:✓|✔|PASS\b|ok\b)/i.test(line)) return true;
  if (RSPEC_PROGRESS_PATTERN.test(line) && !/[EFX]/i.test(line) && /[.·•*]/.test(line)) return true;
  if (/\b[1-9]\d*\s+(?:passed|success(?:ful)?)\b/i.test(line) && !hasNonZeroFailureSummary(line)) return true;
  if (/\b0\s+(?:failed|failures|errors)\b/i.test(line) && /\b(?:tests?|runs?|examples?|assertions?)\b/i.test(line)) return true;

  return false;
}

export function isTestLogErrorLine(value: string): boolean {
  const line = normalizedLine(value);
  if (!line || isTestLogSuccessLine(line)) return false;

  if (/\b0\s+(?:failed|failures|errors)\b/i.test(line) && !hasNonZeroFailureSummary(line)) return false;
  if (/^(?:✗|✘|×|FAIL(?:ED)?\b)/i.test(line)) return true;
  if (RSPEC_PROGRESS_PATTERN.test(line) && /[EFX]/i.test(line)) return true;
  if (/^(?:Failures?:|Failed examples:)\s*$/i.test(line)) return true;
  if (/^\d+\)\s+\S/.test(line)) return true;
  if (/^(?:Failure\/Error:|AssertionError\b|Error:|TypeError\b|ReferenceError\b|SyntaxError\b|NoMethodError\b|NameError\b|RuntimeError\b|LoadError\b)/i.test(line)) return true;
  if (/^(?:expected|got|received|actual):/i.test(line)) return true;
  if (hasNonZeroFailureSummary(line)) return true;
  if (/\b(?:failed to|undefined method|cannot\b|enoent\b|unexpected\b|unhandled\b)/i.test(line)) return true;
  if (/\b(?:test|suite|build|command|runner)\s+(?:has\s+)?failed\b/i.test(line)) return true;

  return false;
}

export function isTestLogWarningLine(value: string): boolean {
  const line = normalizedLine(value);
  return /\b(?:warning|warn|deprecated|deprecation)\b/i.test(line);
}

export function classifyTestLogSemanticTone(value: string): TestLogSemanticTone {
  const line = normalizedLine(value);
  if (!line) return 'default';
  if (isTestLogErrorLine(line)) return 'error';
  if (isTestLogWarningLine(line)) return 'warning';
  if (isTestLogSuccessLine(line)) return 'success';
  if (/^(?:RUN\b|Test Files?\b|Tests?\b|Start at\b|Duration\b|Finished in\b|Done in\b|Run options:\b|# Running tests:\b)/i.test(line)) return 'muted';
  return 'default';
}

export function classifyTestLogLine(value: string): TestLogVisualTone | null {
  const line = normalizedLine(value);
  if (!line) return null;

  if (RSPEC_PROGRESS_PATTERN.test(line) && line.length >= 3) {
    return 'progress';
  }

  if (
    /^(?:\$|>\s|yarn(?:\s+run)?\b|npm(?:\s+run)?\b|pnpm\b|bun\b|bundle exec\b|bin\/rails\b|rails test\b|ruby\b)/i.test(line)
  ) {
    return 'command';
  }

  if (
    /^(?:✓|✔|✗|✘|×|PASS\b|FAIL(?:ED)?\b|ok\b)/i.test(line)
    || TEST_FILE_PATTERN.test(line)
  ) {
    return 'file';
  }

  if (
    /^(?:RUN\b|Test Files?\b|Tests?\b|Start at\b|Duration\b|Finished in\b|Done in\b|Run options:\b|# Running tests:\b)/i.test(line)
    || /^\d+\s+(?:runs?|examples?),\s*\d+\s+(?:assertions?|failures?)/i.test(line)
  ) {
    return 'summary';
  }

  if (
    /^\(?node:\d+\)?/i.test(line)
    || /^Timeout duration was set to/i.test(line)
    || /^Use `node --trace-warnings/i.test(line)
  ) {
    return 'runtime';
  }

  if (
    /^(?:at\s+|from\s+|#\s*\.?\/|#\d+\s+)/i.test(line)
    || /^[A-Za-z]:\\.*:\d+(?::\d+)?/.test(line)
    || /^\/.*:\d+(?::\d+)?/.test(line)
  ) {
    return 'stack';
  }

  return null;
}

function toggleExclusiveClass(
  element: HTMLElement,
  classes: readonly string[],
  desiredClass: string,
): void {
  classes.forEach((className) => {
    if (className !== desiredClass && element.classList.contains(className)) {
      element.classList.remove(className);
    }
  });
  if (!element.classList.contains(desiredClass)) element.classList.add(desiredClass);
}

function decorateRspecProgress(code: HTMLElement, text: string): void {
  const line = normalizedLine(text);
  if (!RSPEC_PROGRESS_PATTERN.test(line) || line.length < 3) {
    if (code.dataset.testLogProgressSource !== undefined) {
      code.replaceChildren(code.ownerDocument.createTextNode(text));
      delete code.dataset.testLogProgressSource;
    }
    return;
  }

  if (
    code.dataset.testLogProgressSource === text
    && code.querySelector('.test-log-progress-token')
  ) return;

  const fragment = code.ownerDocument.createDocumentFragment();
  for (const character of text) {
    if (!/[.·•*EFSPX]/i.test(character)) {
      fragment.append(code.ownerDocument.createTextNode(character));
      continue;
    }
    const token = code.ownerDocument.createElement('span');
    token.className = 'test-log-progress-token';
    if (/[EFX]/i.test(character)) token.classList.add('test-log-progress-failure');
    else if (/[SP]/i.test(character)) token.classList.add('test-log-progress-pending');
    else token.classList.add('test-log-progress-success');
    token.textContent = character;
    fragment.append(token);
  }
  code.replaceChildren(fragment);
  code.dataset.testLogProgressSource = text;
}

function enhanceRow(row: HTMLElement): void {
  const code = row.querySelector<HTMLElement>('code');
  const text = code?.textContent ?? '';
  if (!code) return;

  const semanticTone = classifyTestLogSemanticTone(text);
  toggleExclusiveClass(row, TEST_LOG_ROW_TONE_CLASSES, `tests-log-line-${semanticTone}`);

  const visualTone = classifyTestLogLine(text);
  TEST_LOG_TONE_CLASSES.forEach((className) => {
    const shouldHaveClass = className === `test-log-visual-${visualTone}`;
    if (row.classList.contains(className) !== shouldHaveClass) {
      row.classList.toggle(className, shouldHaveClass);
    }
  });

  decorateRspecProgress(code, text);
  row.dataset.testLogToneSource = text;
}

function tabButton(shell: HTMLElement, prefix: string): HTMLButtonElement | undefined {
  return Array.from(shell.querySelectorAll<HTMLButtonElement>('.tests-log-tabs button'))
    .find((button) => button.textContent?.trim().toLocaleLowerCase('pt-BR').startsWith(prefix));
}

function setTabCount(button: HTMLButtonElement | undefined, label: string, count: number): void {
  if (!button) return;
  const next = `${label} (${count})`;
  if (button.textContent?.trim() !== next) button.textContent = next;
}

function renderSemanticEmptyInspector(shell: HTMLElement): void {
  const inspector = shell.querySelector<HTMLElement>(':scope > .test-log-inspector');
  if (!inspector || inspector.dataset.testLogSemanticEmpty === 'true') return;

  const empty = inspector.ownerDocument.createElement('div');
  empty.className = 'test-log-inspector-empty';
  const title = inspector.ownerDocument.createElement('strong');
  title.textContent = 'Nenhuma falha estruturada foi identificada.';
  const description = inspector.ownerDocument.createElement('p');
  description.textContent = 'Linhas aprovadas, mesmo com “error” no nome do arquivo, não são tratadas como falha.';
  empty.append(title, description);
  inspector.replaceChildren(empty);
  inspector.dataset.testLogSemanticEmpty = 'true';
}

function enhanceShell(shell: HTMLElement): void {
  const rows = Array.from(shell.querySelectorAll<HTMLElement>('.tests-log-lines > li'));
  rows.forEach(enhanceRow);

  const activeButton = shell.querySelector<HTMLButtonElement>('.tests-log-tabs button.active');
  const activeLabel = activeButton?.textContent?.trim().toLocaleLowerCase('pt-BR') ?? 'log';
  const onRawLog = activeLabel.startsWith('log');

  if (onRawLog) {
    const errorCount = rows.filter((row) => isTestLogErrorLine(row.querySelector('code')?.textContent ?? '')).length;
    const warningCount = rows.filter((row) => isTestLogWarningLine(row.querySelector('code')?.textContent ?? '')).length;
    shell.dataset.testLogSemanticErrorCount = String(errorCount);
    shell.dataset.testLogSemanticWarningCount = String(warningCount);
  }

  const errorCount = Number(shell.dataset.testLogSemanticErrorCount ?? '0');
  const warningCount = Number(shell.dataset.testLogSemanticWarningCount ?? '0');
  setTabCount(tabButton(shell, 'erros'), 'Erros', errorCount);
  setTabCount(tabButton(shell, 'avisos'), 'Avisos', warningCount);

  if (activeLabel.startsWith('erros')) {
    rows.forEach((row) => {
      const shouldHide = !isTestLogErrorLine(row.querySelector('code')?.textContent ?? '');
      if (row.hidden !== shouldHide) row.hidden = shouldHide;
    });
    if (errorCount === 0) renderSemanticEmptyInspector(shell);
  }
}

export function enhanceTestLogTones(root: ParentNode = document): void {
  if (root instanceof HTMLElement && root.matches('.tests-log-shell')) enhanceShell(root);
  root.querySelectorAll<HTMLElement>('.tests-log-shell').forEach(enhanceShell);
}

export function installTestLogToneEnhancer(): void {
  if (typeof document === 'undefined') return;
  enhanceTestLogTones();

  let scheduled = false;
  const scheduleScan = (): void => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      enhanceTestLogTones();
    });
  };

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'hidden'],
  });
}