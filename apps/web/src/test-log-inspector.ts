type TestLogInspectorMode = 'log' | 'errors' | 'warnings' | 'details';

export interface ParsedTestFailure {
  id: string;
  title: string;
  type: string;
  assertion: string;
  expected?: string;
  actual?: string;
  file?: string;
  line?: number;
  stack: string[];
  raw: string[];
}

export interface ParsedTestReport {
  failures: ParsedTestFailure[];
  failedExamples: string[];
  passed?: number;
  failed?: number;
  total?: number;
  seed?: string;
  duration?: string;
  warningCount: number;
  errorCount: number;
}

interface InspectorState {
  rawLog: string;
  query: string;
  wrapLines: boolean;
  failuresOnly: boolean;
  selectedFailure: number;
  inspectorSignature: string;
}

const stateByShell = new WeakMap<HTMLElement, InspectorState>();
const ANSI_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const PATH_PATTERN = /(?:#\s*)?((?:\.{0,2}\/|[A-Za-z]:\\)[^\s:]+):(\d+)(?::\d+)?/;

function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, '');
}

function normalizedLines(value: string): string[] {
  return stripAnsi(value)
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''));
}

function compactValue(value: string | undefined): string | undefined {
  const compact = value?.trim();
  return compact ? compact : undefined;
}

function isErrorText(value: string): boolean {
  if (/\b0\s+(?:failed|failures|errors)\b/i.test(value)) return false;
  return /\b(?:error|failed|failure|syntaxerror|exception|unexpected|undefined method|cannot|enoent)\b/i.test(value);
}

function isWarningText(value: string): boolean {
  return /\b(?:warning|warn|deprecated|deprecation)\b/i.test(value);
}

function parseSummary(lines: string[]): Pick<ParsedTestReport, 'passed' | 'failed' | 'total' | 'duration' | 'seed'> {
  const source = lines.join('\n');
  const rspec = /\b(\d+)\s+examples?,\s*(\d+)\s+failures?/i.exec(source);
  const rails = /\b(\d+)\s+runs?,\s*(\d+)\s+assertions?,\s*(\d+)\s+failures?,\s*(\d+)\s+errors?/i.exec(source);
  const vitestPassed = /\bTests\s+(\d+)\s+passed\b/i.exec(source)
    ?? /\b(\d+)\s+tests?\s+passed\b/i.exec(source);
  const vitestFailed = /\bTests\s+(?:\d+\s+passed\s*\|\s*)?(\d+)\s+failed\b/i.exec(source)
    ?? /\b(\d+)\s+tests?\s+failed\b/i.exec(source);

  let passed: number | undefined;
  let failed: number | undefined;
  let total: number | undefined;

  if (rspec) {
    total = Number(rspec[1]);
    failed = Number(rspec[2]);
    passed = Math.max(0, total - failed);
  } else if (rails) {
    total = Number(rails[1]);
    failed = Number(rails[3]) + Number(rails[4]);
    passed = Math.max(0, total - failed);
  } else {
    passed = vitestPassed?.[1] ? Number(vitestPassed[1]) : undefined;
    failed = vitestFailed?.[1] ? Number(vitestFailed[1]) : undefined;
    if (passed !== undefined || failed !== undefined) total = (passed ?? 0) + (failed ?? 0);
  }

  const duration = /\bFinished in\s+([^\n]+)/i.exec(source)?.[1]?.trim()
    ?? /\bDuration\s+([^\n]+)/i.exec(source)?.[1]?.trim()
    ?? /\bDone in\s+([^\n]+)/i.exec(source)?.[1]?.trim();
  const seed = /\bRandomized with seed\s+(\d+)/i.exec(source)?.[1]
    ?? /\bseed\s+(\d+)/i.exec(source)?.[1];

  return {
    ...(passed !== undefined ? { passed } : {}),
    ...(failed !== undefined ? { failed } : {}),
    ...(total !== undefined ? { total } : {}),
    ...(duration ? { duration } : {}),
    ...(seed ? { seed } : {}),
  };
}

