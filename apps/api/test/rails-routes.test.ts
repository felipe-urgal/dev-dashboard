import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

const TOKEN = 'r'.repeat(64);

interface MigrationsResponse {
  migrations: {
    supported: boolean;
    migrations: Array<{ version: string; name: string; status: string }>;
  };
}
interface MigrationDetailResponse {
  migration: {
    supported: boolean;
    version: string;
    filePath?: string;
    source?: string;
  };
}
interface ModelsResponse {
  models: {
    supported: boolean;
    schemaPath?: string;
    tables: Array<{
      name: string;
      columns: Array<{
        name: string;
        type: string;
        nullable: boolean;
        primaryKey: boolean;
      }>;
      indexes: Array<{ columns: string[]; unique: boolean }>;
      foreignKeys: Array<{
        fromTable: string;
        toTable: string;
        column: string;
      }>;
    }>;
  };
}
interface RoutesResponse {
  routes: {
    supported: boolean;
    routes: Array<{
      name?: string;
      verb: string;
      path: string;
      controllerAction: string;
    }>;
  };
}
interface ConfirmationResponse {
  confirmation: { token: string; operation: string; expiresAt: string };
}
interface MutationResultResponse {
  result: { operation: string; succeeded: boolean; output: string };
}
interface GeneratorConfirmationResponse {
  confirmation: { token: string; command: string; expiresAt: string };
}
interface GeneratorResultResponse {
  result: { succeeded: boolean; createdFiles: string[]; output: string };
}
interface ErrorResponse {
  error?: string;
}

