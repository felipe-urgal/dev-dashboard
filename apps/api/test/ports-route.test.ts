import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import type {
  LocalPortInspection,
  ManagedProcess,
  Project,
} from '@dev-dashboard/contracts';

import { PortInspectorService } from '../src/services/port-inspector-service.js';

const TOKEN = 'p'.repeat(64);

interface PortsResponse {
  inspection: LocalPortInspection;
}

test('GET /api/ports combina porta esperada e processo gerenciado sem aceitar acesso anônimo', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-ports-route-'),
  );
  const previousConfigDirectory = process.env.DEV_DASHBOARD_CONFIG_DIR;
  const previousStateDirectory = process.env.DEV_DASHBOARD_STATE_DIR;
  process.env.DEV_DASHBOARD_CONFIG_DIR = path.join(fixtureRoot, 'config');
  process.env.DEV_DASHBOARD_STATE_DIR = path.join(fixtureRoot, 'state');

  const { buildApp } = await import('../src/app.js');
  const { createAppContext } = await import('../src/app-context.js');
  const appContext = createAppContext();
  const project: Project = {
    id: 'p1',
    name: 'sample-node',
    path: '/tmp/sample-node',
    type: 'node',
    source: 'workspace',
    workspaceId: 'w1',
    enabled: true,
    capabilities: ['server'],
  };
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'w1',
    workspacePath: '/tmp/w1',
    projects: [project],
    warnings: [],
  });
  await appContext.serverSettingsRepository.save('p1', {
    port: 3_000,
  });
  const managed: ManagedProcess[] = [
    {
      id: 'server-p1',
      projectId: 'p1',
      kind: 'server',
      status: 'running',
      pid: 4_242,
      port: 3_000,
    },
  ];
  appContext.processManager.listProcesses = async () => managed;
  const portInspectorService = new PortInspectorService({
    platform: 'linux',
    runSs: async () =>
      'LISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=4242,fd=20))',
  });
  const app = await buildApp({
    localToken: TOKEN,
    context: appContext,
    portInspectorService,
  });

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
    await rm(fixtureRoot, {
      recursive: true,
      force: true,
    });
  });

  const response = await app.inject({
    method: 'GET',
    url: '/api/ports',
    headers: {
      'x-dev-dashboard-token': TOKEN,
    },
  });
  assert.equal(response.statusCode, 200);
  const body = response.json<PortsResponse>();
  assert.equal(body.inspection.status, 'ready');
  assert.equal(body.inspection.entries.length, 1);
  assert.equal(
    body.inspection.entries[0]?.managedProcess?.projectName,
    'sample-node',
  );
  assert.equal(body.inspection.entries[0]?.expected[0]?.projectId, 'p1');
  assert.equal(
    'pid' in (body.inspection.entries[0]?.managedProcess ?? {}),
    false,
  );

  const anonymous = await app.inject({
    method: 'GET',
    url: '/api/ports',
  });
  assert.equal(anonymous.statusCode, 401);
});
