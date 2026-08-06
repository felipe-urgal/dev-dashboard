import assert from 'node:assert/strict';

import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';

import { tmpdir } from 'node:os';

import path from 'node:path';

import { test } from 'node:test';

import {
  ProjectServerSettingsError,
  ProjectServerSettingsRepository,
} from '../src/index.js';

test('persists an optional port per project', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-server-settings-'),
  );

  context.after(async () => {
    await rm(fixtureRoot, {
      recursive: true,
      force: true,
    });
  });

  const repository = new ProjectServerSettingsRepository(fixtureRoot);

  assert.deepEqual(await repository.find('project-a'), {
    projectId: 'project-a',
  });

  const saved = await repository.save('project-a', { port: 3_100 });

  assert.equal(saved.port, 3_100);

  const reloaded = new ProjectServerSettingsRepository(fixtureRoot);

  assert.deepEqual(await reloaded.find('project-a'), saved);

  const fileStats = await stat(repository.filePath);

  assert.equal(fileStats.mode & 0o777, 0o600);
});

test('clears a previously configured port', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-server-settings-clear-'),
  );

  context.after(async () => {
    await rm(fixtureRoot, {
      recursive: true,
      force: true,
    });
  });

  const repository = new ProjectServerSettingsRepository(fixtureRoot);

  await repository.save('project-a', {
    port: 3_200,
  });

  const saved = await repository.save('project-a', {});

  assert.equal(saved.port, undefined);
});

test('rejects privileged ports', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-server-settings-invalid-'),
  );

  context.after(async () => {
    await rm(fixtureRoot, {
      recursive: true,
      force: true,
    });
  });

  const repository = new ProjectServerSettingsRepository(fixtureRoot);

  await assert.rejects(
    repository.save('project-a', {
      port: 80,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProjectServerSettingsError);
      assert.equal(error.code, 'INVALID_SERVER_PORT');
      return true;
    },
  );
});

test('persists a valid relative health check path', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-server-health-path-'),
  );

  context.after(async () => {
    await rm(fixtureRoot, {
      recursive: true,
      force: true,
    });
  });

  const repository = new ProjectServerSettingsRepository(fixtureRoot);
  const saved = await repository.save('project-a', {
    port: 3_100,
    healthCheckPath: '/api/healthz',
  });

  assert.equal(saved.healthCheckPath, '/api/healthz');

  await assert.rejects(
    repository.save('project-a', {
      healthCheckPath: 'https://example.com/health',
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProjectServerSettingsError);
      assert.equal(error.code, 'INVALID_HEALTH_CHECK_PATH');
      return true;
    },
  );
});

test('migrates legacy settings that contain a host', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-server-settings-legacy-'),
  );

  context.after(async () => {
    await rm(fixtureRoot, {
      recursive: true,
      force: true,
    });
  });

  const repository = new ProjectServerSettingsRepository(fixtureRoot);

  await writeFile(
    repository.filePath,
    JSON.stringify({
      version: 1,
      settings: [
        {
          projectId: 'project-a',
          host: '127.0.0.1',
          port: 3_300,
        },
      ],
    }),
    { encoding: 'utf8', mode: 0o600 },
  );

  assert.deepEqual(await repository.find('project-a'), {
    projectId: 'project-a',
    port: 3_300,
  });
});

test('ignores an unsafe health check path from persisted settings', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-server-settings-unsafe-health-'),
  );

  context.after(async () => {
    await rm(fixtureRoot, {
      recursive: true,
      force: true,
    });
  });

  const repository = new ProjectServerSettingsRepository(fixtureRoot);

  await writeFile(
    repository.filePath,
    JSON.stringify({
      version: 1,
      settings: [
        {
          projectId: 'project-a',
          port: 3_300,
          healthCheckPath: 'http://example.com/health',
        },
      ],
    }),
    { encoding: 'utf8', mode: 0o600 },
  );

  assert.deepEqual(await repository.find('project-a'), {
    projectId: 'project-a',
    port: 3_300,
  });
});