function failureBlocks(lines: string[]): string[][] {
  const failuresStart = lines.findIndex((line) => /^\s*Failures:\s*$/i.test(line));
  const searchStart = failuresStart >= 0 ? failuresStart + 1 : 0;
  const indexes: number[] = [];

  for (let index = searchStart; index < lines.length; index += 1) {
    if (/^\s*\d+\)\s+\S/.test(lines[index] ?? '')) indexes.push(index);
  }

  if (indexes.length > 0) {
    return indexes.map((start, position) => {
      const next = indexes[position + 1] ?? lines.length;
      let end = next;
      for (let index = start + 1; index < next; index += 1) {
        if (/^\s*(?:Failed examples:|Finished in\b|\d+\s+examples?,)/i.test(lines[index] ?? '')) {
          end = index;
          break;
        }
      }
      return lines.slice(start, end);
    });
  }

  const assertionIndex = lines.findIndex((line) => /Failure\/Error:|AssertionError|expected.+(?:got|received)/i.test(line));
  if (assertionIndex < 0) return [];
  return [lines.slice(Math.max(0, assertionIndex - 2), Math.min(lines.length, assertionIndex + 12))];
}

function parseLocation(block: string[]): { file?: string; line?: number } {
  for (const value of block) {
    const match = PATH_PATTERN.exec(value);
    if (!match?.[1] || !match[2]) continue;
    return {
      file: match[1],
      line: Number(match[2]),
    };
  }
  return {};
}

function parseFailure(block: string[], position: number): ParsedTestFailure {
  const heading = block.find((line) => /^\s*\d+\)\s+\S/.test(line));
  const title = compactValue(heading?.replace(/^\s*\d+\)\s+/, '')) ?? `Falha ${position + 1}`;
  const failureIndex = block.findIndex((line) => /Failure\/Error:|AssertionError/i.test(line));
  const failureLine = failureIndex >= 0 ? block[failureIndex] : undefined;
  const inlineAssertion = failureLine?.replace(/^.*?(?:Failure\/Error:|AssertionError:?)/i, '').trim();
  const nextAssertion = failureIndex >= 0
    ? block.slice(failureIndex + 1).find((line) => line.trim() && !PATH_PATTERN.test(line))?.trim()
    : undefined;
  const assertion = compactValue(inlineAssertion) ?? compactValue(nextAssertion) ?? title;

  const expectedLine = block.find((line) => /^\s*(?:expected|Expected):/i.test(line));
  const actualLine = block.find((line) => /^\s*(?:got|received|Received|actual):/i.test(line));
  const expected = compactValue(expectedLine?.replace(/^\s*(?:expected|Expected):\s*/i, ''));
  const actual = compactValue(actualLine?.replace(/^\s*(?:got|received|Received|actual):\s*/i, ''));
  const location = parseLocation(block);
  const stack = block
    .filter((line) => PATH_PATTERN.test(line))
    .map((line) => line.trim())
    .filter((line, index, values) => values.indexOf(line) === index)
    .slice(0, 8);
  const type = compactValue(failureLine?.match(/(?:Failure\/Error|AssertionError|[A-Z][A-Za-z]+Error)/)?.[0])
    ?? (expected || actual ? 'Falha de assertion' : 'Falha de teste');

  return {
    id: `failure-${position + 1}`,
    title,
    type,
    assertion,
    ...(expected ? { expected } : {}),
    ...(actual ? { actual } : {}),
    ...location,
    stack,
    raw: block,
  };
}

function parseFailedExamples(lines: string[]): string[] {
  const index = lines.findIndex((line) => /^\s*Failed examples:\s*$/i.test(line));
  if (index < 0) return [];
  return lines
    .slice(index + 1)
    .filter((line) => /^\s*(?:rspec|bin\/rails test|pytest)\s+/i.test(line))
    .map((line) => line.trim())
    .slice(0, 20);
}

