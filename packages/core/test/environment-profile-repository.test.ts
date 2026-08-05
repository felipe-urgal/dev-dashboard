import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  EnvironmentProfileRepository,
  EnvironmentProfileRepositoryError,
} from '../src/environment-profile-repository.js';

async function repositoryInTempDir(): Promise<EnvironmentProfileRepository> {
  return new EnvironmentProfileRepository(
    await mkdtemp(path.join(tmpdir(), 'environment-profiles-')),
  );
}

test('cria, lista e persiste um perfil de ambiente em arquivo privado', async () => {
  const repository = await repositoryInTempDir();

  const profile = await repository.create({
    name: 'Staging',
    variables: [{ name: 'API_URL', value: 'https://staging.example.com' }],
  });

  assert.equal(profile.name, 'Staging');
  assert.deepEqual(profile.variables, [{ name: 'API_URL', value: 'https://staging.example.com' }]);
  assert.deepEqual([...repository.list()].map((entry) => entry.id), [profile.id]);

  const stored = JSON.parse(await readFile(repository.filePath, 'utf8'));
  assert.equal(stored.version, 1);
  assert.equal(stored.profiles.length, 1);
  assert.equal((await stat(repository.filePath)).mode & 0o777, 0o600);

  assert.deepEqual(
    new EnvironmentProfileRepository(path.dirname(repository.filePath)).list().map((entry) => entry.id),
    [profile.id],
  );
});

test('nunca persiste valor para variáveis com nome sensível', async () => {
  const repository = await repositoryInTempDir();

  const profile = await repository.create({
    name: 'Produção',
    variables: [{ name: 'DATABASE_SECRET_TOKEN', value: 'valor-sensivel' }, { name: 'PORT', value: '3000' }],
  });

  assert.deepEqual(profile.variables, [{ name: 'DATABASE_SECRET_TOKEN' }, { name: 'PORT', value: '3000' }]);
});

test('recusa nome de perfil duplicado', async () => {
  const repository = await repositoryInTempDir();
  await repository.create({ name: 'Staging', variables: [] });

  await assert.rejects(
    repository.create({ name: 'Staging', variables: [] }),
    (error) => error instanceof EnvironmentProfileRepositoryError && error.code === 'ENVIRONMENT_PROFILE_NAME_TAKEN',
  );
});

test('recusa nome de variável inválido', async () => {
  const repository = await repositoryInTempDir();

  await assert.rejects(
    repository.create({ name: 'Staging', variables: [{ name: '1INVALID' }] }),
    (error) => error instanceof EnvironmentProfileRepositoryError && error.code === 'ENVIRONMENT_PROFILE_INVALID',
  );
});

test('atualiza e remove um perfil existente', async () => {
  const repository = await repositoryInTempDir();
  const profile = await repository.create({ name: 'Staging', variables: [] });

  const updated = await repository.update(profile.id, { name: 'Staging 2', variables: [{ name: 'PORT', value: '4000' }] });
  assert.equal(updated.name, 'Staging 2');
  assert.deepEqual(updated.variables, [{ name: 'PORT', value: '4000' }]);

  await repository.remove(profile.id);
  assert.deepEqual([...repository.list()], []);

  await assert.rejects(
    repository.remove(profile.id),
    (error) => error instanceof EnvironmentProfileRepositoryError && error.code === 'ENVIRONMENT_PROFILE_NOT_FOUND',
  );
});
