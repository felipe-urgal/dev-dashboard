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

test('destaca busca escapando conteúdo HTML', () => {
  const result = highlightGitDiffText('<script>return value</script>', 'return');

  assert.match(result, /&lt;script&gt;/);
  assert.match(result, /<mark>return<\/mark>/);
  assert.equal(countGitDiffMatches('Return value; return fallback;', 'return'), 2);
});
