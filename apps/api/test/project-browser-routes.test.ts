import assert from 'node:assert/strict';
import test from 'node:test';

import type { ManagedProcess, Project } from '@dev-dashboard/contracts';
import { buildApp } from '../src/app.js';
import { createAppContext } from '../src/app-context.js';
import { ProjectBrowserService } from '../src/services/project-browser-service.js';

const TOKEN = 'b'.repeat(64);

const project: Project = {
  id: 'painel',
  workspaceId: 'workspace',
  name: 'Painel',
  path: '/projetos/painel',
  type: 'node',
  source: 'workspace',
  favorite: false,
  enabled: true,
  capabilities: ['server'],
};

test('abre o navegador na URL do servidor gerenciado quando o processo está em execução', async (context) => {
  const launches: Array<{ target: string; url: string }> = [];
  const appContext = createAppContext();
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'workspace',
    workspacePath: '/projetos',
    projects: [project],
    warnings: [],
  });
  const runningProcess: ManagedProcess = {
    id: 'painel:server',
    projectId: 'painel',
    kind: 'server',
    status: 'running',
    pid: 4242,
    port: 3001,
    url: 'http://localhost:3001',
  };
  appContext.processManager.getServerProcess = async (projectId) =>
    projectId === 'painel' ? runningProcess : null;
  appContext.projectBrowserService = new ProjectBrowserService({
    platform: 'linux',
    resolveExecutable: async () => '/usr/bin/xdg-open',
    launch: async (_executable, args) => {
      launches.push({ target: 'server', url: String(args[0]) });
    },
  });

  const app = await buildApp({ localToken: TOKEN, context: appContext });
  context.after(() => app.close());
  const headers = {
    'x-dev-dashboard-token': TOKEN,
    'content-type': 'application/json',
  };

  const response = await app.inject({
    method: 'POST',
    url: '/api/projects/painel/browser/open',
    headers,
    payload: { target: 'server' },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    target: 'server',
    url: 'http://localhost:3001',
    opened: true,
  });
  assert.deepEqual(launches, [
    { target: 'server', url: 'http://localhost:3001' },
  ]);
});

test('recusa abrir quando o servidor do projeto não está em execução', async (context) => {
  const appContext = createAppContext();
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'workspace',
    workspacePath: '/projetos',
    projects: [project],
    warnings: [],
  });
  appContext.processManager.getServerProcess = async () => null;

  const app = await buildApp({ localToken: TOKEN, context: appContext });
  context.after(() => app.close());
  const headers = {
    'x-dev-dashboard-token': TOKEN,
    'content-type': 'application/json',
  };

  const response = await app.inject({
    method: 'POST',
    url: '/api/projects/painel/browser/open',
    headers,
    payload: { target: 'server' },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, 'BROWSER_TARGET_NOT_RUNNING');
});

test('não aceita projeto ausente nem destino fora do catálogo fechado', async (context) => {
  const app = await buildApp({ localToken: TOKEN });
  context.after(() => app.close());
  const headers = {
    'x-dev-dashboard-token': TOKEN,
    'content-type': 'application/json',
  };

  const missing = await app.inject({
    method: 'POST',
    url: '/api/projects/inexistente/browser/open',
    headers,
    payload: { target: 'server' },
  });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json().error, 'PROJECT_NOT_FOUND');

  const invalid = await app.inject({
    method: 'POST',
    url: '/api/projects/inexistente/browser/open',
    headers,
    payload: { target: 'https://malicious.example.com' },
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.json().error, 'VALIDATION_ERROR');
});

test('responde indisponível quando não há comando de abrir navegador no sistema', async (context) => {
  const appContext = createAppContext();
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'workspace',
    workspacePath: '/projetos',
    projects: [project],
    warnings: [],
  });
  appContext.processManager.getServerProcess = async () => ({
    id: 'painel:server',
    projectId: 'painel',
    kind: 'server',
    status: 'running',
    url: 'http://localhost:3001',
  });
  appContext.projectBrowserService = new ProjectBrowserService({
    platform: 'linux',
    resolveExecutable: async () => null,
  });

  const app = await buildApp({ localToken: TOKEN, context: appContext });
  context.after(() => app.close());
  const headers = {
    'x-dev-dashboard-token': TOKEN,
    'content-type': 'application/json',
  };

  const response = await app.inject({
    method: 'POST',
    url: '/api/projects/painel/browser/open',
    headers,
    payload: { target: 'server' },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, 'BROWSER_NOT_AVAILABLE');
});
