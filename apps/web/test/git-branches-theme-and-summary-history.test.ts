import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { test } from 'vitest';

import {
  isSummaryHistoryRequest,
  rewriteSummaryHistoryUrl,
} from '../src/git-summary-current-branch-history';

test('redireciona somente o histórico do resumo para os commits exclusivos da branch', () => {
  const summaryUrl = new URL(
    'http://dashboard.local/api/projects/projeto/git/commits?page=2&pageSize=10&search=orfao',
  );
  assert.equal(isSummaryHistoryRequest(summaryUrl), true);
  assert.equal(
    rewriteSummaryHistoryUrl(summaryUrl.toString()),
    '/api/projects/projeto/git/current-branch-commits?page=2&pageSize=10&search=orfao',
  );

  const historyPageUrl = new URL(
    'http://dashboard.local/api/projects/projeto/git/commits?ref=main&page=1&pageSize=10',
  );
  assert.equal(isSummaryHistoryRequest(historyPageUrl), false);
  assert.equal(
    rewriteSummaryHistoryUrl(historyPageUrl.toString()),
    '/api/projects/projeto/git/commits?ref=main&page=1&pageSize=10',
  );
});

test('mapeia a página de branches para os tokens dos temas claro e escuro', async () => {
  const css = await readFile(
    path.resolve(process.cwd(), 'src/git-branches-theme-fix.css'),
    'utf8',
  );

  assert.match(css, /--color-surface:\s*var\(--surface-1\)/);
  assert.match(css, /--color-surface-subtle:\s*var\(--surface-2\)/);
  assert.match(css, /--color-text-strong:\s*var\(--text\)/);
  assert.match(css, /branch-state-warning[\s\S]*var\(--warning-surface\)/);
  assert.match(css, /branch-state-danger[\s\S]*var\(--danger-surface\)/);
});
