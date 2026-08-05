import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findGitMutationCatalogEntry,
  GIT_MUTATION_CATALOG,
} from '@dev-dashboard/contracts';

const RISK_LEVELS = ['read-only', 'write-safe', 'write-remote', 'destructive'];

test('catálogo não tem identificadores duplicados', () => {
  const ids = GIT_MUTATION_CATALOG.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('toda entrada tem rótulo, descrição e risco reconhecido', () => {
  for (const entry of GIT_MUTATION_CATALOG) {
    assert.ok(entry.label.length > 0, `${entry.id} sem rótulo`);
    assert.ok(entry.description.length > 0, `${entry.id} sem descrição`);
    assert.ok(RISK_LEVELS.includes(entry.risk), `${entry.id} com risco inválido: ${entry.risk}`);
    assert.equal(typeof entry.requiresConfirmation, 'boolean');
  }
});

test('inclui as operações já usadas nas rotas de mutação (GitMutationOperation)', () => {
  const known = [
    'create-branch', 'track-branch', 'delete-remote-branch', 'switch-branch',
    'pull', 'push', 'commit', 'amend', 'save', 'stash-push', 'stash-pop',
    'discard-file', 'remove-untracked-file',
  ];
  for (const id of known) {
    assert.ok(findGitMutationCatalogEntry(id), `catálogo não contém ${id}`);
  }
});

test('descarte de arquivo e remoção de não rastreado são classificados como destructive', () => {
  assert.equal(findGitMutationCatalogEntry('discard-file')?.risk, 'destructive');
  assert.equal(findGitMutationCatalogEntry('remove-untracked-file')?.risk, 'destructive');
});

test('push e publicação de branch são write-remote', () => {
  assert.equal(findGitMutationCatalogEntry('push')?.risk, 'write-remote');
  assert.equal(findGitMutationCatalogEntry('branch-publish')?.risk, 'write-remote');
});

test('findGitMutationCatalogEntry retorna undefined para identificador desconhecido', () => {
  assert.equal(findGitMutationCatalogEntry('nao-existe'), undefined);
});
