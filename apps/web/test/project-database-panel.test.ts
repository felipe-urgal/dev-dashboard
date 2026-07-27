import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'vitest';

import { mount, flushPromises } from '@vue/test-utils';

import type { ProjectDatabaseOverview, RailsMigrationsOverview, RailsRoutesOverview } from '@dev-dashboard/contracts';

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

let cleanup: (() => void) | undefined;
beforeEach(() => { cleanup = undefined; });
afterEach(() => { cleanup?.(); });

function mockFetchFor(project: 'rails' | 'node', onMutationCall?: (pathname: string, body: unknown) => void) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/database')) {
      return new Response(JSON.stringify({ database: emptyDatabase }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/rails/migrations')) {
      return new Response(JSON.stringify({ migrations: project === 'rails' ? migrationsWithPending : { supported: false, migrations: [] } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/rails/routes')) {
      return new Response(JSON.stringify({ routes: project === 'rails' ? routesOverview : { supported: false, routes: [] } }), { status: 200, headers: { 'content-type': 'application/json' } });
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

test('projeto Rails mostra migrations pendentes e rotas declaradas', async () => {
  const originalFetch = mockFetchFor('rails');
  const wrapper = mount(ProjectDatabasePanel, { props: { project: makeProject({ type: 'rails', capabilities: ['database'] }) } });
  cleanup = () => { wrapper.unmount(); globalThis.fetch = originalFetch; };
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.text(), /1.*migration pendente/s);
  assert.match(wrapper.text(), /Create users/);
  assert.match(wrapper.text(), /users#index/);
  assert.match(wrapper.text(), /users#create/);
});

test('filtra rotas pela busca', async () => {
  const originalFetch = mockFetchFor('rails');
  const wrapper = mount(ProjectDatabasePanel, { props: { project: makeProject({ type: 'rails', capabilities: ['database'] }) } });
  cleanup = () => { wrapper.unmount(); globalThis.fetch = originalFetch; };
  await flushPromises();
  await flushPromises();

  const input = wrapper.find('input.route-search');
  await input.setValue('create');
  await flushPromises();

  assert.ok(wrapper.text().includes('users#create'));
  assert.ok(!wrapper.text().includes('users#index'));
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

test('projeto Node não exibe seções de migrations/rotas do Rails', async () => {
  const originalFetch = mockFetchFor('node');
  const wrapper = mount(ProjectDatabasePanel, { props: { project: makeProject({ type: 'node' }) } });
  cleanup = () => { wrapper.unmount(); globalThis.fetch = originalFetch; };
  await flushPromises();
  await flushPromises();

  assert.ok(!wrapper.text().includes('Migrations'));
  assert.ok(!wrapper.text().includes('Rotas'));
});
