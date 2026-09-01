import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  listNodeServerEnvironments,
  prepareNodeServerEnvironment,
  ProjectServerSettingsRepository,
} from '../src/index.js';

test('lista apenas ambientes Node executáveis e ignora templates e backups', async (context) => {
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
    writeFile(path.join(root, '.env.bak-portas'), 'API_PORT=3000\n'),
    writeFile(path.join(root, '.env.example.bak-portas'), 'API_PORT=3001\n'),
    writeFile(
      path.join(root, '.env.production.example.bak-portas'),
      'API_PORT=3002\n',
    ),
    writeFile(path.join(root, '.env.backup'), 'API_PORT=3003\n'),
    writeFile(path.join(root, '.env.old'), 'API_PORT=3004\n'),
  ]);

  assert.deepEqual(await listNodeServerEnvironments(root), [
    'development',
    'staging',
  ]);
});

test('carrega o ambiente escolhido para a execução sem alterar .env.local', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-server-env-load-'),
  );
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  await Promise.all([
    writeFile(
      path.join(root, '.env.staging'),
      'PUBLIC_API=https://staging.example\nAPI_PORT=5200\n',
    ),
    writeFile(path.join(root, '.env.local'), 'LOCAL=preserve\n'),
  ]);

  const environment = await prepareNodeServerEnvironment(root, 'staging');

  assert.equal(environment?.PUBLIC_API, 'https://staging.example');
  assert.equal(environment?.API_PORT, '5200');
  assert.equal(
    await readFile(path.join(root, '.env.local'), 'utf8'),
    'LOCAL=preserve\n',
  );
});

test('permite usar o ambiente padrão mesmo quando existem perfis .env.*', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-server-env-default-'),
  );
  const config = path.join(root, 'config');
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  await writeFile(path.join(root, '.env.development'), 'APP_ENV=development\n');

  assert.equal(await prepareNodeServerEnvironment(root), undefined);

  const repository = new ProjectServerSettingsRepository(config);
  const saved = await repository.save('project-a', {
    environment: 'development',
  });
  assert.equal(saved.environment, 'development');
  assert.equal((await repository.find('project-a')).environment, 'development');

  const cleared = await repository.save('project-a', {});
  assert.equal(cleared.environment, undefined);
  assert.equal((await repository.find('project-a')).environment, undefined);
});
