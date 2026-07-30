import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';

const css = readFileSync(
  new URL('../src/test-log-theme-fix.css', import.meta.url),
  'utf8',
);

test('mantém falhas no log sem fundo e com texto vermelho', () => {
  assert.match(
    css,
    /\.tests-log-line-error\s*\{\s*background-color:\s*transparent;/s,
  );
  assert.match(
    css,
    /\.tests-log-line-error code[^\{]*\{\s*color:\s*var\(--test-log-danger\);/s,
  );
});

test('mantém somente navegação e detalhe no diagnóstico', () => {
  assert.match(
    css,
    /\.test-log-inspector-layout:has\(\.test-log-failed-examples\)\s*\{\s*grid-template-columns:\s*minmax\(190px, 220px\) minmax\(0, 1fr\);/s,
  );
  assert.match(
    css,
    /\.test-log-failed-examples,[\s\S]*\.test-log-run-context\s*\{\s*display:\s*none;/,
  );
});
