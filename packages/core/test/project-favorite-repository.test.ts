import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ProjectFavoriteRepository,
  ProjectFavoriteRepositoryError,
} from '../src/project-favorite-repository.js';

test('persiste favoritos em arquivo privado e permite recarregá-los', async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'project-favorites-'),
  );
  const repository = new ProjectFavoriteRepository(directory);

  await repository.set('project-b', true);
  await repository.set('project-a', true);

  assert.deepEqual(
    JSON.parse(await readFile(repository.filePath, 'utf8')),
    {
      version: 1,
      favoriteProjectIds: ['project-a', 'project-b'],
    },
  );
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal(
    (await stat(repository.filePath)).mode & 0o777,
    0o600,
  );
  assert.deepEqual(
    [...new ProjectFavoriteRepository(directory).list()],
    ['project-a', 'project-b'],
  );
});

test('remove apenas o favorito informado e preserva projetos ausentes de scans', async () => {
  const repository = new ProjectFavoriteRepository(
    await mkdtemp(path.join(tmpdir(), 'project-favorites-')),
  );

  await repository.set('project-visible', true);
  await repository.set('project-currently-absent', true);
  await repository.set('project-visible', false);

  assert.deepEqual(
    [...repository.list()],
    ['project-currently-absent'],
  );
});

test('recusa identificadores inválidos', async () => {
  const repository = new ProjectFavoriteRepository(
    await mkdtemp(path.join(tmpdir(), 'project-favorites-')),
  );

  await assert.rejects(
    repository.set('', true),
    (error) =>
      error instanceof ProjectFavoriteRepositoryError &&
      error.code === 'INVALID_PROJECT_ID',
  );
});
