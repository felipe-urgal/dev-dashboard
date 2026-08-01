import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'vitest';

import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';

import type {
  ProjectDatabaseEnvironment,
  ProjectDatabaseOverview,
  RailsMigrationsOverview,
  RailsModelsOverview,
} from '@dev-dashboard/contracts';

import ProjectDatabasePanel from '../src/components/ProjectDatabasePanel.vue';
import { makeProject } from './support/activity-fixtures.js';

const emptyDatabase: ProjectDatabaseOverview = { supported: false, environments: [], page: 1, pageSize: 20, total: 0 };

const migrationsWithPending: RailsMigrationsOverview = {
  supported: true,
  database: 'sample_development',
  migrations: [
    { version: '20200101010101', name: 'Create users', status: 'up' },
    { version: '20200102020202', name: 'Add index to users', status: 'down' },
  ],
};

const modelsOverview: RailsModelsOverview = {
  supported: true,
  schemaPath: 'db/schema.rb',
  tables: [
    {
      name: 'users',
      columns: [
        { name: 'id', type: 'bigint', nullable: false, primaryKey: true },
        { name: 'email', type: 'string', nullable: false, primaryKey: false },
      ],
      indexes: [{ name: 'index_users_on_email', columns: ['email'], unique: true }],
      foreignKeys: [],
    },
  ],
};

let cleanup: (() => void) | undefined;
beforeEach(() => { cleanup = undefined; });
afterEach(() => { cleanup?.(); });

function tab(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('.database-explorer-tabs button').find((candidate) => candidate.text() === label);
  assert.ok(button, `aba ${label} não encontrada`);
  return button;
}

