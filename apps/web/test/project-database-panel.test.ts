import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'vitest';

import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';

import type {
  BundlerOverview,
  ProjectDatabaseOverview,
  RailsMigrationsOverview,
  RailsModelsOverview,
  RailsRoutesOverview,
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

const routesOverview: RailsRoutesOverview = {
  supported: true,
  routes: [
    { name: 'users', verb: 'GET', path: '/users(.:format)', controllerAction: 'users#index' },
    { verb: 'POST', path: '/users(.:format)', controllerAction: 'users#create' },
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

const bundlerOverview: BundlerOverview = {
  supported: true,
  check: { satisfied: true, message: '' },
  outdated: [
    { name: 'puma', installed: '6.4.0', newest: '6.4.2', requested: '~> 6.4' },
    { name: 'rails', installed: '7.1.3', newest: '7.1.4' },
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

function mockFetchFor(project: 'rails' | 'node', onMutationCall?: (pathname: string, body: unknown) => void) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/database')) {
      return new Response(JSON.stringify({ database: emptyDatabase }), { status: 200, headers: { 'content-type': 'application/json' } });
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
    if (url.pathname.endsWith('/rails/routes')) {
      return new Response(JSON.stringify({ routes: project === 'rails' ? routesOverview : { supported: false, routes: [] } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/bundler')) {
      return new Response(JSON.stringify({ bundler: project === 'rails' ? bundlerOverview : { supported: false, outdated: [] } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/rails/migrations/confirmations')) {
      onMutationCall?.(url.pathname, init?.body ? JSON.parse(String(init.body)) : undefined);
      return new Response(JSON.stringify({ confirmation: { token: 't'.repeat(64), operation: 'migrate', expiresAt: new Date(Date.now() + 60_000).toISOString() } }), { status: 201, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/rails/migrations/mutations')) {
      onMutationCall?.(url.pathname, init?.body ? JSON.parse(String(init.body)) : undefined);
      return new Response(JSON.stringify({ result: { operation: 'migrate', succeeded: true, output: '== migrating ==', truncated: false, masked: false, redactionCount: 0 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return originalFetch;
}

test('projeto Rails mostra migrations pendentes e rotas declaradas na visão geral', async () => {
  const originalFetch = mockFetchFor('rails');
  const wrapper = mount(ProjectDatabasePanel, { props: { project: makeProject({ type: 'rails', capabilities: ['database'] }) } });
  cleanup = () => { wrapper.unmount(); globalThis.fetch = originalFetch; };
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.text(), /1.*pendente/s);
  assert.match(wrapper.text(), /Create users/);
  assert.match(wrapper.text(), /users#index/);
  assert.match(wrapper.text(), /users#create/);
});

test('filtra rotas pela busca da aba Rotas', async () => {
  const originalFetch = mockFetchFor('rails');
  const wrapper = mount(ProjectDatabasePanel, { props: { project: makeProject({ type: 'rails', capabilities: ['database'] }) } });
  cleanup = () => { wrapper.unmount(); globalThis.fetch = originalFetch; };
  await flushPromises();
  await flushPromises();

  await tab(wrapper, 'Rotas').trigger('click');
  const input = wrapper.find('input[placeholder="Buscar rota, controller ou helper…"]');
  assert.ok(input.exists());
  await input.setValue('create');
  await flushPromises();

  const rows = wrapper.findAll('.database-routes-table tbody tr');
  assert.equal(rows.length, 1);
  assert.match(rows[0]!.text(), /users#create/);
  assert.ok(!rows[0]!.text().includes('users#index'));
});

test('roda migrate após confirmação e recarrega o status', async () => {
  const calls: Array<{ pathname: string; body: unknown }> = [];
  const originalFetch = mockFetchFor('rails', (pathname, body) => calls.push({ pathname, body }));
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

test('mostra diagnóstico Bundler com gems desatualizadas e filtro', async () => {
  const originalFetch = mockFetchFor('rails');
  const wrapper = mount(ProjectDatabasePanel, { props: { project: makeProject({ type: 'rails', capabilities: ['database'] }) } });
  cleanup = () => { wrapper.unmount(); globalThis.fetch = originalFetch; };
  await flushPromises();
  await flushPromises();

  await tab(wrapper, 'Dependências').trigger('click');
  assert.match(wrapper.text(), /Tudo certo/);
  assert.match(wrapper.text(), /puma/);
  assert.match(wrapper.text(), /rails/);

  const bundlerInput = wrapper.find('input[placeholder="Buscar gem…"]');
  assert.ok(bundlerInput.exists());
  await bundlerInput.setValue('puma');
  await flushPromises();

  const gemRows = wrapper.findAll('.database-gem-list > button');
  assert.equal(gemRows.length, 1);
  assert.match(gemRows[0]!.text(), /puma/);
  assert.match(gemRows[0]!.text(), /6\.4\.2/);
  assert.ok(!gemRows[0]!.text().includes('rails'));
});