export function parseTestLog(value: string): ParsedTestReport {
  const lines = normalizedLines(value);
  const summary = parseSummary(lines);
  const failures = failureBlocks(lines).map(parseFailure);

  if (failures.length === 0) {
    const errorLines = lines.filter(isErrorText).slice(0, 12);
    if (errorLines.length > 0) {
      failures.push({
        id: 'failure-1',
        title: 'Falha identificada no log',
        type: 'Erro do runner',
        assertion: errorLines[0] ?? 'Falha de teste',
        stack: errorLines.filter((line) => PATH_PATTERN.test(line)),
        raw: errorLines,
      });
    }
  }

  return {
    failures,
    failedExamples: parseFailedExamples(lines),
    ...summary,
    warningCount: lines.filter(isWarningText).length,
    errorCount: lines.filter(isErrorText).length,
  };
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function appendLabelValue(
  parent: HTMLElement,
  label: string,
  value: string,
  className?: string,
): void {
  const item = createElement('div', className);
  item.append(createElement('span', undefined, label), createElement('strong', undefined, value));
  parent.append(item);
}

function collectNativeLog(shell: HTMLElement): string {
  return Array.from(shell.querySelectorAll<HTMLElement>('.tests-log-lines li code'))
    .map((line) => line.textContent ?? '')
    .join('\n');
}

function activeMode(shell: HTMLElement): TestLogInspectorMode {
  const active = shell.querySelector<HTMLButtonElement>('.tests-log-tabs button.active');
  const label = active?.textContent?.trim().toLowerCase() ?? 'log';
  if (label.startsWith('erros')) return 'errors';
  if (label.startsWith('avisos')) return 'warnings';
  if (label.startsWith('detalhes')) return 'details';
  return 'log';
}

function setHidden(element: HTMLElement | null, hidden: boolean): void {
  if (element && element.hidden !== hidden) element.hidden = hidden;
}

function setDisplay(element: HTMLElement, value: string): void {
  if (element.style.display !== value) element.style.display = value;
}

function getState(shell: HTMLElement): InspectorState {
  const existing = stateByShell.get(shell);
  if (existing) return existing;
  const state: InspectorState = {
    rawLog: '',
    query: '',
    wrapLines: true,
    failuresOnly: false,
    selectedFailure: 0,
    inspectorSignature: '',
  };
  stateByShell.set(shell, state);
  return state;
}

function applyNativeFilters(shell: HTMLElement, state: InspectorState): void {
  const viewport = shell.querySelector<HTMLElement>('.tests-log-output');
  const rows = Array.from(shell.querySelectorAll<HTMLElement>('.tests-log-lines > li'));
  if (!viewport || rows.length === 0) return;

  viewport.classList.toggle('test-log-inspector-wrap', state.wrapLines);
  viewport.classList.toggle('test-log-inspector-nowrap', !state.wrapLines);

  const query = state.query.trim().toLocaleLowerCase('pt-BR');
  const contextRows = new Set<number>();
  if (state.failuresOnly) {
    rows.forEach((row, index) => {
      const text = row.textContent ?? '';
      if (row.classList.contains('tests-log-line-error') || isErrorText(text)) {
        for (let offset = -2; offset <= 2; offset += 1) contextRows.add(index + offset);
      }
    });
  }

  let visibleCount = 0;
  rows.forEach((row, index) => {
    const text = (row.textContent ?? '').toLocaleLowerCase('pt-BR');
    const matchesSearch = !query || text.includes(query);
    const matchesFailure = !state.failuresOnly || contextRows.has(index);
    const visible = matchesSearch && matchesFailure;
    setDisplay(row, visible ? '' : 'none');
    if (visible) visibleCount += 1;
  });

  const status = shell.querySelector<HTMLElement>('.test-log-explorer-count');
  if (status) status.textContent = `${visibleCount} de ${rows.length} linhas`;
}

function updateToggle(button: HTMLButtonElement, active: boolean): void {
  button.setAttribute('aria-pressed', String(active));
  button.classList.toggle('active', active);
}

function ensureToolbar(shell: HTMLElement, state: InspectorState): HTMLElement {
  const existing = shell.querySelector<HTMLElement>(':scope > .test-log-explorer-toolbar');
  if (existing) return existing;

  const toolbar = createElement('div', 'test-log-explorer-toolbar');
  const search = createElement('label', 'test-log-explorer-search');
  search.append(createElement('span', undefined, 'Buscar no log'));
  const input = createElement('input');
  input.type = 'search';
  input.placeholder = 'Mensagem, arquivo ou valor…';
  input.value = state.query;
  input.addEventListener('input', () => {
    state.query = input.value;
    applyNativeFilters(shell, state);
  });
  search.append(input);

  const controls = createElement('div', 'test-log-explorer-controls');
  const wrap = createElement('button', undefined, 'Quebrar linhas');
  wrap.type = 'button';
  updateToggle(wrap, state.wrapLines);
  wrap.addEventListener('click', () => {
    state.wrapLines = !state.wrapLines;
    updateToggle(wrap, state.wrapLines);
    applyNativeFilters(shell, state);
  });

  const failures = createElement('button', undefined, 'Contexto das falhas');
  failures.type = 'button';
  updateToggle(failures, state.failuresOnly);
  failures.addEventListener('click', () => {
    state.failuresOnly = !state.failuresOnly;
    updateToggle(failures, state.failuresOnly);
    applyNativeFilters(shell, state);
  });

  const count = createElement('span', 'test-log-explorer-count', '0 linhas');
  controls.append(wrap, failures, count);
  toolbar.append(search, controls);

  const output = shell.querySelector('.tests-log-output');
  shell.insertBefore(toolbar, output ?? null);
  return toolbar;
}

function copyFailure(failure: ParsedTestFailure): void {
  const lines = [
    failure.title,
    failure.assertion,
    failure.file ? `${failure.file}${failure.line ? `:${failure.line}` : ''}` : '',
    failure.expected ? `Esperado: ${failure.expected}` : '',
    failure.actual ? `Obtido: ${failure.actual}` : '',
    ...failure.stack,
  ].filter(Boolean);
  void navigator.clipboard?.writeText(lines.join('\n'));
}

function renderFailureDetail(
  report: ParsedTestReport,
  failure: ParsedTestFailure,
  mode: TestLogInspectorMode,
): HTMLElement {
  const detail = createElement('section', 'test-log-failure-detail');
  const heading = createElement('header', 'test-log-failure-heading');
  const headingCopy = createElement('div');
  const type = createElement('span', 'test-log-failure-type', failure.type);
  headingCopy.append(type, createElement('h5', undefined, failure.title));
  const assertion = createElement('code', undefined, failure.assertion);
  headingCopy.append(assertion);
  const copy = createElement('button', 'secondary-button test-log-copy-failure', 'Copiar trecho');
  copy.type = 'button';
  copy.addEventListener('click', () => copyFailure(failure));
  heading.append(headingCopy, copy);
  detail.append(heading);

  const meta = createElement('div', 'test-log-failure-meta');
  appendLabelValue(meta, 'Severidade', 'Alta', 'danger');
  appendLabelValue(
    meta,
    'Local',
    failure.file ? `${failure.file}${failure.line ? `:${failure.line}` : ''}` : 'Não identificado',
  );
  appendLabelValue(meta, 'Ocorrências', String(report.failed ?? report.failures.length));
  appendLabelValue(meta, 'Status', 'Falhou', 'danger');
  detail.append(meta);

  if (failure.file || failure.line) {
    const source = createElement('section', 'test-log-source-context');
    const sourceHeading = createElement('div', 'test-log-subheading');
    sourceHeading.append(
      createElement('h6', undefined, 'Trecho da falha'),
      createElement('code', undefined, `${failure.file ?? 'arquivo'}${failure.line ? `:${failure.line}` : ''}`),
    );
    const sourceLine = createElement('div', 'test-log-source-line');
    sourceLine.append(
      createElement('span', undefined, failure.line ? String(failure.line) : '•'),
      createElement('code', undefined, failure.assertion),
      createElement('strong', undefined, 'falhou aqui'),
    );
    source.append(sourceHeading, sourceLine);
    detail.append(source);
  }

  if (failure.expected || failure.actual) {
    const comparison = createElement('section', 'test-log-comparison');
    comparison.append(createElement('h6', undefined, 'Diferença entre esperado e obtido'));
    const values = createElement('div', 'test-log-comparison-grid');
    const expected = createElement('article', 'expected');
    expected.append(
      createElement('span', undefined, 'Esperado'),
      createElement('code', undefined, failure.expected ?? 'Não informado'),
    );
    const actual = createElement('article', 'actual');
    actual.append(
      createElement('span', undefined, 'Obtido'),
      createElement('code', undefined, failure.actual ?? 'Não informado'),
    );
    values.append(expected, createElement('b', undefined, '≠'), actual);
    comparison.append(values);
    detail.append(comparison);
  }

  if (failure.stack.length > 0) {
    const stack = createElement('section', 'test-log-stack');
    stack.append(createElement('h6', undefined, 'Stack trace'));
    const list = createElement('ol');
    failure.stack.forEach((line) => list.append(createElement('li', undefined, line)));
    stack.append(list);
    detail.append(stack);
  }

  if (mode === 'details') {
    const context = createElement('section', 'test-log-run-context');
    context.append(createElement('h6', undefined, 'Contexto da execução'));
    const grid = createElement('div');
    appendLabelValue(grid, 'Testes', report.total !== undefined ? String(report.total) : '—');
    appendLabelValue(grid, 'Passaram', report.passed !== undefined ? String(report.passed) : '—', 'success');
    appendLabelValue(grid, 'Falharam', report.failed !== undefined ? String(report.failed) : String(report.failures.length), 'danger');
    appendLabelValue(grid, 'Seed', report.seed ?? '—');
    appendLabelValue(grid, 'Duração', report.duration ?? '—');
    appendLabelValue(grid, 'Avisos', String(report.warningCount));
    context.append(grid);
    detail.append(context);
  }

  return detail;
}

function renderInspector(shell: HTMLElement, state: InspectorState, mode: TestLogInspectorMode): void {
  let inspector = shell.querySelector<HTMLElement>(':scope > .test-log-inspector');
  if (!inspector) {
    inspector = createElement('div', 'test-log-inspector');
    const footer = shell.querySelector('.tests-log-footer');
    shell.insertBefore(inspector, footer ?? null);
  }

  const report = parseTestLog(state.rawLog);
  if (state.selectedFailure >= report.failures.length) state.selectedFailure = 0;
  const signature = [mode, state.rawLog, state.selectedFailure].join('\u0000');
  if (state.inspectorSignature === signature) return;
  state.inspectorSignature = signature;
  inspector.replaceChildren();

  if (report.failures.length === 0) {
    const empty = createElement('div', 'test-log-inspector-empty');
    empty.append(
      createElement('strong', undefined, 'Nenhuma falha estruturada foi identificada.'),
      createElement('p', undefined, 'O log bruto continua disponível na aba Log.'),
    );
    inspector.append(empty);
    return;
  }

  const layout = createElement('div', 'test-log-inspector-layout');
  const navigation = createElement('aside', 'test-log-inspector-navigation');
  navigation.append(
    createElement('span', 'test-log-eyebrow', mode === 'details' ? 'Diagnóstico' : 'Falhas agrupadas'),
    createElement('h5', undefined, `${report.failures.length} ${report.failures.length === 1 ? 'falha' : 'falhas'}`),
  );

  const failureList = createElement('div', 'test-log-failure-list');
  report.failures.forEach((failure, index) => {
    const button = createElement('button');
    button.type = 'button';
    button.classList.toggle('active', index === state.selectedFailure);
    button.append(
      createElement('span', undefined, String(index + 1)),
      createElement('strong', undefined, failure.title),
      createElement(
        'small',
        undefined,
        failure.file ? `${failure.file}${failure.line ? `:${failure.line}` : ''}` : failure.type,
      ),
    );
    button.addEventListener('click', () => {
      state.selectedFailure = index;
      state.inspectorSignature = '';
      renderInspector(shell, state, mode);
    });
    failureList.append(button);
  });
  navigation.append(failureList);

  const summary = createElement('dl', 'test-log-navigation-summary');
  const summaryItems: Array<[string, string]> = [
    ['Erros', String(report.errorCount)],
    ['Avisos', String(report.warningCount)],
    ['Linhas relevantes', String(report.failures.reduce((total, item) => total + item.raw.length, 0))],
  ];
  summaryItems.forEach(([label, value]) => {
    const item = createElement('div');
    item.append(createElement('dt', undefined, label), createElement('dd', undefined, value));
    summary.append(item);
  });
  navigation.append(summary);

  const failure = report.failures[state.selectedFailure] ?? report.failures[0];
  if (!failure) return;
  const detail = renderFailureDetail(report, failure, mode);

  if (report.failedExamples.length > 0) {
    const examples = createElement('aside', 'test-log-failed-examples');
    examples.append(createElement('h6', undefined, `Exemplos falhos (${report.failedExamples.length})`));
    report.failedExamples.forEach((example, index) => {
      const item = createElement('div');
      item.append(
        createElement('span', undefined, String(index + 1)),
        createElement('code', undefined, example),
      );
      examples.append(item);
    });
    layout.append(navigation, detail, examples);
  } else {
    layout.append(navigation, detail);
  }

  const raw = createElement('details', 'test-log-raw-details');
  raw.append(createElement('summary', undefined, `Log bruto completo · ${normalizedLines(state.rawLog).length} linhas`));
  raw.append(createElement('pre', undefined, state.rawLog));
  inspector.append(layout, raw);
}

function enhanceShell(shell: HTMLElement): void {
  const state = getState(shell);
  const mode = activeMode(shell);
  const toolbar = ensureToolbar(shell, state);
  const output = shell.querySelector<HTMLElement>('.tests-log-output');
  const footer = shell.querySelector<HTMLElement>('.tests-log-footer');
  const inspector = shell.querySelector<HTMLElement>(':scope > .test-log-inspector');

  if (mode === 'log') {
    const nativeLog = collectNativeLog(shell);
    if (nativeLog) state.rawLog = nativeLog;
    setHidden(toolbar, false);
    setHidden(output, false);
    setHidden(footer, false);
    setHidden(inspector, true);
    applyNativeFilters(shell, state);
    return;
  }

  setHidden(toolbar, true);
  if (mode === 'errors' || mode === 'details') {
    if (!state.rawLog) state.rawLog = collectNativeLog(shell);
    renderInspector(shell, state, mode);
    setHidden(output, true);
    setHidden(footer, true);
    setHidden(shell.querySelector<HTMLElement>(':scope > .test-log-inspector'), false);
    return;
  }

  setHidden(output, false);
  setHidden(footer, false);
  setHidden(inspector, true);
}

export function enhanceTestLogInspector(root: ParentNode = document): void {
  if (root instanceof HTMLElement && root.matches('.tests-log-shell')) enhanceShell(root);
  root.querySelectorAll<HTMLElement>('.tests-log-shell').forEach(enhanceShell);
}

export function installTestLogInspector(): void {
  if (typeof document === 'undefined') return;
  if (document.documentElement.dataset.testLogInspector === 'true') return;
  document.documentElement.dataset.testLogInspector = 'true';

  enhanceTestLogInspector();
  let scheduled = false;
  const schedule = (): void => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      enhanceTestLogInspector();
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
    characterData: true,
    childList: true,
    subtree: true,
  });
}
