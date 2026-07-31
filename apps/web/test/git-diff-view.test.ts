import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  annotateGitDiffWordChanges,
  buildGitDiffContextLines,
  buildSplitGitDiffRows,
  computeGitDiffWordRanges,
  countGitDiffMatches,
  highlightGitDiffText,
  parseUnifiedGitDiff,
  renderGitDiffLineHtml,
  splitGitDiffHunks,
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

test('marca apenas o trecho alterado entre linhas parecidas', () => {
  const ranges = computeGitDiffWordRanges(
    '        termos de uso e política de privacidade.',
    '        termos de uso e política de privacidade. teste',
  );

  assert.ok(ranges);
  assert.deepEqual(ranges!.left, []);
  assert.equal(ranges!.right.length, 1);
  const changed = '        termos de uso e política de privacidade. teste'
    .slice(ranges!.right[0]!.start, ranges!.right[0]!.end);
  assert.equal(changed, ' teste');
});

test('não marca trechos quando as linhas são diferentes demais', () => {
  assert.equal(
    computeGitDiffWordRanges('const value = 1;', '<Form.Check className="mt-4" id="x" />'),
    null,
  );
});

test('anota palavras alteradas nos pares removido/adicionado', () => {
  const lines = annotateGitDiffWordChanges(parseUnifiedGitDiff([
    '@@ -1,1 +1,1 @@',
    '-const value = 1;',
    '+const value = 2;',
  ].join('\n')));

  const deletion = lines.find((line) => line.kind === 'deletion');
  const addition = lines.find((line) => line.kind === 'addition');
  assert.equal(deletion?.words?.length, 1);
  assert.equal(addition?.words?.length, 1);
  assert.equal(
    'const value = 2;'.slice(addition!.words![0]!.start, addition!.words![0]!.end),
    '2',
  );
});

test('renderiza destaque de palavra junto com a busca no diff', () => {
  const html = renderGitDiffLineHtml('const value = 2;', {
    words: [{ start: 14, end: 15 }],
    query: 'value',
  });

  assert.match(html, /<mark>value<\/mark>/);
  assert.match(html, /<span class="git-diff-word">2<\/span>/);
});

test('escapa HTML mesmo com destaque de palavra', () => {
  const html = renderGitDiffLineHtml('<Form disabled />', { words: [{ start: 0, end: 5 }] });
  assert.ok(!html.includes('<Form'));
  assert.match(html, /&lt;Form/);
});

test('agrupa o diff em hunks com deslocamento de numeração', () => {
  const { leading, hunks } = splitGitDiffHunks(parseUnifiedGitDiff(sample));

  assert.equal(hunks.length, 1);
  assert.equal(leading.length, 0);
  assert.equal(hunks[0]?.lineOffset, 0);
  assert.equal(hunks[0]?.firstNewLine, 10);
  assert.equal(hunks[0]?.lastNewLine, 13);
});

test('numera as linhas de contexto expandidas nos dois lados', () => {
  const lines = buildGitDiffContextLines(['alfa', 'beta'], 10, 4);

  assert.deepEqual(lines.map((line) => line.newLine), [10, 11]);
  assert.deepEqual(lines.map((line) => line.oldLine), [6, 7]);
  assert.ok(lines.every((line) => line.kind === 'context'));
});
