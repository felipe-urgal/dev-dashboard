import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

const TOKEN = 'r'.repeat(64);

interface BundlerResponse {
  bundler: {
    supported: boolean;
    check?: { satisfied: boolean; message: string };
    outdated: Array<{ name: string; installed: string; newest: string; requested?: string }>;
  };
}
interface ErrorResponse { error?: string }

test('rota de diagnóstico Bundler', async (context) => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-bundler-routes-'));
  const projectPath = path.join(fixtureRoot, 'sample');
  await mkdir(projectPath, { recursive: true });
  await writeFile(path.join(projectPath, 'Gemfile'), 'gem "rails"\n');

  const previousConfigDirectory = process.env.DEV_DASHBOARD_CONFIG_DIR;
  const previousStateDirectory = process.env.DEV_DASHBOARD_STATE_DIR;
  process.env.DEV_DASHBOARD_CONFIG_DIR = path.join(fixtureRoot, 'config');
  process.env.DEV_DASHBOARD_STATE_DIR = path.join(fixtureRoot, 'state');

  const { buildApp } = await import('../src/app.js');
  const { createAppContext } = await import('../src/app-context.js');
  const { BundlerInspectionService } = await import('../src/services/bundler-inspection-service.js');

  const appContext = createAppContext();
  appContext.bundlerInspectionService = new BundlerInspectionService(async (_command, args) => {
    if (args[0] === 'check') return { stdout: "The Gemfile's dependencies are satisfied\n" };
    return { stdout: '  * puma (newest 6.4.2, installed 6.4.0, requested ~> 6.4)\n' };
  });

  const project: Project = {
    id: 'p1', name: 'sample', path: projectPath,
    type: 'rails', source: 'workspace', workspaceId: 'w1', favorite: false, capabilities: [],
  };
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'w1', workspacePath: fixtureRoot, projects: [project], warnings: [],
  });

  const app = await buildApp({ localToken: TOKEN, context: appContext });
  context.after(async () => {
    await app.close();
    if (previousConfigDirectory === undefined) delete process.env.DEV_DASHBOARD_CONFIG_DIR;
    else process.env.DEV_DASHBOARD_CONFIG_DIR = previousConfigDirectory;
    if (previousStateDirectory === undefined) delete process.env.DEV_DASHBOARD_STATE_DIR;
    else process.env.DEV_DASHBOARD_STATE_DIR = previousStateDirectory;
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const headers = { 'x-dev-dashboard-token': TOKEN };

  await context.test('retorna diagnóstico Bundler', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/projects/p1/bundler', headers });
    assert.equal(response.statusCode, 200);
    const { bundler } = response.json<BundlerResponse>();
    assert.equal(bundler.supported, true);
    assert.equal(bundler.check?.satisfied, true);
    assert.deepEqual(bundler.outdated, [{ name: 'puma', installed: '6.4.0', newest: '6.4.2', requested: '~> 6.4' }]);
  });

  await context.test('retorna 404 para projeto inexistente', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/projects/does-not-exist/bundler', headers });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json<ErrorResponse>().error, 'PROJECT_NOT_FOUND');
  });

  await context.test('rota exige autenticação', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/projects/p1/bundler' });
    assert.equal(response.statusCode, 401);
  });
});
