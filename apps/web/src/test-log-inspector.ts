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
  signature: string;
}

const stateByShell = new WeakMap<HTMLElement, InspectorState>();
const ANSI_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const STACK_PATH_PATTERN = /((?:\.{0,2}\/|[A-Za-z]:\\)[^\s:]+):(\d+)(?::\d+)?/;

function cleanLines(value: string): string[] {
  return value
    .replace(ANSI_PATTERN, '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''));
}

function compact(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result || undefined;
}

function isErrorText(value: string): boolean {
  if (/\b0\s+(?:failed|failures|errors)\b/i.test(value)) return false;
  return /\b(?:error|failed|failure|syntaxerror|exception|unexpected|undefined method|cannot|enoent)\b/i.test(value);
}

function isWarningText(value: string): boolean {
  return /\b(?:warning|warn|deprecated|deprecation)\b/i.test(value);
}

function parseSummary(lines: string[]): Omit<ParsedTestReport, 'failures' | 'failedExamples' | 'warningCount' | 'errorCount'> {
  const source = lines.join('\n');
  const rspec = /\b(\d+)\s+examples?,\s*(\d+)\s+failures?/i.exec(source);
  const rails = /\b(\d+)\s+runs?,\s*(\d+)\s+assertions?,\s*(\d+)\s+failures?,\s*(\d+)\s+errors?/i.exec(source);
  const vitestPassed = /\bTests\s+(\d+)\s+passed\b/i.exec(source)
    ?? /\b(\d+)\s+tests?\s+passed\b/i.exec(source);
  const vitestFailed = /\bTests\s+(?:\d+\s+passed\s*\|\s*)?(\d+)\s+failed\b/i.exec(source)
    ?? /\b(\d+)\s+tests?\s+failed\b/i.exec(source);

  let total: number | undefined;
  let failed: number | undefined;
  let passed: number | undefined;
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
    ...(total !== undefined ? { total } : {}),
    ...(failed !== undefined ? { failed } : {}),
    ...(passed !== undefined ? { passed } : {}),
    ...(duration ? { duration } : {}),
    ...(seed ? { seed } : {}),
  };
}

function failureBlocks(lines: string[]): string[][] {
  const failuresStart = lines.findIndex((line) => /^\s*Failures:\s*$/i.test(line));
  const start = failuresStart >= 0 ? failuresStart + 1 : 0;
  const indexes: number[] = [];
  for (let index = start; index < lines.length; index += 1) {
    if (/^\s*\d+\)\s+\S/.test(lines[index] ?? '')) indexes.push(index);
  }

  if (indexes.length > 0) {
    return indexes.map((blockStart, position) => {
      const next = indexes[position + 1] ?? lines.length;
      let end = next;
      for (let index = blockStart + 1; index < next; index += 1) {
        if (/^\s*(?:Failed examples:|Finished in\b|\d+\s+examples?,)/i.test(lines[index] ?? '')) {
          end = index;
          break;
        }
      }
      return lines.slice(blockStart, end);
    });
  }

  const fallback = lines.findIndex((line) => /Failure\/Error:|AssertionError|expected.+(?:got|received)/i.test(line));
  return fallback < 0
    ? []
    : [lines.slice(Math.max(0, fallback - 2), Math.min(lines.length, fallback + 12))];
}

