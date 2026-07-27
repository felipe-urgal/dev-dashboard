import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';
import { RailsInspectionService } from '../src/services/rails-inspection-service.js';

async function fixture(files: Record<string, string>, type: Project['type'] = 'rails'): Promise<Project> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rails-inspection-'));
  for (const [name, contents] of Object.entries(files)) {
    const target = path.join(root, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  return { id: 'projeto', name: 'Projeto', path: root, type, source: 'standalone', favorite: false, capabilities: [] };
}

const MIGRATE_STATUS_OUTPUT = `
database: myapp_development

 Status   Migration ID    Migration Name
--------------------------------------------------
   up     20200101010101  Create users
  down    20200102020202  Add index to users

`;

const ROUTES_OUTPUT = `
                                   Prefix Verb   URI Pattern                Controller#Action
                              rails_health GET    /up(.:format)              rails/health#show
                                     users GET    /users(.:format)           users#index
                                            POST   /users(.:format)           users#create
`;

test('usa bin/rails quando disponível e reporta migrations pendentes e aplicadas', async () => {
  const project = await fixture({ 'bin/rails': '#!/bin/sh\n', Gemfile: 'gem "rails"\n' });
  const calls: Array<{ command: string; args: string[] }> = [];
  const service = new RailsInspectionService(async (command, args) => {
    calls.push({ command, args });
    return { stdout: MIGRATE_STATUS_OUTPUT };
  });

  const overview = await service.getMigrationsOverview(project);
  assert.equal(overview.supported, true);
  assert.equal(overview.database, 'myapp_development');
  assert.deepEqual(overview.migrations, [
    { status: 'up', version: '20200101010101', name: 'Create users' },
    { status: 'down', version: '20200102020202', name: 'Add index to users' },
  ]);
  assert.deepEqual(calls, [{ command: path.join(project.path, 'bin', 'rails'), args: ['db:migrate:status'] }]);
});

test('usa bundle exec rails quando não há bin/rails', async () => {
  const project = await fixture({ Gemfile: 'gem "rails"\n' });
  const calls: Array<{ command: string; args: string[] }> = [];
  const service = new RailsInspectionService(async (command, args) => {
    calls.push({ command, args });
    return { stdout: MIGRATE_STATUS_OUTPUT };
  });

  await service.getMigrationsOverview(project);
  assert.deepEqual(calls, [{ command: 'bundle', args: ['exec', 'rails', 'db:migrate:status'] }]);
});

test('analisa a lista de rotas ignorando o cabeçalho', async () => {
  const project = await fixture({ 'bin/rails': '#!/bin/sh\n', Gemfile: 'gem "rails"\n' });
  const service = new RailsInspectionService(async () => ({ stdout: ROUTES_OUTPUT }));

  const overview = await service.getRoutesOverview(project);
  assert.equal(overview.supported, true);
  assert.deepEqual(overview.routes, [
    { name: 'rails_health', verb: 'GET', path: '/up(.:format)', controllerAction: 'rails/health#show' },
    { name: 'users', verb: 'GET', path: '/users(.:format)', controllerAction: 'users#index' },
    { verb: 'POST', path: '/users(.:format)', controllerAction: 'users#create' },
  ]);
});

test('projeto sem Rails não é suportado', async () => {
  const project = await fixture({ 'package.json': '{}' }, 'node');
  const service = new RailsInspectionService(async () => assert.fail('não deveria executar comandos'));

  assert.deepEqual(await service.getMigrationsOverview(project), { supported: false, migrations: [] });
  assert.deepEqual(await service.getRoutesOverview(project), { supported: false, routes: [] });
});

test('projeto Rails sem bin/rails nem Gemfile fica sem suporte', async () => {
  const project = await fixture({});
  const service = new RailsInspectionService(async () => assert.fail('não deveria executar comandos'));

  assert.deepEqual(await service.getMigrationsOverview(project), { supported: false, migrations: [] });
});

test('falha de execução (ex. banco indisponível) degrada para não suportado sem lançar', async () => {
  const project = await fixture({ 'bin/rails': '#!/bin/sh\n', Gemfile: 'gem "rails"\n' });
  const service = new RailsInspectionService(async () => {
    throw new Error('could not connect to server');
  });

  assert.deepEqual(await service.getMigrationsOverview(project), { supported: false, migrations: [] });
  assert.deepEqual(await service.getRoutesOverview(project), { supported: false, routes: [] });
});

test('saída sem rotas reconhecidas resulta em lista vazia mas suportada', async () => {
  const project = await fixture({ 'bin/rails': '#!/bin/sh\n', Gemfile: 'gem "rails"\n' });
  const service = new RailsInspectionService(async () => ({ stdout: 'You have not defined any routes.\n' }));

  assert.deepEqual(await service.getRoutesOverview(project), { supported: true, routes: [] });
});
