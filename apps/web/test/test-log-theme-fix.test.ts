import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { test } from 'vitest';

function sourceFile(fileName: string): string {
  return resolve(process.cwd(), 'src', fileName);
}

test('aplica o tema do log e mantém o diagnóstico enxuto', async () => {
  const css = await readFile(sourceFile('test-log-theme-fix.css'), 'utf8');

  assert.match(
    css,
    /html\[data-theme='light'\][\s\S]*--test-log-background:\s*#ffffff/,
  );
  assert.match(
    css,
    /html\[data-theme='dark'\][\s\S]*--test-log-background:\s*#0d1117/,
  );
  assert.match(css, /background-color:\s*var\(--test-log-background\)/);
  assert.match(
    css,
    /li\s*>\s*span[\s\S]*background-color:\s*var\(--test-log-gutter\)/,
  );
  assert.match(
    css,
    /test-log-visual-progress[\s\S]*var\(--test-log-progress-surface\)/,
  );
  assert.ok(
    css.includes('.tests-log-line-error {\n  background-color: transparent;'),
  );
  assert.ok(css.includes('color: var(--test-log-danger);'));
  assert.ok(
    css.includes('grid-template-columns: minmax(190px, 220px) minmax(0, 1fr);'),
  );
  assert.ok(css.includes('.test-log-failed-examples,'));
  assert.ok(css.includes('.test-log-run-context {\n  display: none;'));
});
