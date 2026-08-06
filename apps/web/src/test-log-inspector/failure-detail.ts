import { el, labelValue } from './dom-helpers';
import type {
  ParsedTestFailure,
  ParsedTestReport,
  TestLogInspectorMode,
} from './types';

function copyFailure(failure: ParsedTestFailure): void {
  const content = [
    failure.title,
    failure.assertion,
    failure.file
      ? `${failure.file}${failure.line ? `:${failure.line}` : ''}`
      : '',
    failure.expected ? `Esperado: ${failure.expected}` : '',
    failure.actual ? `Obtido: ${failure.actual}` : '',
    ...failure.stack,
  ]
    .filter(Boolean)
    .join('\n');
  void navigator.clipboard?.writeText(content);
}

export function failureDetail(
  report: ParsedTestReport,
  failure: ParsedTestFailure,
  mode: TestLogInspectorMode,
): HTMLElement {
  const detail = el('section', 'test-log-failure-detail');
  const header = el('header', 'test-log-failure-heading');
  const copy = el('div');
  copy.append(
    el('span', 'test-log-failure-type', failure.type),
    el('h5', undefined, failure.title),
    el('code', undefined, failure.assertion),
  );
  const copyButton = el(
    'button',
    'secondary-button test-log-copy-failure',
    'Copiar trecho',
  );
  copyButton.type = 'button';
  copyButton.addEventListener('click', () => copyFailure(failure));
  header.append(copy, copyButton);
  detail.append(header);

  const meta = el('div', 'test-log-failure-meta');
  labelValue(meta, 'Severidade', 'Alta', 'danger');
  labelValue(
    meta,
    'Local',
    failure.file
      ? `${failure.file}${failure.line ? `:${failure.line}` : ''}`
      : 'Não identificado',
  );
  labelValue(
    meta,
    'Ocorrências',
    String(report.failed ?? report.failures.length),
  );
  labelValue(meta, 'Status', 'Falhou', 'danger');
  detail.append(meta);

  if (failure.file || failure.line) {
    const source = el('section', 'test-log-source-context');
    const heading = el('div', 'test-log-subheading');
    heading.append(
      el('h6', undefined, 'Trecho da falha'),
      el(
        'code',
        undefined,
        `${failure.file ?? 'arquivo'}${failure.line ? `:${failure.line}` : ''}`,
      ),
    );
    const row = el('div', 'test-log-source-line');
    row.append(
      el('span', undefined, failure.line ? String(failure.line) : '•'),
      el('code', undefined, failure.assertion),
      el('strong', undefined, 'falhou aqui'),
    );
    source.append(heading, row);
    detail.append(source);
  }

  if (failure.expected || failure.actual) {
    const comparison = el('section', 'test-log-comparison');
    comparison.append(el('h6', undefined, 'Diferença entre esperado e obtido'));
    const grid = el('div', 'test-log-comparison-grid');
    const expected = el('article', 'expected');
    expected.append(
      el('span', undefined, 'Esperado'),
      el('code', undefined, failure.expected ?? 'Não informado'),
    );
    const actual = el('article', 'actual');
    actual.append(
      el('span', undefined, 'Obtido'),
      el('code', undefined, failure.actual ?? 'Não informado'),
    );
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
    labelValue(
      grid,
      'Testes',
      report.total !== undefined ? String(report.total) : '—',
    );
    labelValue(
      grid,
      'Passaram',
      report.passed !== undefined ? String(report.passed) : '—',
      'success',
    );
    labelValue(
      grid,
      'Falharam',
      report.failed !== undefined
        ? String(report.failed)
        : String(report.failures.length),
      'danger',
    );
    labelValue(grid, 'Seed', report.seed ?? '—');
    labelValue(grid, 'Duração', report.duration ?? '—');
    labelValue(grid, 'Avisos', String(report.warningCount));
    context.append(grid);
    detail.append(context);
  }
  return detail;
}
