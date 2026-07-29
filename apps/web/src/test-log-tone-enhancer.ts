const TEST_LOG_TONE_CLASSES = [
  'test-log-visual-progress',
  'test-log-visual-file',
  'test-log-visual-summary',
  'test-log-visual-command',
  'test-log-visual-runtime',
  'test-log-visual-stack',
] as const;

export type TestLogVisualTone =
  | 'progress'
  | 'file'
  | 'summary'
  | 'command'
  | 'runtime'
  | 'stack';

export function classifyTestLogLine(value: string): TestLogVisualTone | null {
  const line = value.trim();
  if (!line) return null;

  if (/^[.·•*EFSPX]+$/i.test(line) && line.length >= 3) {
    return 'progress';
  }

  if (
    /^(?:✓|✔|PASS\b|ok\b)/i.test(line)
    || /(?:^|\s)(?:spec|test|tests|__tests__)\/[\w./@-]+/i.test(line)
    || /[\w./@-]+(?:\.spec|\.test|_spec|_test)\.(?:[cm]?[jt]sx?|rb|py)\b/i.test(line)
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
    /^(?:\$|>\s|yarn(?:\s+run)?\b|npm(?:\s+run)?\b|pnpm\b|bun\b|bundle exec\b|bin\/rails\b|rails test\b|ruby\b)/i.test(line)
  ) {
    return 'command';
  }

  if (
    /^\(?node:\d+\)?/i.test(line)
    || /^Timeout duration was set to/i.test(line)
    || /^Use `node --trace-warnings/i.test(line)
  ) {
    return 'runtime';
  }

  if (
    /^(?:at\s+|from\s+|#\d+\s+)/i.test(line)
    || /^[A-Za-z]:\\.*:\d+(?::\d+)?/.test(line)
    || /^\/.*:\d+(?::\d+)?/.test(line)
  ) {
    return 'stack';
  }

  return null;
}

function enhanceRow(row: HTMLElement): void {
  const code = row.querySelector('code');
  const text = code?.textContent ?? '';
  if (row.dataset.testLogToneSource === text) return;

  row.dataset.testLogToneSource = text;
  row.classList.remove(...TEST_LOG_TONE_CLASSES);

  const tone = classifyTestLogLine(text);
  if (tone) row.classList.add(`test-log-visual-${tone}`);
}

function scan(root: ParentNode = document): void {
  if (root instanceof HTMLElement && root.matches('.tests-log-lines li')) {
    enhanceRow(root);
  }
  root.querySelectorAll<HTMLElement>('.tests-log-lines li').forEach(enhanceRow);
}

export function installTestLogToneEnhancer(): void {
  if (typeof document === 'undefined') return;
  scan();

  let scheduled = false;
  const scheduleScan = (): void => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      scan();
    });
  };

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}
