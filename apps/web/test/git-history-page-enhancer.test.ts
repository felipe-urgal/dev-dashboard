import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  filterHistoryCommits,
  uniqueHistoryAuthors,
  type GitHistoryCommit,
} from '../src/git-history-page-enhancer';

const commits: GitHistoryCommit[] = [
  {
    hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    shortHash: 'aaaaaaa',
    subject: 'feat: adiciona histórico',
    authorName: 'Felipe Urgal',
    authorEmail: 'felipe@example.test',
    authoredAt: '2026-07-29T10:00:00-03:00',
    parentCount: 1,
  },
  {
    hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    shortHash: 'bbbbbbb',
    subject: 'Merge branch main into feature/history',
    authorName: 'Dashboard Bot',
    authorEmail: 'bot@example.test',
    authoredAt: '2026-07-28T10:00:00-03:00',
    parentCount: 2,
  },
  {
    hash: 'cccccccccccccccccccccccccccccccccccccccc',
    shortHash: 'ccccccc',
    subject: 'fix: corrige paginação',
    authorName: 'Felipe Urgal',
    authorEmail: 'felipe@example.test',
    authoredAt: '2026-07-27T10:00:00-03:00',
    parentCount: 1,
  },
];

test('filtra histórico por busca, autor e tipo', () => {
  assert.deepEqual(
    filterHistoryCommits(commits, 'paginação', '', 'all').map((commit) => commit.shortHash),
    ['ccccccc'],
  );
  assert.deepEqual(
    filterHistoryCommits(commits, '', 'bot@example.test', 'all').map((commit) => commit.shortHash),
    ['bbbbbbb'],
  );
  assert.deepEqual(
    filterHistoryCommits(commits, '', '', 'merge').map((commit) => commit.shortHash),
    ['bbbbbbb'],
  );
  assert.deepEqual(
    filterHistoryCommits(commits, '', '', 'regular').map((commit) => commit.shortHash),
    ['aaaaaaa', 'ccccccc'],
  );
});

test('busca também por hash e email sem diferenciar maiúsculas', () => {
  assert.equal(filterHistoryCommits(commits, 'AAAAAAA', '', 'all').length, 1);
  assert.equal(filterHistoryCommits(commits, 'BOT@EXAMPLE.TEST', '', 'all').length, 1);
});

test('deduplica e ordena autores', () => {
  assert.deepEqual(uniqueHistoryAuthors(commits), [
    { email: 'bot@example.test', name: 'Dashboard Bot' },
    { email: 'felipe@example.test', name: 'Felipe Urgal' },
  ]);
});
