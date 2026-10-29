import assert from 'node:assert/strict';
import test from 'node:test';

import { findGitMutationCatalogEntry } from '@dev-dashboard/contracts';

test('descarte de arquivo e remoção de não rastreado são classificados como destructive', () => {
  assert.equal(
    findGitMutationCatalogEntry('discard-file')?.risk,
    'destructive',
  );
  assert.equal(
    findGitMutationCatalogEntry('remove-untracked-file')?.risk,
    'destructive',
  );
});

test('push e publicação de branch são write-remote', () => {
  assert.equal(findGitMutationCatalogEntry('push')?.risk, 'write-remote');
  assert.equal(
    findGitMutationCatalogEntry('branch-publish')?.risk,
    'write-remote',
  );
});

test('push forçado com lease é classificado como destructive', () => {
  assert.equal(
    findGitMutationCatalogEntry('branch-force-push-with-lease')?.risk,
    'destructive',
  );
});