test('rotas de inspeção Rails (migrations, models e routes)', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-rails-routes-'),
  );
  const projectPath = path.join(fixtureRoot, 'sample');
  await mkdir(path.join(projectPath, 'bin'), { recursive: true });
  await mkdir(path.join(projectPath, 'db', 'migrate'), { recursive: true });
  await writeFile(path.join(projectPath, 'Gemfile'), 'gem "rails"\n');
  await writeFile(path.join(projectPath, 'bin', 'rails'), '#!/bin/sh\n');
  await writeFile(
    path.join(projectPath, 'db', 'migrate', '20200101010101_create_users.rb'),
    'class CreateUsers < ActiveRecord::Migration[7.1]\n  def change\n    create_table :users do |t|\n      t.string :name, null: false\n    end\n  end\nend\n',
  );
  await writeFile(
    path.join(projectPath, 'db', 'schema.rb'),
    `ActiveRecord::Schema[7.1].define(version: 2020_01_01_010101) do
  create_table "orders", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "status", default: "pending", null: false
    t.index ["user_id"], name: "index_orders_on_user_id"
  end

  create_table "users", force: :cascade do |t|
    t.string "name", null: false
  end

  add_foreign_key "orders", "users"
end
`,
  );

  const previousConfigDirectory = process.env.DEV_DASHBOARD_CONFIG_DIR;
  const previousStateDirectory = process.env.DEV_DASHBOARD_STATE_DIR;
  process.env.DEV_DASHBOARD_CONFIG_DIR = path.join(fixtureRoot, 'config');
  process.env.DEV_DASHBOARD_STATE_DIR = path.join(fixtureRoot, 'state');

  const { buildApp } = await import('../src/app.js');
  const { createAppContext } = await import('../src/app-context.js');
  const { RailsInspectionService } =
    await import('../src/services/rails-inspection-service.js');

  const appContext = createAppContext();
  appContext.railsInspectionService = new RailsInspectionService(
    async (_command, args) => {
      if (args.includes('db:migrate:status')) {
        return {
          stdout:
            'database: sample_development\n\n Status   Migration ID    Migration Name\n--------------------------------------------------\n   up     20200101010101  Create users\n',
        };
      }
      if (args.includes('routes')) {
        return {
          stdout:
            '                                     users GET    /users(.:format)           users#index\n',
        };
      }
      return { stdout: `executando ${args.join(' ')}\n` };
    },
  );

  const project: Project = {
    id: 'p1',
    name: 'sample',
    path: projectPath,
    type: 'rails',
    source: 'workspace',
    workspaceId: 'w1',
    favorite: false,
    enabled: true,
    capabilities: [],
  };
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'w1',
    workspacePath: fixtureRoot,
    projects: [project],
    warnings: [],
  });

  const app = await buildApp({ localToken: TOKEN, context: appContext });
  context.after(async () => {
    await app.close();
    if (previousConfigDirectory === undefined)
      delete process.env.DEV_DASHBOARD_CONFIG_DIR;
    else process.env.DEV_DASHBOARD_CONFIG_DIR = previousConfigDirectory;
    if (previousStateDirectory === undefined)
      delete process.env.DEV_DASHBOARD_STATE_DIR;
    else process.env.DEV_DASHBOARD_STATE_DIR = previousStateDirectory;
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const headers = { 'x-dev-dashboard-token': TOKEN };

  await context.test('retorna status de migrations', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/p1/rails/migrations',
      headers,
    });
    assert.equal(response.statusCode, 200);
    const { migrations } = response.json<MigrationsResponse>();
    assert.equal(migrations.supported, true);
    assert.deepEqual(migrations.migrations, [
      { version: '20200101010101', name: 'Create users', status: 'up' },
    ]);
  });

  await context.test(
    'retorna o arquivo e o código de uma migration',
    async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/projects/p1/rails/migrations/20200101010101',
        headers,
      });
      assert.equal(response.statusCode, 200);
      const { migration } = response.json<MigrationDetailResponse>();
      assert.equal(migration.supported, true);
      assert.equal(
        migration.filePath,
        'db/migrate/20200101010101_create_users.rb',
      );
      assert.match(migration.source ?? '', /class CreateUsers/);
    },
  );

  await context.test(
    'retorna tabelas, colunas, índices e foreign keys do schema',
    async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/projects/p1/rails/models',
        headers,
      });
      assert.equal(response.statusCode, 200);
      const { models } = response.json<ModelsResponse>();
      assert.equal(models.supported, true);
      assert.equal(models.schemaPath, 'db/schema.rb');
      assert.deepEqual(
        models.tables.map((table) => table.name),
        ['orders', 'users'],
      );

      const orders = models.tables[0];
      assert.deepEqual(
        orders?.columns.map((column) => column.name),
        ['id', 'user_id', 'status'],
      );
      assert.deepEqual(orders?.indexes[0]?.columns, ['user_id']);
      assert.deepEqual(orders?.foreignKeys[0], {
        fromTable: 'orders',
        toTable: 'users',
        column: 'user_id',
      });
    },
  );

  await context.test('retorna lista de rotas', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/p1/rails/routes',
      headers,
    });
    assert.equal(response.statusCode, 200);
    const { routes } = response.json<RoutesResponse>();
    assert.equal(routes.supported, true);
    assert.deepEqual(routes.routes, [
      {
        name: 'users',
        verb: 'GET',
        path: '/users(.:format)',
        controllerAction: 'users#index',
      },
    ]);
  });

  await context.test('retorna 404 para projeto inexistente', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/does-not-exist/rails/migrations',
      headers,
    });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json<ErrorResponse>().error, 'PROJECT_NOT_FOUND');
  });

  await context.test('rota exige autenticação', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/p1/rails/routes',
    });
    assert.equal(response.statusCode, 401);
  });

  const jsonHeaders = { ...headers, 'content-type': 'application/json' };

  await context.test('prepara confirmação e executa migrate', async () => {
    const confirmationResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/p1/rails/migrations/confirmations',
      headers: jsonHeaders,
      payload: JSON.stringify({ operation: 'migrate' }),
    });
    assert.equal(confirmationResponse.statusCode, 201);
    const { confirmation } = confirmationResponse.json<ConfirmationResponse>();
    assert.equal(confirmation.operation, 'migrate');

    const mutationResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/p1/rails/migrations/mutations',
      headers: jsonHeaders,
      payload: JSON.stringify({
        operation: 'migrate',
        confirmationToken: confirmation.token,
      }),
    });
    assert.equal(mutationResponse.statusCode, 200);
    const { result } = mutationResponse.json<MutationResultResponse>();
    assert.equal(result.succeeded, true);
    assert.match(result.output, /db:migrate/);
  });

  await context.test('rejeita mutação sem confirmação prévia', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/p1/rails/migrations/mutations',
      headers: jsonHeaders,
      payload: JSON.stringify({
        operation: 'seed',
        confirmationToken: 's'.repeat(64),
      }),
    });
    assert.equal(response.statusCode, 409);
    assert.equal(
      response.json<ErrorResponse>().error,
      'RAILS_MUTATION_CONFIRMATION_REQUIRED',
    );
  });

  await context.test('prepara confirmação e gera um model', async () => {
    const confirmationResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/p1/rails/generate/confirmations',
      headers: jsonHeaders,
      payload: JSON.stringify({
        kind: 'model',
        name: 'Product',
        fields: [{ name: 'name', type: 'string' }],
      }),
    });
    assert.equal(confirmationResponse.statusCode, 201);
    const { confirmation } =
      confirmationResponse.json<GeneratorConfirmationResponse>();
    assert.equal(
      confirmation.command,
      'rails generate model Product name:string',
    );

    const mutationResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/p1/rails/generate/mutations',
      headers: jsonHeaders,
      payload: JSON.stringify({ confirmationToken: confirmation.token }),
    });
    assert.equal(mutationResponse.statusCode, 200);
    const { result } = mutationResponse.json<GeneratorResultResponse>();
    assert.equal(result.succeeded, true);
    assert.match(result.output, /generate model Product/);
  });

  await context.test(
    'rejeita nome de generator fora do padrão fechado',
    async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects/p1/rails/generate/confirmations',
        headers: jsonHeaders,
        payload: JSON.stringify({ kind: 'model', name: '../evil', fields: [] }),
      });
      assert.equal(response.statusCode, 400);
      assert.equal(
        response.json<ErrorResponse>().error,
        'RAILS_GENERATOR_INVALID_INPUT',
      );
    },
  );

  await context.test(
    'rejeita execução de generator sem confirmação prévia',
    async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects/p1/rails/generate/mutations',
        headers: jsonHeaders,
        payload: JSON.stringify({ confirmationToken: 'g'.repeat(64) }),
      });
      assert.equal(response.statusCode, 409);
      assert.equal(
        response.json<ErrorResponse>().error,
        'RAILS_GENERATOR_CONFIRMATION_REQUIRED',
      );
    },
  );
});
