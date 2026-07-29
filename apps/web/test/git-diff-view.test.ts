import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  buildSplitGitDiffRows,
  countGitDiffMatches,
  highlightGitDiffText,
  parseUnifiedGitDiff,
} from '../src/utils/git-diff-view';

const sample = [
  'diff --git a/src/app.ts b/src/app.ts',
  'index 1111111..2222222 100644',
  '--- a/src/app.ts',
  '+++ b/src/app.ts',
  '@@ -10,3 +10,4 @@ export function run() {',
  ' const current = true;',
  '-return oldValue;',
  '+const nextValue = compute();',
  '+return nextValue;',
  ' }',
].join('\n');

test('parseia números e tipos de linha do diff unificado', () => {
  const lines = parseUnifiedGitDiff(sample);
  const deletion = lines.find((line) => line.kind === 'deletion');
  const additions = lines.filter((line) => line.kind === 'addition');
  const context = lines.find((line) => line.kind === 'context');

  assert.equal(deletion?.oldLine, 11);
  assert.equal(deletion?.newLine, null);
  assert.equal(additions[0]?.newLine, 11);
  assert.equal(additions[1]?.newLine, 12);
  assert.equal(context?.oldLine, 10);
  assert.equal(context?.newLine, 10);
});

test('alinha remoções e adições na visualização lado a lado', () => {
  const rows = buildSplitGitDiffRows(parseUnifiedGitDiff(sample));
  const changes = rows.filter((row) => row.kind === 'change');

  assert.equal(changes.length, 2);
  assert.equal(changes[0]?.left?.text, 'return oldValue;');
  assert.equal(changes[0]?.right?.text, 'const nextValue = compute();');
  assert.equal(changes[1]?.left, null);
  assert.equal(changes[1]?.right?.text, 'return nextValue;');
});

test('omite contexto repetido dos hunks seguintes e preserva contextos diferentes', () => {
  const lines = parseUnifiedGitDiff([
    '@@ -18,7 +18,7 @@ class ApplicationController < ActionController::Base',
    ' first',
    '@@ -37,7 +37,7 @@ class ApplicationController < ActionController::Base',
    ' second',
    '@@ -52,7 +52,7 @@ def current_ability',
    ' third',
  ].join('\n')).filter((line) => line.kind === 'hunk');

  assert.equal(
    lines[0]?.text,
    '@@ -18,7 +18,7 @@ class ApplicationController < ActionController::Base',
  );
  assert.equal(lines[1]?.text, '@@ -37,7 +37,7 @@');
  assert.equal(lines[2]?.text, '@@ -52,7 +52,7 @@ def current_ability');
});

test('omite os cabeçalhos técnicos redundantes do arquivo (diff --git/index/---/+++)', () => {
  const lines = parseUnifiedGitDiff(sample);
  const metaTexts = lines
    .filter((line) => line.kind === 'meta')
    .map((line) => line.text);

  assert.deepEqual(metaTexts, []);
  assert.equal(lines.length, 6);
});

test('preserva metadados informativos que não são redundantes', () => {
  const lines = parseUnifiedGitDiff([
    'diff --git a/src/old-name.ts b/src/new-name.ts',
    'similarity index 98%',
    'rename from src/old-name.ts',
    'rename to src/new-name.ts',
    'index 1111111..2222222 100644',
    '--- a/src/old-name.ts',
    '+++ b/src/new-name.ts',
  ].join('\n'));

  const metaTexts = lines.map((line) => line.text);

  assert.deepEqual(metaTexts, [
    'similarity index 98%',
    'rename from src/old-name.ts',
    'rename to src/new-name.ts',
  ]);
});

test('destaca busca escapando conteúdo HTML', () => {
  const result = highlightGitDiffText('<script>return value</script>', 'return');

  assert.match(result, /&lt;script&gt;/);
  assert.match(result, /<mark>return<\/mark>/);
  assert.equal(countGitDiffMatches('Return value; return fallback;', 'return'), 2);
});
