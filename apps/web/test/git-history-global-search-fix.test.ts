import assert from 'node:assert/strict';
import { test } from 'vitest';

import { applyGlobalHistoryFilters } from '../src/git-history-global-search-fix';

test('aplica busca, autor e tipo à consulta exclusiva e paginada do histórico', () => {
  const path = applyGlobalHistoryFilters(
    '/api/projects/project-1/git/commits?ref=feature/teste&page=4&pageSize=10',
    {
      search: 'corrige paginação',
      author: 'felipe@example.test',
      kind: 'merge',
    },
    true,
  );
  const url = new URL(path, 'http://dashboard.local');

  assert.equal(
    url.pathname,
    '/api/projects/project-1/git/exclusive-branch-commits',
  );
  assert.equal(url.searchParams.get('ref'), 'feature/teste');
  assert.equal(url.searchParams.get('page'), '1');
  assert.equal(url.searchParams.get('pageSize'), '10');
  assert.equal(url.searchParams.get('search'), 'corrige paginação');
  assert.equal(url.searchParams.get('author'), 'felipe@example.test');
  assert.equal(url.searchParams.get('kind'), 'merge');
});

test('remove filtros vazios sem alterar a página atual', () => {
  const path = applyGlobalHistoryFilters(
    '/api/projects/project-1/git/commits?ref=main&page=3&pageSize=10&search=antiga&kind=merge',
    {
      search: ' ',
      author: '',
      kind: 'all',
    },
  );
  const url = new URL(path, 'http://dashboard.local');

  assert.equal(
    url.pathname,
    '/api/projects/project-1/git/exclusive-branch-commits',
  );
  assert.equal(url.searchParams.get('page'), '3');
  assert.equal(url.searchParams.has('search'), false);
  assert.equal(url.searchParams.has('author'), false);
  assert.equal(url.searchParams.has('kind'), false);
});
