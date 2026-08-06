import assert from 'node:assert/strict';

import { test } from 'vitest';

import { buildSummaryHistorySearchUrl } from '../src/git-summary-global-search-fix';

test('monta a busca do resumo para todo o histórico e volta para a primeira página', () => {
  const url = new URL(
    buildSummaryHistorySearchUrl(
      'projeto com espaço',
      '  correção urgente  ',
      0,
    ),
    'http://dashboard.local',
  );

  assert.equal(
    url.pathname,
    '/api/projects/projeto%20com%20espa%C3%A7o/git/commits',
  );
  assert.equal(url.searchParams.get('search'), 'correção urgente');
  assert.equal(url.searchParams.get('page'), '1');
  assert.equal(url.searchParams.get('pageSize'), '10');
});

test('preserva a página dos resultados e remove busca vazia', () => {
  const url = new URL(
    buildSummaryHistorySearchUrl('p1', '   ', 3),
    'http://dashboard.local',
  );

  assert.equal(url.searchParams.has('search'), false);
  assert.equal(url.searchParams.get('page'), '3');
  assert.equal(url.searchParams.get('pageSize'), '10');
});
