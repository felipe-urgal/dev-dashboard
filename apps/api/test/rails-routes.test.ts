import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

const TOKEN = 'r'.repeat(64);

interface MigrationsResponse { migrations: { supported: boolean; migrations: Array<{ version: string; name: string; status: string }> } }
interface RoutesResponse { routes: { supported: boolean; routes: Array<{ name?: string; verb: string; path: string; controllerAction: string }> } }
interface ErrorResponse { error?: string }

test('rotas de inspeção Rails (migrations e routes)', async (context) => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-rails-routes-'));
  const projectPath = path.join(fixtureRoot, 'sample');
  await mkdir(path.join(projectPath, 'bin'), { recursive: true });
  await writeFile(path.join(projectPath, 'Gemfile'), 'gem "rails"\n');
  await writeFile(path.join(projectPath, 'bin', 'rails'), '#!/bin/sh\n');

  const previousConfigDirectory = process.env.DEV_DASHBOARD_CONFIG_DIR;
  const previousStateDirectory = process.env.DEV_DASHBOARD_STATE_DIR;
  process.env.DEV_DASHBOARD_CONFIG_DIR = path.join(fixtureRoot, 'config');
  process.env.DEV_DASHBOARD_STATE_DIR = path.join(fixtureRoot, 'state');

  const { buildApp } = await import('../src/app.js');
  const { createAppContext } = await import('../src/app-context.js');
  const { RailsInspectionService } = await import('../src/services/rails-inspection-service.js');

  const appContext = createAppContext();
  appContext.railsInspectionService = new RailsInspectionService(async (_command, args) => {
    if (args.includes('db:migrate:status')) {
      return {
        stdout: 'database: sample_development\n\n Status   Migration ID    Migration Name\n--------------------------------------------------\n   up     20200101010101  Create users\n',
      };
    }
    return {
      stdout: '                                     users GET    /users(.:format)           users#index\n',
    };
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

  await context.test('retorna status de migrations', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/projects/p1/rails/migrations', headers });
    assert.equal(response.statusCode, 200);
    const { migrations } = response.json<MigrationsResponse>();
    assert.equal(migrations.supported, true);
    assert.deepEqual(migrations.migrations, [{ version: '20200101010101', name: 'Create users', status: 'up' }]);
  });

  await context.test('retorna lista de rotas', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/projects/p1/rails/routes', headers });
    assert.equal(response.statusCode, 200);
    const { routes } = response.json<RoutesResponse>();
    assert.equal(routes.supported, true);
    assert.deepEqual(routes.routes, [{ name: 'users', verb: 'GET', path: '/users(.:format)', controllerAction: 'users#index' }]);
  });

  await context.test('retorna 404 para projeto inexistente', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/projects/does-not-exist/rails/migrations', headers });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json<ErrorResponse>().error, 'PROJECT_NOT_FOUND');
  });

  await context.test('rota exige autenticação', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/projects/p1/rails/routes' });
    assert.equal(response.statusCode, 401);
  });
});