function stackCandidates(block: string[]): string[] {
  const explicit = block.filter((line) => /^\s*(?:#|at\s+|from\s+)/i.test(line));
  const testPaths = block.filter((line) => /(?:^|\s)(?:\.{0,2}\/)?(?:spec|test|tests|__tests__)\//i.test(line));
  return [...explicit, ...testPaths].filter((line, index, values) => values.indexOf(line) === index);
}

function parseLocation(block: string[]): { file?: string; line?: number } {
  for (const value of stackCandidates(block)) {
    const match = STACK_PATH_PATTERN.exec(value);
    if (match?.[1] && match[2]) return { file: match[1], line: Number(match[2]) };
  }
  return {};
}

function parseFailure(block: string[], index: number): ParsedTestFailure {
  const heading = block.find((line) => /^\s*\d+\)\s+\S/.test(line));
  const title = compact(heading?.replace(/^\s*\d+\)\s+/, '')) ?? `Falha ${index + 1}`;
  const failureIndex = block.findIndex((line) => /Failure\/Error:|AssertionError/i.test(line));
  const failureLine = failureIndex >= 0 ? block[failureIndex] : undefined;
  const inline = failureLine?.replace(/^.*?(?:Failure\/Error:|AssertionError:?)/i, '').trim();
  const following = failureIndex >= 0
    ? block.slice(failureIndex + 1).find((line) => line.trim() && !STACK_PATH_PATTERN.test(line))?.trim()
    : undefined;
  const assertion = compact(inline) ?? compact(following) ?? title;
  const expectedLine = block.find((line) => /^\s*(?:expected|Expected):/i.test(line));
  const actualLine = block.find((line) => /^\s*(?:got|received|Received|actual):/i.test(line));
  const expected = compact(expectedLine?.replace(/^\s*(?:expected|Expected):\s*/i, ''));
  const actual = compact(actualLine?.replace(/^\s*(?:got|received|Received|actual):\s*/i, ''));
  const location = parseLocation(block);
  const stack = stackCandidates(block).map((line) => line.trim()).slice(0, 8);
  const type = failureLine?.match(/Failure\/Error|AssertionError|[A-Z][A-Za-z]+Error/)?.[0]
    ?? (expected || actual ? 'Falha de assertion' : 'Falha de teste');

  return {
    id: `failure-${index + 1}`,
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

function failedExamples(lines: string[]): string[] {
  const start = lines.findIndex((line) => /^\s*Failed examples:\s*$/i.test(line));
  if (start < 0) return [];
  return lines
    .slice(start + 1)
    .filter((line) => /^\s*(?:rspec|bin\/rails test|pytest)\s+/i.test(line))
    .map((line) => line.trim())
    .slice(0, 20);
}

export function parseTestLog(value: string): ParsedTestReport {
  const lines = cleanLines(value);
  const failures = failureBlocks(lines).map(parseFailure);
  if (failures.length === 0) {
    const errors = lines.filter(isErrorText).slice(0, 12);
    if (errors.length > 0) {
      const location = parseLocation(errors);
      failures.push({
        id: 'failure-1',
        title: 'Falha identificada no log',
        type: errors[0]?.match(/[A-Z][A-Za-z]+Error/)?.[0] ?? 'Erro do runner',
        assertion: errors[0] ?? 'Falha de teste',
        ...location,
        stack: stackCandidates(errors).map((line) => line.trim()),
        raw: errors,
      });
    }
  }
  return {
    failures,
    failedExamples: failedExamples(lines),
    ...parseSummary(lines),
    warningCount: lines.filter(isWarningText).length,
    errorCount: lines.filter(isErrorText).length,
  };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function labelValue(parent: HTMLElement, label: string, value: string, className?: string): void {
  const item = el('div', className);
  item.append(el('span', undefined, label), el('strong', undefined, value));
  parent.append(item);
}

function getState(shell: HTMLElement): InspectorState {
  const current = stateByShell.get(shell);
  if (current) return current;
  const state: InspectorState = {
    rawLog: '',
    query: '',
    wrapLines: true,
    failuresOnly: false,
    selectedFailure: 0,
    signature: '',
  };
  stateByShell.set(shell, state);
  return state;
}

function collectLog(shell: HTMLElement): string {
  return Array.from(shell.querySelectorAll<HTMLElement>('.tests-log-lines li code'))
    .map((line) => line.textContent ?? '')
    .join('\n');
}

function modeFor(shell: HTMLElement): TestLogInspectorMode {
  const label = shell.querySelector<HTMLButtonElement>('.tests-log-tabs button.active')?.textContent?.trim().toLowerCase() ?? 'log';
  if (label.startsWith('erros')) return 'errors';
  if (label.startsWith('avisos')) return 'warnings';
  if (label.startsWith('detalhes')) return 'details';
  return 'log';
}

function hidden(node: HTMLElement | null, value: boolean): void {
  if (node && node.hidden !== value) node.hidden = value;
}

function updatePressed(button: HTMLButtonElement, active: boolean): void {
  button.setAttribute('aria-pressed', String(active));
  button.classList.toggle('active', active);
}

function applyFilters(shell: HTMLElement, state: InspectorState): void {
  const viewport = shell.querySelector<HTMLElement>('.tests-log-output');
  const rows = Array.from(shell.querySelectorAll<HTMLElement>('.tests-log-lines > li'));
  if (!viewport) return;
  viewport.classList.toggle('test-log-inspector-wrap', state.wrapLines);
  viewport.classList.toggle('test-log-inspector-nowrap', !state.wrapLines);
  const query = state.query.trim().toLocaleLowerCase('pt-BR');
  const context = new Set<number>();
  if (state.failuresOnly) {
    rows.forEach((row, index) => {
      if (row.classList.contains('tests-log-line-error') || isErrorText(row.textContent ?? '')) {
        for (let offset = -2; offset <= 2; offset += 1) context.add(index + offset);
      }
    });
  }
  let visible = 0;
  rows.forEach((row, index) => {
    const matchesQuery = !query || (row.textContent ?? '').toLocaleLowerCase('pt-BR').includes(query);
    const show = matchesQuery && (!state.failuresOnly || context.has(index));
    if (row.style.display !== (show ? '' : 'none')) row.style.display = show ? '' : 'none';
    if (show) visible += 1;
  });
  const count = shell.querySelector<HTMLElement>('.test-log-explorer-count');
  if (count) count.textContent = `${visible} de ${rows.length} linhas`;
}

function toolbarFor(shell: HTMLElement, state: InspectorState): HTMLElement {
  const current = shell.querySelector<HTMLElement>(':scope > .test-log-explorer-toolbar');
  if (current) return current;
  const toolbar = el('div', 'test-log-explorer-toolbar');
  const search = el('label', 'test-log-explorer-search');
  search.append(el('span', undefined, 'Buscar no log'));
  const input = el('input');
  input.type = 'search';
  input.placeholder = 'Mensagem, arquivo ou valor…';
  input.addEventListener('input', () => {
    state.query = input.value;
    applyFilters(shell, state);
  });
  search.append(input);
  const controls = el('div', 'test-log-explorer-controls');
  const wrap = el('button', undefined, 'Quebrar linhas');
  wrap.type = 'button';
  updatePressed(wrap, state.wrapLines);
  wrap.addEventListener('click', () => {
    state.wrapLines = !state.wrapLines;
    updatePressed(wrap, state.wrapLines);
    applyFilters(shell, state);
  });
  const failures = el('button', undefined, 'Contexto das falhas');
  failures.type = 'button';
  updatePressed(failures, state.failuresOnly);
  failures.addEventListener('click', () => {
    state.failuresOnly = !state.failuresOnly;
    updatePressed(failures, state.failuresOnly);
    applyFilters(shell, state);
  });
  controls.append(wrap, failures, el('span', 'test-log-explorer-count', '0 linhas'));
  toolbar.append(search, controls);
  shell.insertBefore(toolbar, shell.querySelector('.tests-log-output'));
  return toolbar;
}

function copyFailure(failure: ParsedTestFailure): void {
  const content = [
    failure.title,
    failure.assertion,
    failure.file ? `${failure.file}${failure.line ? `:${failure.line}` : ''}` : '',
    failure.expected ? `Esperado: ${failure.expected}` : '',
    failure.actual ? `Obtido: ${failure.actual}` : '',
    ...failure.stack,
  ].filter(Boolean).join('\n');
  void navigator.clipboard?.writeText(content);
}

function failureDetail(report: ParsedTestReport, failure: ParsedTestFailure, mode: TestLogInspectorMode): HTMLElement {
  const detail = el('section', 'test-log-failure-detail');
  const header = el('header', 'test-log-failure-heading');
  const copy = el('div');
  copy.append(el('span', 'test-log-failure-type', failure.type), el('h5', undefined, failure.title), el('code', undefined, failure.assertion));
  const copyButton = el('button', 'secondary-button test-log-copy-failure', 'Copiar trecho');
  copyButton.type = 'button';
  copyButton.addEventListener('click', () => copyFailure(failure));
  header.append(copy, copyButton);
  detail.append(header);

  const meta = el('div', 'test-log-failure-meta');
  labelValue(meta, 'Severidade', 'Alta', 'danger');
  labelValue(meta, 'Local', failure.file ? `${failure.file}${failure.line ? `:${failure.line}` : ''}` : 'Não identificado');
  labelValue(meta, 'Ocorrências', String(report.failed ?? report.failures.length));
  labelValue(meta, 'Status', 'Falhou', 'danger');
  detail.append(meta);

  if (failure.file || failure.line) {
    const source = el('section', 'test-log-source-context');
    const heading = el('div', 'test-log-subheading');
    heading.append(el('h6', undefined, 'Trecho da falha'), el('code', undefined, `${failure.file ?? 'arquivo'}${failure.line ? `:${failure.line}` : ''}`));
    const row = el('div', 'test-log-source-line');
    row.append(el('span', undefined, failure.line ? String(failure.line) : '•'), el('code', undefined, failure.assertion), el('strong', undefined, 'falhou aqui'));
    source.append(heading, row);
    detail.append(source);
  }

  if (failure.expected || failure.actual) {
    const comparison = el('section', 'test-log-comparison');
    comparison.append(el('h6', undefined, 'Diferença entre esperado e obtido'));
    const grid = el('div', 'test-log-comparison-grid');
    const expected = el('article', 'expected');
    expected.append(el('span', undefined, 'Esperado'), el('code', undefined, failure.expected ?? 'Não informado'));
    const actual = el('article', 'actual');
    actual.append(el('span', undefined, 'Obtido'), el('code', undefined, failure.actual ?? 'Não informado'));
    grid.append(expected, el('b', undefined, '≠'), actual);
    comparison.append(grid);
    detail.append(comparison);
  }

  if (failure.stack.length > 0) {
    const stack = el('section', 'test-log-stack');
    stack.append(el('h6', undefined, 'Stack trace'));
    const list = el('ol');
    failure.stack.forEach((line) => list.append(el('li', undefined, line)));
    stack.append(list);
    detail.append(stack);
  }

  if (mode === 'details') {
    const context = el('section', 'test-log-run-context');
    context.append(el('h6', undefined, 'Contexto da execução'));
    const grid = el('div');
    labelValue(grid, 'Testes', report.total !== undefined ? String(report.total) : '—');
    labelValue(grid, 'Passaram', report.passed !== undefined ? String(report.passed) : '—', 'success');
    labelValue(grid, 'Falharam', report.failed !== undefined ? String(report.failed) : String(report.failures.length), 'danger');
    labelValue(grid, 'Seed', report.seed ?? '—');
    labelValue(grid, 'Duração', report.duration ?? '—');
    labelValue(grid, 'Avisos', String(report.warningCount));
    context.append(grid);
    detail.append(context);
  }
  return detail;
}

function renderInspector(shell: HTMLElement, state: InspectorState, mode: TestLogInspectorMode): void {
  let inspector = shell.querySelector<HTMLElement>(':scope > .test-log-inspector');
  if (!inspector) {
    inspector = el('div', 'test-log-inspector');
    shell.insertBefore(inspector, shell.querySelector('.tests-log-footer'));
  }
  const report = parseTestLog(state.rawLog);
  if (state.selectedFailure >= report.failures.length) state.selectedFailure = 0;
  const signature = `${mode}\u0000${state.selectedFailure}\u0000${state.rawLog}`;
  if (signature === state.signature) return;
  state.signature = signature;
  inspector.replaceChildren();

  if (report.failures.length === 0) {
    const empty = el('div', 'test-log-inspector-empty');
    empty.append(el('strong', undefined, 'Nenhuma falha estruturada foi identificada.'), el('p', undefined, 'O log bruto continua disponível na aba Log.'));
    inspector.append(empty);
    return;
  }

  const layout = el('div', 'test-log-inspector-layout');
  const navigation = el('aside', 'test-log-inspector-navigation');
  navigation.append(el('span', 'test-log-eyebrow', mode === 'details' ? 'Diagnóstico' : 'Falhas agrupadas'), el('h5', undefined, `${report.failures.length} ${report.failures.length === 1 ? 'falha' : 'falhas'}`));
  const list = el('div', 'test-log-failure-list');
  report.failures.forEach((failure, index) => {
    const button = el('button');
    button.type = 'button';
    button.classList.toggle('active', index === state.selectedFailure);
    button.append(el('span', undefined, String(index + 1)), el('strong', undefined, failure.title), el('small', undefined, failure.file ? `${failure.file}${failure.line ? `:${failure.line}` : ''}` : failure.type));
    button.addEventListener('click', () => {
      state.selectedFailure = index;
      state.signature = '';
      renderInspector(shell, state, mode);
    });
    list.append(button);
  });
  navigation.append(list);
  const summary = el('dl', 'test-log-navigation-summary');
  [['Erros', report.errorCount], ['Avisos', report.warningCount], ['Linhas relevantes', report.failures.reduce((sum, item) => sum + item.raw.length, 0)]].forEach(([label, value]) => {
    const item = el('div');
    item.append(el('dt', undefined, String(label)), el('dd', undefined, String(value)));
    summary.append(item);
  });
  navigation.append(summary);

  const selected = report.failures[state.selectedFailure] ?? report.failures[0];
  if (!selected) return;
  const detail = failureDetail(report, selected, mode);
  if (report.failedExamples.length > 0) {
    const examples = el('aside', 'test-log-failed-examples');
    examples.append(el('h6', undefined, `Exemplos falhos (${report.failedExamples.length})`));
    report.failedExamples.forEach((example, index) => {
      const item = el('div');
      item.append(el('span', undefined, String(index + 1)), el('code', undefined, example));
      examples.append(item);
    });
    layout.append(navigation, detail, examples);
  } else {
    layout.append(navigation, detail);
  }
  const raw = el('details', 'test-log-raw-details');
  raw.append(el('summary', undefined, `Log bruto completo · ${cleanLines(state.rawLog).length} linhas`), el('pre', undefined, state.rawLog));
  inspector.append(layout, raw);
}

function enhanceShell(shell: HTMLElement): void {
  const state = getState(shell);
  const mode = modeFor(shell);
  const toolbar = toolbarFor(shell, state);
  const output = shell.querySelector<HTMLElement>('.tests-log-output');
  const footer = shell.querySelector<HTMLElement>('.tests-log-footer');
  const inspector = shell.querySelector<HTMLElement>(':scope > .test-log-inspector');
  if (mode === 'log') {
    const log = collectLog(shell);
    if (log) state.rawLog = log;
    hidden(toolbar, false);
    hidden(output, false);
    hidden(footer, false);
    hidden(inspector, true);
    applyFilters(shell, state);
    return;
  }
  hidden(toolbar, true);
  if (mode === 'errors' || mode === 'details') {
    if (!state.rawLog) state.rawLog = collectLog(shell);
    renderInspector(shell, state, mode);
    hidden(output, true);
    hidden(footer, true);
    hidden(shell.querySelector<HTMLElement>(':scope > .test-log-inspector'), false);
    return;
  }
  hidden(output, false);
  hidden(footer, false);
  hidden(inspector, true);
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
