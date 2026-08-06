import { cleanLines } from './text-helpers';
import { el } from './dom-helpers';
import { failureDetail } from './failure-detail';
import { parseTestLog } from './log-parsing';
import type { InspectorState, TestLogInspectorMode } from './types';

export function renderInspector(
  shell: HTMLElement,
  state: InspectorState,
  mode: TestLogInspectorMode,
): void {
  let inspector = shell.querySelector<HTMLElement>(
    ':scope > .test-log-inspector',
  );
  if (!inspector) {
    inspector = el('div', 'test-log-inspector');
    shell.insertBefore(inspector, shell.querySelector('.tests-log-footer'));
  }
  const report = parseTestLog(state.rawLog);
  if (state.selectedFailure >= report.failures.length)
    state.selectedFailure = 0;
  const signature = `${mode}\u0000${state.selectedFailure}\u0000${state.rawLog}`;
  if (signature === state.signature) return;
  state.signature = signature;
  inspector.replaceChildren();

  if (report.failures.length === 0) {
    const empty = el('div', 'test-log-inspector-empty');
    empty.append(
      el('strong', undefined, 'Nenhuma falha estruturada foi identificada.'),
      el('p', undefined, 'O log bruto continua disponível na aba Log.'),
    );
    inspector.append(empty);
    return;
  }

  const layout = el('div', 'test-log-inspector-layout');
  const navigation = el('aside', 'test-log-inspector-navigation');
  navigation.append(
    el(
      'span',
      'test-log-eyebrow',
      mode === 'details' ? 'Diagnóstico' : 'Falhas agrupadas',
    ),
    el(
      'h5',
      undefined,
      `${report.failures.length} ${report.failures.length === 1 ? 'falha' : 'falhas'}`,
    ),
  );
  const list = el('div', 'test-log-failure-list');
  report.failures.forEach((failure, index) => {
    const button = el('button');
    button.type = 'button';
    button.classList.toggle('active', index === state.selectedFailure);
    button.append(
      el('span', undefined, String(index + 1)),
      el('strong', undefined, failure.title),
      el(
        'small',
        undefined,
        failure.file
          ? `${failure.file}${failure.line ? `:${failure.line}` : ''}`
          : failure.type,
      ),
    );
    button.addEventListener('click', () => {
      state.selectedFailure = index;
      state.signature = '';
      renderInspector(shell, state, mode);
    });
    list.append(button);
  });
  navigation.append(list);
  const summary = el('dl', 'test-log-navigation-summary');
  [
    ['Erros', report.errorCount],
    ['Avisos', report.warningCount],
    [
      'Linhas relevantes',
      report.failures.reduce((sum, item) => sum + item.raw.length, 0),
    ],
  ].forEach(([label, value]) => {
    const item = el('div');
    item.append(
      el('dt', undefined, String(label)),
      el('dd', undefined, String(value)),
    );
    summary.append(item);
  });
  navigation.append(summary);

  const selected = report.failures[state.selectedFailure] ?? report.failures[0];
  if (!selected) return;
  const detail = failureDetail(report, selected, mode);
  if (report.failedExamples.length > 0) {
    const examples = el('aside', 'test-log-failed-examples');
    examples.append(
      el('h6', undefined, `Exemplos falhos (${report.failedExamples.length})`),
    );
    report.failedExamples.forEach((example, index) => {
      const item = el('div');
      item.append(
        el('span', undefined, String(index + 1)),
        el('code', undefined, example),
      );
      examples.append(item);
    });
    layout.append(navigation, detail, examples);
  } else {
    layout.append(navigation, detail);
  }
  const raw = el('details', 'test-log-raw-details');
  raw.append(
    el(
      'summary',
      undefined,
      `Log bruto completo · ${cleanLines(state.rawLog).length} linhas`,
    ),
    el('pre', undefined, state.rawLog),
  );
  inspector.append(layout, raw);
}
