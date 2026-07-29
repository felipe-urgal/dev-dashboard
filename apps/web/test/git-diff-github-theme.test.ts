import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'vitest';

test('aplica a paleta semântica a todas as visualizações de diff', async () => {
  const css = await readFile(
    new URL('../src/git-diff-github-theme.css', import.meta.url),
    'utf8',
  );

  assert.match(css, /--git-diff-addition-bg/);
  assert.match(css, /--git-diff-deletion-bg/);
  assert.match(css, /git-diff-unified-row\.is-addition/);
  assert.match(css, /git-diff-side-cell\.is-deletion/);
  assert.match(css, /git-inline-diff-line\.is-addition/);
  assert.match(css, /git-inline-diff-side\.is-deletion/);
  assert.match(css, /git-commit-detail-patch/);
  assert.match(css, /git-history-page-patch/);
  assert.match(css, /git-stash-patch/);
  assert.match(css, /white-space:\s*pre-wrap/);
});
