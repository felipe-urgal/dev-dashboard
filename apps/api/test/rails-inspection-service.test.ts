import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';
import {
  RailsInspectionService,
  RailsMutationError,
} from '../src/services/rails-inspection-service.js';

async function fixture(
  files: Record<string, string>,
  type: Project['type'] = 'rails',
): Promise<Project> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rails-inspection-'));
  for (const [name, contents] of Object.entries(files)) {
    const target = path.join(root, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  return {
    id: 'projeto',
    name: 'Projeto',
    path: root,
    type,
    source: 'standalone',
    favorite: false,
    enabled: true,
    capabilities: [],
  };
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
  const project = await fixture({
    'bin/rails': '#!/bin/sh\n',
    Gemfile: 'gem "rails"\n',
  });
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
  assert.deepEqual(calls, [
    {
      command: path.join(project.path, 'bin', 'rails'),
      args: ['db:migrate:status'],
    },
  ]);
});

const MULTI_DB_MIGRATE_STATUS_OUTPUT = `
database: myapp_development

 Status   Migration ID    Migration Name
--------------------------------------------------
   up     20200101010101  Create users


database: myapp_development_data

 Status   Migration ID    Migration Name
--------------------------------------------------
   up     20200201010101  Create logs
  down    20200202020202  Add index to logs

`;

test('separa migrations por banco quando o projeto tem mais de um', async () => {
  const project = await fixture({
    'bin/rails': '#!/bin/sh\n',
    Gemfile: 'gem "rails"\n',
    'db/schema.rb': 'ActiveRecord::Schema.define(version: 1) do\nend\n',
    'db/data_schema.rb': 'ActiveRecord::Schema.define(version: 1) do\nend\n',
  });
  const service = new RailsInspectionService(async () => ({
    stdout: MULTI_DB_MIGRATE_STATUS_OUTPUT,
  }));

  const primary = await service.getMigrationsOverview(project);
  assert.deepEqual(primary.databases, ['primary', 'data']);
  assert.equal(primary.database, 'myapp_development');
  assert.deepEqual(primary.migrations, [
    { status: 'up', version: '20200101010101', name: 'Create users' },
  ]);

  const secondary = await service.getMigrationsOverview(project, 'data');
  assert.equal(secondary.database, 'myapp_development_data');
  assert.deepEqual(secondary.migrations, [
    { status: 'up', version: '20200201010101', name: 'Create logs' },
    { status: 'down', version: '20200202020202', name: 'Add index to logs' },
  ]);

  const invalid = await service.getMigrationsOverview(project, 'nope');
  assert.equal(invalid.database, 'myapp_development');
});

test('lê o schema do banco secundário pelo nome do arquivo', async () => {
  const project = await fixture({
    'bin/rails': '#!/bin/sh\n',
    Gemfile: 'gem "rails"\n',
    'db/schema.rb':
      'ActiveRecord::Schema.define(version: 1) do\n  create_table "users" do |t|\n  end\nend\n',
    'db/data_schema.rb':
      'ActiveRecord::Schema.define(version: 1) do\n  create_table "logs" do |t|\n  end\nend\n',
  });
  const service = new RailsInspectionService(async () =>
    assert.fail('não deveria executar comandos'),
  );

  const primary = await service.getModelsOverview(project);
  assert.deepEqual(primary.databases, ['primary', 'data']);
  assert.equal(primary.schemaPath, 'db/schema.rb');
  assert.deepEqual(
    primary.tables.map((table) => table.name),
    ['users'],
  );

  const secondary = await service.getModelsOverview(project, 'data');
  assert.equal(secondary.schemaPath, 'db/data_schema.rb');
  assert.deepEqual(
    secondary.tables.map((table) => table.name),
    ['logs'],
  );
});

test('usa bundle exec rails quando não há bin/rails', async () => {
  const project = await fixture({ Gemfile: 'gem "rails"\n' });
  const calls: Array<{ command: string; args: string[] }> = [];
  const service = new RailsInspectionService(async (command, args) => {
    calls.push({ command, args });
    return { stdout: MIGRATE_STATUS_OUTPUT };
  });

  await service.getMigrationsOverview(project);
  assert.deepEqual(calls, [
    { command: 'bundle', args: ['exec', 'rails', 'db:migrate:status'] },
  ]);
});