function mockFetchFor(
  project: 'rails' | 'node',
  options: {
    database?: ProjectDatabaseOverview;
    onMutationCall?: (pathname: string, body: unknown) => void;
    onServiceAction?: (pathname: string) => void;
  } = {},
) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (/\/database\/[^/]+\/(start|stop|restart)$/.test(url.pathname)) {
      const action = url.pathname.split('/').at(-1) as 'start' | 'stop' | 'restart';
      const environmentId = url.pathname.split('/').at(-2) ?? '';
      options.onServiceAction?.(url.pathname);
      return new Response(JSON.stringify({ action: { environmentId, action, succeeded: true } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/database')) {
      return new Response(JSON.stringify({ database: options.database ?? emptyDatabase }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (/\/rails\/migrations\/\d+$/.test(url.pathname)) {
      const version = url.pathname.split('/').at(-1) ?? '';
      const entry = migrationsWithPending.migrations.find((migration) => migration.version === version);
      return new Response(JSON.stringify({
        migration: project === 'rails'
          ? {
              supported: true,
              version,
              name: entry?.name,
              status: entry?.status,
              filePath: `db/migrate/${version}_${entry?.name.toLowerCase().replaceAll(' ', '_')}.rb`,
              source: `class ${entry?.name.replaceAll(' ', '')}\nend`,
              truncated: false,
            }
          : { supported: false, version, truncated: false },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/rails/migrations')) {
      return new Response(JSON.stringify({ migrations: project === 'rails' ? migrationsWithPending : { supported: false, migrations: [] } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/rails/models')) {
      return new Response(JSON.stringify({ models: project === 'rails' ? modelsOverview : { supported: false, tables: [] } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/database/snapshots')) {
      return new Response(JSON.stringify({ snapshots: { snapshots: [], total: 0, retentionLimit: 10, supportedEnvironmentIds: [] } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/rails/migrations/confirmations')) {
      options.onMutationCall?.(url.pathname, init?.body ? JSON.parse(String(init.body)) : undefined);
      return new Response(JSON.stringify({ confirmation: { token: 't'.repeat(64), operation: 'migrate', expiresAt: new Date(Date.now() + 60_000).toISOString() } }), { status: 201, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/rails/migrations/mutations')) {
      options.onMutationCall?.(url.pathname, init?.body ? JSON.parse(String(init.body)) : undefined);
      return new Response(JSON.stringify({ result: { operation: 'migrate', succeeded: true, output: '== migrating ==', truncated: false, masked: false, redactionCount: 0 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return originalFetch;
}

test('projeto Rails mostra migrations pendentes na visão geral', async () => {
  const originalFetch = mockFetchFor('rails');
  const wrapper = mount(ProjectDatabasePanel, { props: { project: makeProject({ type: 'rails', capabilities: ['database'] }) } });
  cleanup = () => { wrapper.unmount(); globalThis.fetch = originalFetch; };
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.text(), /1.*pendente/s);
  assert.match(wrapper.text(), /Create users/);
});

test('roda migrate após confirmação e recarrega o status', async () => {
  const calls: Array<{ pathname: string; body: unknown }> = [];
  const originalFetch = mockFetchFor('rails', { onMutationCall: (pathname, body) => calls.push({ pathname, body }) });
  const originalConfirm = globalThis.window?.confirm;
  if (globalThis.window) globalThis.window.confirm = () => true;

  const wrapper = mount(ProjectDatabasePanel, { props: { project: makeProject({ type: 'rails', capabilities: ['database'] }) } });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
    if (globalThis.window && originalConfirm) globalThis.window.confirm = originalConfirm;
  };
  await flushPromises();
  await flushPromises();

  await tab(wrapper, 'Migrations').trigger('click');
  const migrateButton = wrapper.findAll('button').find((button) => button.text() === 'Rodar migrate');
  assert.ok(migrateButton);
  await migrateButton!.trigger('click');
  await flushPromises();
  await flushPromises();

  assert.deepEqual(calls.map((call) => call.pathname), [
    '/api/projects/p1/rails/migrations/confirmations',
    '/api/projects/p1/rails/migrations/mutations',
  ]);
  assert.equal((calls[0]!.body as { operation: string }).operation, 'migrate');
  assert.equal((calls[1]!.body as { confirmationToken: string }).confirmationToken, 't'.repeat(64));
  assert.match(wrapper.text(), /concluído/);
  assert.match(wrapper.text(), /migrating/);
});

test('projeto Node oculta as abas exclusivas de Rails', async () => {
  const originalFetch = mockFetchFor('node');
  const wrapper = mount(ProjectDatabasePanel, { props: { project: makeProject({ type: 'node' }) } });
  cleanup = () => { wrapper.unmount(); globalThis.fetch = originalFetch; };
  await flushPromises();
  await flushPromises();

  const labels = wrapper.findAll('.database-explorer-tabs button').map((button) => button.text());
  assert.deepEqual(labels, ['Visão geral', 'Ambientes', 'Snapshots']);
});

function environment(overrides: Partial<ProjectDatabaseEnvironment>): ProjectDatabaseEnvironment {
  return {
    id: 'dotenv--env',
    environment: 'development',
    driver: 'postgresql',
    host: 'localhost',
    port: 5432,
    database: 'app_development',
    passwordConfigured: false,
    source: 'dotenv',
    sourceDetail: '.env',
    reachability: 'reachable',
    serviceAvailable: true,
    ...overrides,
  };
}

test('pausa e reinicia um banco local acessível', async () => {
  const database: ProjectDatabaseOverview = {
    supported: true,
    total: 1,
    page: 1,
    pageSize: 20,
    environments: [environment({ reachability: 'reachable' })],
  };
  const calls: string[] = [];
  const originalFetch = mockFetchFor('node', { database, onServiceAction: (pathname) => calls.push(pathname) });
  const wrapper = mount(ProjectDatabasePanel, { props: { project: makeProject({ type: 'node' }) } });
  cleanup = () => { wrapper.unmount(); globalThis.fetch = originalFetch; };
  await flushPromises();
  await flushPromises();

  await tab(wrapper, 'Ambientes').trigger('click');
  await flushPromises();

  const pauseButton = wrapper.findAll('button').find((button) => button.text() === 'Pausar banco');
  assert.ok(pauseButton, 'esperava o botão Pausar banco');
  await pauseButton!.trigger('click');
  await flushPromises();
  await flushPromises();

  const restartButton = wrapper.findAll('button').find((button) => button.text() === 'Reiniciar banco');
  assert.ok(restartButton, 'esperava o botão Reiniciar banco');
  await restartButton!.trigger('click');
  await flushPromises();
  await flushPromises();

  assert.deepEqual(calls, [
    '/api/projects/p1/database/dotenv--env/stop',
    '/api/projects/p1/database/dotenv--env/restart',
  ]);
  assert.ok(!wrapper.findAll('button').some((button) => button.text() === 'Abrir cliente'));
});

test('inicia um banco local indisponível', async () => {
  const database: ProjectDatabaseOverview = {
    supported: true,
    total: 1,
    page: 1,
    pageSize: 20,
    environments: [environment({ reachability: 'unreachable' })],
  };
  const calls: string[] = [];
  const originalFetch = mockFetchFor('node', { database, onServiceAction: (pathname) => calls.push(pathname) });
  const wrapper = mount(ProjectDatabasePanel, { props: { project: makeProject({ type: 'node' }) } });
  cleanup = () => { wrapper.unmount(); globalThis.fetch = originalFetch; };
  await flushPromises();
  await flushPromises();

  await tab(wrapper, 'Ambientes').trigger('click');
  await flushPromises();

  const startButton = wrapper.findAll('button').find((button) => button.text() === 'Iniciar banco local');
  assert.ok(startButton, 'esperava o botão Iniciar banco local');
  await startButton!.trigger('click');
  await flushPromises();
  await flushPromises();

  assert.deepEqual(calls, ['/api/projects/p1/database/dotenv--env/start']);
  assert.ok(!wrapper.findAll('button').some((button) => button.text() === 'Pausar banco'));
});

test('avisa quando dois ambientes compartilham o mesmo serviço local', async () => {
  const database: ProjectDatabaseOverview = {
    supported: true,
    total: 2,
    page: 1,
    pageSize: 20,
    environments: [
      environment({ id: 'rails-development', environment: 'development', driver: 'mysql2', reachability: 'reachable' }),
      environment({ id: 'rails-test', environment: 'test', driver: 'mysql2', reachability: 'reachable' }),
    ],
  };
  const originalFetch = mockFetchFor('node', { database });
  const wrapper = mount(ProjectDatabasePanel, { props: { project: makeProject({ type: 'node' }) } });
  cleanup = () => { wrapper.unmount(); globalThis.fetch = originalFetch; };
  await flushPromises();
  await flushPromises();

  await tab(wrapper, 'Ambientes').trigger('click');
  await flushPromises();

  assert.match(wrapper.text(), /também é usado por: test/);
});
