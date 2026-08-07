import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ProjectDismissedRepository,
  ProjectDismissedRepositoryError,
} from '../src/project-dismissed-repository.js';

test('persiste projetos removidos em arquivo privado e permite recarregá-los', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'project-dismissed-'));
  const repository = new ProjectDismissedRepository(directory);

  await repository.set('project-b', true);
  await repository.set('project-a', true);

  assert.deepEqual(JSON.parse(await readFile(repository.filePath, 'utf8')), {
    version: 1,
    dismissedProjectIds: ['project-a', 'project-b'],
  });
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal((await stat(repository.filePath)).mode & 0o777, 0o600);
  assert.deepEqual(
    [...new ProjectDismissedRepository(directory).list()],
    ['project-a', 'project-b'],
  );
  assert.equal(repository.isDismissed('project-a'), true);
  assert.equal(repository.isDismissed('project-c'), false);
});

test('restaura apenas o projeto informado e preserva os demais removidos', async () => {
  const repository = new ProjectDismissedRepository(
    await mkdtemp(path.join(tmpdir(), 'project-dismissed-')),
  );

  await repository.set('project-visible', true);
  await repository.set('project-currently-absent', true);
  await repository.set('project-visible', false);

  assert.deepEqual([...repository.list()], ['project-currently-absent']);
});

test('recusa identificadores inválidos', async () => {
  const repository = new ProjectDismissedRepository(
    await mkdtemp(path.join(tmpdir(), 'project-dismissed-')),
  );

  await assert.rejects(
    repository.set('', true),
    (error) =>
      error instanceof ProjectDismissedRepositoryError &&
      error.code === 'INVALID_PROJECT_ID',
  );
});
