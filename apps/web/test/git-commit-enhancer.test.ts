import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  classifyGitStatus,
  matchesCommitFile,
  withCommitPrefix,
} from '../src/git-commit-enhancer';

test('classifica estados staged, modificados e não rastreados', () => {
  assert.deepEqual(classifyGitStatus('M/.'), ['staged']);
  assert.deepEqual(classifyGitStatus('./M'), ['modified']);
  assert.deepEqual(classifyGitStatus('M/M'), ['staged', 'modified']);
  assert.deepEqual(classifyGitStatus('?/?', 'Não rastreado'), ['untracked']);
});

test('filtra arquivos por estado e busca textual', () => {
  const kinds = ['staged', 'modified'] as const;
  assert.equal(matchesCommitFile('src/app.ts Modificado', kinds, 'all', ''), true);
  assert.equal(matchesCommitFile('src/app.ts Modificado', kinds, 'staged', 'app'), true);
  assert.equal(matchesCommitFile('src/app.ts Modificado', kinds, 'untracked', ''), false);
  assert.equal(matchesCommitFile('src/app.ts Modificado', kinds, 'all', 'readme'), false);
});

test('aplica e troca prefixos convencionais na mensagem', () => {
  assert.equal(withCommitPrefix('melhora o painel', 'feat'), 'feat: melhora o painel');
  assert.equal(withCommitPrefix('feat: melhora o painel', 'fix'), 'fix: melhora o painel');
  assert.equal(withCommitPrefix('fix(api)!: corrige contrato', 'refactor'), 'refactor: corrige contrato');
});
