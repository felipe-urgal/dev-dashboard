import assert from 'node:assert/strict';

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const TOKEN = 'a'.repeat(64);

test('exposes workspace attention through the authenticated API', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-attention-routes-'),
  );
  const workspacePath = path.join(fixtureRoot, 'workspace');
  const projectPath = path.join(workspacePath, 'sample-node');

  await mkdir(projectPath, { recursive: true });
  await writeFile(
    path.join(projectPath, 'package.json'),
    JSON.stringify(
      {
        name: 'sample-node',
        private: true,
        scripts: {},
      },
      null,
      2,
    ),
  );

  const previousConfigDirectory = process.env.DEV_DASHBOARD_CONFIG_DIR;
  const previousStateDirectory = process.env.DEV_DASHBOARD_STATE_DIR;
  const previousDirectoryRoot = process.env.DEV_DASHBOARD_DIRECTORY_ROOT;

  process.env.DEV_DASHBOARD_CONFIG_DIR = path.join(fixtureRoot, 'config');
  process.env.DEV_DASHBOARD_STATE_DIR = path.join(fixtureRoot, 'state');
  process.env.DEV_DASHBOARD_DIRECTORY_ROOT = fixtureRoot;

  const { buildApp } = await import('../src/app.js');
  const app = await buildApp({ localToken: TOKEN });

  context.after(async () => {
    await app.close();

    if (previousConfigDirectory === undefined) {
      delete process.env.DEV_DASHBOARD_CONFIG_DIR;
    } else {
      process.env.DEV_DASHBOARD_CONFIG_DIR = previousConfigDirectory;
    }

    if (previousStateDirectory === undefined) {
      delete process.env.DEV_DASHBOARD_STATE_DIR;
    } else {
      process.env.DEV_DASHBOARD_STATE_DIR = previousStateDirectory;
    }

    if (previousDirectoryRoot === undefined) {
      delete process.env.DEV_DASHBOARD_DIRECTORY_ROOT;
    } else {
      process.env.DEV_DASHBOARD_DIRECTORY_ROOT = previousDirectoryRoot;
    }

    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const unauthorized = await app.inject({
    method: 'GET',
    url: '/api/workspaces/missing/attention',
  });
  assert.equal(unauthorized.statusCode, 401);

  const headers = { 'x-dev-dashboard-token': TOKEN };

  const missing = await app.inject({
    method: 'GET',
    url: '/api/workspaces/missing/attention',
    headers,
  });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json<{ error: string }>().error, 'WORKSPACE_NOT_FOUND');

  const createResponse = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    headers,
    payload: {
      name: 'Fixture',
      path: workspacePath,
    },
  });
  assert.equal(createResponse.statusCode, 201);
  const workspaceId = createResponse.json<{ id: string }>().id;

  const scanResponse = await app.inject({
    method: 'POST',
    url: `/api/workspaces/${workspaceId}/scan`,
    headers,
  });
  assert.equal(scanResponse.statusCode, 200);

  const response = await app.inject({
    method: 'GET',
    url: `/api/workspaces/${workspaceId}/attention`,
    headers,
  });
  assert.equal(response.statusCode, 200);

  const body = response.json<{
    attention: {
      workspaceId: string;
      generatedAt: string;
      partial: boolean;
      unavailableSources: unknown[];
      items: Array<{
        id: string;
        projectId: string;
        projectName: string;
        category: string;
        severity: string;
        message: string;
        observedAt: string;
        action: { destination: string; projectId?: string };
      }>;
    };
  }>();
  const { attention } = body;

  assert.equal(attention.workspaceId, workspaceId);
  assert.match(attention.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(typeof attention.partial, 'boolean');
  assert.ok(Array.isArray(attention.unavailableSources));
  assert.ok(Array.isArray(attention.items));

  for (const item of attention.items) {
    assert.ok(item.id.length > 0);
    assert.ok(item.projectId.length > 0);
    assert.ok(item.projectName.length > 0);
    assert.ok(item.category.length > 0);
    assert.ok(item.severity.length > 0);
    assert.ok(item.message.length > 0);
    assert.ok(item.observedAt.length > 0);
    assert.ok(item.action.destination.length > 0);
  }

  assert.equal(response.body.includes(fixtureRoot), false);
  assert.equal(response.body.includes(projectPath), false);
});