test('analisa a lista de rotas ignorando o cabeçalho', async () => {
  const project = await fixture({
    'bin/rails': '#!/bin/sh\n',
    Gemfile: 'gem "rails"\n',
  });
  const service = new RailsInspectionService(async () => ({
    stdout: ROUTES_OUTPUT,
  }));

  const overview = await service.getRoutesOverview(project);
  assert.equal(overview.supported, true);
  assert.deepEqual(overview.routes, [
    {
      name: 'rails_health',
      verb: 'GET',
      path: '/up(.:format)',
      controllerAction: 'rails/health#show',
    },
    {
      name: 'users',
      verb: 'GET',
      path: '/users(.:format)',
      controllerAction: 'users#index',
    },
    {
      verb: 'POST',
      path: '/users(.:format)',
      controllerAction: 'users#create',
    },
  ]);
});

test('projeto sem Rails não é suportado', async () => {
  const project = await fixture({ 'package.json': '{}' }, 'node');
  const service = new RailsInspectionService(async () =>
    assert.fail('não deveria executar comandos'),
  );

  assert.deepEqual(await service.getMigrationsOverview(project), {
    supported: false,
    databases: ['primary'],
    migrations: [],
  });
  assert.deepEqual(await service.getRoutesOverview(project), {
    supported: false,
    routes: [],
  });
});

test('projeto Rails sem bin/rails nem Gemfile fica sem suporte', async () => {
  const project = await fixture({});
  const service = new RailsInspectionService(async () =>
    assert.fail('não deveria executar comandos'),
  );

  assert.deepEqual(await service.getMigrationsOverview(project), {
    supported: false,
    databases: ['primary'],
    migrations: [],
  });
});

test('falha de execução (ex. banco indisponível) degrada para não suportado sem lançar', async () => {
  const project = await fixture({
    'bin/rails': '#!/bin/sh\n',
    Gemfile: 'gem "rails"\n',
  });
  const service = new RailsInspectionService(async () => {
    throw new Error('could not connect to server');
  });

  assert.deepEqual(await service.getMigrationsOverview(project), {
    supported: false,
    databases: ['primary'],
    migrations: [],
  });
  assert.deepEqual(await service.getRoutesOverview(project), {
    supported: false,
    routes: [],
  });
});

test('saída sem rotas reconhecidas resulta em lista vazia mas suportada', async () => {
  const project = await fixture({
    'bin/rails': '#!/bin/sh\n',
    Gemfile: 'gem "rails"\n',
  });
  const service = new RailsInspectionService(async () => ({
    stdout: 'You have not defined any routes.\n',
  }));

  assert.deepEqual(await service.getRoutesOverview(project), {
    supported: true,
    routes: [],
  });
});

test('gera um model após confirmação, com o comando fechado montado a partir da entrada', async () => {
  const project = await fixture({
    'bin/rails': '#!/bin/sh\n',
    Gemfile: 'gem "rails"\n',
  });
  const calls: Array<{ command: string; args: string[] }> = [];
  const service = new RailsInspectionService(async (command, args) => {
    calls.push({ command, args });
    return {
      stdout:
        '      create  app/models/product.rb\n      create  db/migrate/20240101010101_create_products.rb\n      create  test/models/product_test.rb\n',
    };
  });

  const confirmation = await service.prepareGeneratorConfirmation(
    project,
    'model',
    'Product',
    [
      { name: 'name', type: 'string' },
      { name: 'price', type: 'decimal' },
    ],
  );
  assert.equal(
    confirmation.command,
    'rails generate model Product name:string price:decimal',
  );

  const result = await service.runGenerator(project, confirmation.token);
  assert.equal(result.succeeded, true);
  assert.deepEqual(result.createdFiles, [
    'app/models/product.rb',
    'db/migrate/20240101010101_create_products.rb',
    'test/models/product_test.rb',
  ]);
  assert.deepEqual(calls, [
    {
      command: path.join(project.path, 'bin', 'rails'),
      args: ['generate', 'model', 'Product', 'name:string', 'price:decimal'],
    },
  ]);
});

