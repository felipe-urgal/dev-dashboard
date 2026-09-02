import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { test } from 'vitest';

function sourceFile(fileName: string): string {
  return resolve(process.cwd(), 'src', fileName);
}

test('usa o mesmo comportamento responsivo e semantico da pagina de diff nos diffs inline', async () => {
  const css = await readFile(
    sourceFile('styles/features/git-inline-diff-theme.css'),
    'utf8',
  );

  assert.match(css, /git-inline-diff-unified[\s\S]*min-width:\s*0/);
  assert.match(css, /git-inline-diff-line[\s\S]*minmax\(0, 1fr\)/);
  assert.match(css, /git-inline-diff-side[\s\S]*overflow:\s*hidden/);
  assert.match(css, /white-space:\s*pre-wrap/);
  assert.match(css, /is-addition[\s\S]*var\(--git-inline-addition-bg\)/);
  assert.match(css, /is-deletion[\s\S]*var\(--git-inline-deletion-bg\)/);
  assert.match(css, /repeating-linear-gradient/);
});

test('não força display grid no cabeçalho de hunk da página de diff', async () => {
  const css = await readFile(
    sourceFile('components/ProjectGitDiffPage.css'),
    'utf8',
  );
  const hunkRule = css.match(/\.git-diff-hunk-head\s*\{([^}]*)\}/)?.[1] ?? '';

  assert.doesNotMatch(hunkRule, /display:\s*grid/);
});
