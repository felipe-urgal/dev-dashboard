import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { test } from 'vitest';

import { classifyTestLogLine } from '../src/test-log-tone-enhancer';

function sourceFile(fileName: string): string {
  return resolve(process.cwd(), 'src', fileName);
}

test('classifica linhas comuns de Vitest e Rails para o realce visual', () => {
  assert.equal(classifyTestLogLine('........................................'), 'progress');
  assert.equal(
    classifyTestLogLine('✓ spec/ui/components/footer/index.spec.tsx (5 tests) 472ms'),
    'file',
  );
  assert.equal(classifyTestLogLine('Tests 4649 passed (4649)'), 'summary');
  assert.equal(classifyTestLogLine('bundle exec rails test test/models/user_test.rb'), 'command');
  assert.equal(classifyTestLogLine('(node:110717) TimeoutNaNWarning: NaN is not a number.'), 'runtime');
  assert.equal(classifyTestLogLine('from /workspace/app/lib/task.rb:42:in `run`'), 'stack');
  assert.equal(classifyTestLogLine('texto comum do runner'), null);
});

test('mantem o log de testes dentro do painel e permite quebra de linhas longas', async () => {
  const css = await readFile(sourceFile('test-log-visual-polish.css'), 'utf8');

  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /grid-template-columns:\s*48px minmax\(0, 1fr\)/);
  assert.match(css, /white-space:\s*pre-wrap/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /test-log-visual-progress/);
  assert.match(css, /tests-log-line-error/);
});

test('mantem a quebra de linha e reduz o destaque das sequencias de pontos de progresso', async () => {
  const css = await readFile(sourceFile('test-log-visual-polish.css'), 'utf8');
  const progressRule = css.match(/test-log-visual-progress code\s*\{([^}]*)\}/)?.[1] ?? '';

  assert.doesNotMatch(progressRule, /white-space:\s*nowrap/);
  assert.match(progressRule, /color:\s*var\(--test-log-muted\)/);
});

test('usa o mesmo comportamento responsivo e semantico da pagina de diff nos diffs inline', async () => {
  const css = await readFile(sourceFile('git-inline-diff-theme.css'), 'utf8');

  assert.match(css, /git-inline-diff-unified[\s\S]*min-width:\s*0/);
  assert.match(css, /git-inline-diff-line[\s\S]*minmax\(0, 1fr\)/);
  assert.match(css, /git-inline-diff-side[\s\S]*overflow:\s*hidden/);
  assert.match(css, /white-space:\s*pre-wrap/);
  assert.match(css, /is-addition[\s\S]*var\(--git-inline-addition-bg\)/);
  assert.match(css, /is-deletion[\s\S]*var\(--git-inline-deletion-bg\)/);
  assert.match(css, /repeating-linear-gradient/);
});