test('gera uma migration para o banco secundário com --database', async () => {
  const project = await fixture({
    'bin/rails': '#!/bin/sh\n',
    Gemfile: 'gem "rails"\n',
    'db/schema.rb': 'ActiveRecord::Schema.define(version: 1) do\nend\n',
    'db/data_schema.rb': 'ActiveRecord::Schema.define(version: 1) do\nend\n',
  });
  const calls: Array<{ args: string[] }> = [];
  const service = new RailsInspectionService(async (_command, args) => {
    calls.push({ args });
    return {
      stdout: '      create  db/migrate_data/20240101010101_create_logs.rb\n',
    };
  });

  const confirmation = await service.prepareGeneratorConfirmation(
    project,
    'migration',
    'CreateLogs',
    [{ name: 'message', type: 'text' }],
    'data',
  );
  assert.equal(confirmation.database, 'data');
  assert.equal(
    confirmation.command,
    'rails generate migration CreateLogs message:text --database=data',
  );

  await service.runGenerator(project, confirmation.token);
  assert.deepEqual(calls, [
    {
      args: [
        'generate',
        'migration',
        'CreateLogs',
        'message:text',
        '--database=data',
      ],
    },
  ]);
});

test('rejeita nome, campo ou tipo fora do catálogo fechado antes de montar o comando', async () => {
  const project = await fixture({
    'bin/rails': '#!/bin/sh\n',
    Gemfile: 'gem "rails"\n',
  });
  const service = new RailsInspectionService(async () =>
    assert.fail('não deveria executar comandos'),
  );

  await assert.rejects(
    () => service.prepareGeneratorConfirmation(project, 'model', '../evil', []),
    (error: unknown) =>
      error instanceof RailsMutationError &&
      error.code === 'RAILS_GENERATOR_INVALID_INPUT',
  );
  await assert.rejects(
    () =>
      service.prepareGeneratorConfirmation(project, 'model', 'Product', [
        { name: '--flag', type: 'string' },
      ]),
    (error: unknown) =>
      error instanceof RailsMutationError &&
      error.code === 'RAILS_GENERATOR_INVALID_INPUT',
  );
  await assert.rejects(
    () =>
      service.prepareGeneratorConfirmation(project, 'model', 'Product', [
        { name: 'kind', type: 'money' as never },
      ]),
    (error: unknown) =>
      error instanceof RailsMutationError &&
      error.code === 'RAILS_GENERATOR_INVALID_INPUT',
  );
  await assert.rejects(
    () =>
      service.prepareGeneratorConfirmation(
        project,
        'migration',
        'CreateLogs',
        [],
        'nope',
      ),
    (error: unknown) =>
      error instanceof RailsMutationError &&
      error.code === 'RAILS_GENERATOR_INVALID_INPUT',
  );
});

test('exige confirmação válida para rodar o gerador e consome o token uma única vez', async () => {
  const project = await fixture({
    'bin/rails': '#!/bin/sh\n',
    Gemfile: 'gem "rails"\n',
  });
  const service = new RailsInspectionService(async () => ({
    stdout: '      create  app/models/tag.rb\n',
  }));

  await assert.rejects(
    () => service.runGenerator(project, undefined),
    (error: unknown) =>
      error instanceof RailsMutationError &&
      error.code === 'RAILS_GENERATOR_CONFIRMATION_REQUIRED',
  );

  const confirmation = await service.prepareGeneratorConfirmation(
    project,
    'model',
    'Tag',
    [],
  );
  await service.runGenerator(project, confirmation.token);
  await assert.rejects(
    () => service.runGenerator(project, confirmation.token),
    (error: unknown) =>
      error instanceof RailsMutationError &&
      error.code === 'RAILS_GENERATOR_CONFIRMATION_REQUIRED',
  );
});
