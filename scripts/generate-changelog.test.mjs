import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  extractPrNumber,
  extractTaskLabel,
  formatChangelog,
  groupCommits,
  parseGitLog,
} from './generate-changelog.mjs';

const SEP = '\x1f';
const REC = '\x1e';

function rawLog(entries) {
  return entries.map(({ hash, date, subject }) => `${hash}${SEP}${date}${SEP}${subject}`).join(REC) + REC;
}

test('extractTaskLabel reconhece "Task NNN" e "Tasks NNN" em qualquer posição', () => {
  assert.equal(extractTaskLabel('Task 090: cache de detecção'), 'Task 090');
  assert.equal(extractTaskLabel('Conclui Task 077 e melhora navegação'), 'Task 077');
  assert.equal(extractTaskLabel('Tasks 073–074 — skeletons'), 'Task 073');
  assert.equal(extractTaskLabel('Corrige bug sem task nenhuma'), null);
});

test('extractPrNumber lê o número de PR entre parênteses no fim do assunto', () => {
  assert.equal(extractPrNumber('Adiciona X (#182)'), '182');
  assert.equal(extractPrNumber('Sem PR nenhum'), null);
  assert.equal(extractPrNumber('Menciona (#182) no meio, não no fim'), null);
});

test('parseGitLog separa hash/data/assunto pelos delimitadores de campo e registro', () => {
  const raw = rawLog([
    { hash: 'aaa111', date: '2026-08-04', subject: 'Primeiro commit' },
    { hash: 'bbb222', date: '2026-08-03', subject: 'Segundo commit' },
  ]);
  const commits = parseGitLog(raw);
  assert.deepEqual(commits, [
    { hash: 'aaa111', date: '2026-08-04', subject: 'Primeiro commit' },
    { hash: 'bbb222', date: '2026-08-03', subject: 'Segundo commit' },
  ]);
});

test('groupCommits agrupa commits consecutivos da mesma task num único grupo', () => {
  const commits = [
    { hash: '1', date: '2026-08-04', subject: 'Task 087: parte 1' },
    { hash: '2', date: '2026-08-04', subject: 'Task 087: parte 2' },
    { hash: '3', date: '2026-08-04', subject: 'Sem task' },
    { hash: '4', date: '2026-08-03', subject: 'Task 086: outra coisa' },
  ];
  const groups = groupCommits(commits);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].heading, 'Task 087');
  assert.equal(groups[0].commits.length, 2);
  assert.equal(groups[1].heading, '2026-08-04');
  assert.equal(groups[1].commits.length, 1);
  assert.equal(groups[2].heading, 'Task 086');
});

test('groupCommits reabre um grupo por task quando a mesma task volta a aparecer mais tarde, não intercalada', () => {
  const commits = [
    { hash: '1', date: '2026-08-04', subject: 'Task 090: parte 1' },
    { hash: '2', date: '2026-08-03', subject: 'Task 089: outra task' },
    { hash: '3', date: '2026-08-02', subject: 'Task 090: retomada' },
  ];
  const groups = groupCommits(commits);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].heading, 'Task 090');
  assert.equal(groups[2].heading, 'Task 090');
});

test('formatChangelog gera seções com cabeçalho de task/data e link de PR quando disponível', () => {
  const groups = groupCommits([
    { hash: 'abcdef1234567', date: '2026-08-04', subject: 'Task 090: cache (#182)' },
    { hash: '2222222222222', date: '2026-08-03', subject: 'Commit sem PR' },
  ]);
  const output = formatChangelog(groups, { header: '' });
  assert.match(output, /### Task 090/);
  assert.match(output, /- Task 090: cache \(\[#182\]\(\.\.\/\.\.\/pull\/182\)\)/);
  assert.match(output, /### 2026-08-03/);
  assert.match(output, /- Commit sem PR \(`2222222`\)/);
});
