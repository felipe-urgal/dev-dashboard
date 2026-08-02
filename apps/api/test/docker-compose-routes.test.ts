import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';
import { buildApp } from '../src/app.js';
import { createAppContext } from '../src/app-context.js';
import { DockerComposeService } from '../src/services/docker-compose-service.js';

const TOKEN = 'd'.repeat(64);

test('expõe overview, confirmação, ação e logs com schemas fechados', async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dashboard-compose-route-'));
  await writeFile(path.join(directory, 'compose.yaml'), 'services:\n  redis:\n    image: redis:7\n');
  const project: Project = {
    id: 'painel', name: 'Painel', path: directory, type: 'node',
    source: 'standalone', favorite: false, capabilities: ['docker'],
  };
  const appContext = createAppContext();
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'workspace',
    workspacePath: directory,
    projects: [{ ...project, source: 'workspace', workspaceId: 'workspace' }],
    warnings: [],
  });
  appContext.dockerComposeService = new DockerComposeService({
    runCommand: async (_command, args) => ({
      stdout: args.includes('logs') ? 'redis | pronto\n' : '',
      stderr: '',
    }),
  });
  const app = await buildApp({ localToken: TOKEN, context: appContext });
  context.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  const headers = { 'x-dev-dashboard-token': TOKEN };

  const overview = await app.inject({ method: 'GET', url: '/api/projects/painel/docker', headers });
  assert.equal(overview.statusCode, 200);
  assert.equal(overview.json().docker.services[0].name, 'redis');

  const prepared = await app.inject({
    method: 'POST', url: '/api/projects/painel/docker/confirmations', headers,
    payload: { serviceName: 'redis', action: 'restart' },
  });
  assert.equal(prepared.statusCode, 201);
  const token = prepared.json().confirmation.token as string;

  const action = await app.inject({
    method: 'POST', url: '/api/projects/painel/docker/actions', headers,
    payload: { serviceName: 'redis', action: 'restart', confirmationToken: token },
  });
  assert.equal(action.statusCode, 200);
  assert.deepEqual(action.json().result, { serviceName: 'redis', action: 'restart', succeeded: true });

  const logs = await app.inject({
    method: 'GET', url: '/api/projects/painel/docker/services/redis/logs', headers,
  });
  assert.equal(logs.statusCode, 200);
  assert.match(logs.json().logs.content, /pronto/);

  const invalid = await app.inject({
    method: 'POST', url: '/api/projects/painel/docker/actions', headers,
    payload: { serviceName: 'redis', action: 'exec' },
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.json().error, 'VALIDATION_ERROR');
});
