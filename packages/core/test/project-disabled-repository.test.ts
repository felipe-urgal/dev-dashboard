import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ProjectDisabledRepository,
  ProjectDisabledRepositoryError,
} from '../src/project-disabled-repository.js';

test('persiste projetos desativados em arquivo privado e permite recarregá-los', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'project-disabled-'));
  const repository = new ProjectDisabledRepository(directory);

  await repository.set('project-b', true);
  await repository.set('project-a', true);

  assert.deepEqual(JSON.parse(await readFile(repository.filePath, 'utf8')), {
    version: 1,
    disabledProjectIds: ['project-a', 'project-b'],
  });
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal((await stat(repository.filePath)).mode & 0o777, 0o600);
  assert.deepEqual(
    [...new ProjectDisabledRepository(directory).list()],
    ['project-a', 'project-b'],
  );
  assert.equal(repository.isDisabled('project-a'), true);
  assert.equal(repository.isDisabled('project-c'), false);
});

test('reativa apenas o projeto informado e preserva os demais desativados', async () => {
  const repository = new ProjectDisabledRepository(
    await mkdtemp(path.join(tmpdir(), 'project-disabled-')),
  );

  await repository.set('project-visible', true);
  await repository.set('project-currently-absent', true);
  await repository.set('project-visible', false);

  assert.deepEqual([...repository.list()], ['project-currently-absent']);
});

test('recusa identificadores inválidos', async () => {
  const repository = new ProjectDisabledRepository(
    await mkdtemp(path.join(tmpdir(), 'project-disabled-')),
  );

  await assert.rejects(
    repository.set('', true),
    (error) =>
      error instanceof ProjectDisabledRepositoryError &&
      error.code === 'INVALID_PROJECT_ID',
  );
});
