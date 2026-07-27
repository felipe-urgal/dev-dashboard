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

function mockFetchFor(project: 'rails' | 'node') {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
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

test('projeto Node não exibe seções de migrations/rotas do Rails', async () => {
  const originalFetch = mockFetchFor('node');
  const wrapper = mount(ProjectDatabasePanel, { props: { project: makeProject({ type: 'node' }) } });
  cleanup = () => { wrapper.unmount(); globalThis.fetch = originalFetch; };
  await flushPromises();
  await flushPromises();

  assert.ok(!wrapper.text().includes('Migrations'));
  assert.ok(!wrapper.text().includes('Rotas'));
});
