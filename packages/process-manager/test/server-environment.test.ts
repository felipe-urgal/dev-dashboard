import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  listNodeServerEnvironments,
  prepareNodeServerEnvironment,
  ProjectServerSettingsError,
  ProjectServerSettingsRepository,
} from '../src/index.js';

test('lista ambientes Node e ignora arquivos locais e templates', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-server-env-list-'),
  );
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  await Promise.all([
    writeFile(path.join(root, '.env.staging'), 'APP_ENV=staging\n'),
    writeFile(path.join(root, '.env.development'), 'APP_ENV=development\n'),
    writeFile(path.join(root, '.env.local'), 'LOCAL=true\n'),
    writeFile(path.join(root, '.env.sample'), 'SAMPLE=true\n'),
    writeFile(path.join(root, '.env.example'), 'EXAMPLE=true\n'),
    writeFile(path.join(root, '.env.production.example'), 'EXAMPLE=true\n'),
  ]);

  assert.deepEqual(await listNodeServerEnvironments(root), [
    'development',
    'staging',
  ]);
});

test('copia o ambiente escolhido para .env.local com permissão restrita', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-server-env-copy-'),
  );
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  await writeFile(
    path.join(root, '.env.staging'),
    'PUBLIC_API=https://staging.example\n',
  );

  const selected = await prepareNodeServerEnvironment(root, 'staging');

  assert.equal(selected, 'staging');
  assert.equal(
    await readFile(path.join(root, '.env.local'), 'utf8'),
    'PUBLIC_API=https://staging.example\n',
  );
  assert.equal((await stat(path.join(root, '.env.local'))).mode & 0o777, 0o600);
});

test('exige escolha quando existem ambientes e persiste a escolha por projeto', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-server-env-required-'),
  );
  const config = path.join(root, 'config');
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  await writeFile(path.join(root, '.env.development'), 'APP_ENV=development\n');

  await assert.rejects(
    () => prepareNodeServerEnvironment(root),
    (error: unknown) =>
      error instanceof ProjectServerSettingsError &&
      error.code === 'SERVER_ENVIRONMENT_REQUIRED',
  );

  const repository = new ProjectServerSettingsRepository(config);
  const saved = await repository.save('project-a', {
    environment: 'development',
  });
  assert.equal(saved.environment, 'development');
  assert.equal((await repository.find('project-a')).environment, 'development');
});
