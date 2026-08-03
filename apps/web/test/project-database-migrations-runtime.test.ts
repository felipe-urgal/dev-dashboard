import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';

import ProjectDatabasePanel from '../src/components/ProjectDatabasePanel.vue';
import { makeProject } from './support/activity-fixtures.js';

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

function tab(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('.database-explorer-tabs button').find((candidate) => candidate.text() === label);
  assert.ok(button, `aba ${label} não encontrada`);
  return button;
}

test('mantém migrations locais visíveis e consulta Rails no runtime Docker ativo', async () => {
  const originalFetch = globalThis.fetch;
  const originalConfirm = globalThis.window?.confirm;
  const migrationRuntimes: string[] = [];
  const confirmationBodies: unknown[] = [];
  const confirmationMessages: string[] = [];
  let migrationLoads = 0;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');

    if (url.pathname.endsWith('/database')) {
      return new Response(JSON.stringify({
        database: {
          supported: true,
          page: 1,
          pageSize: 20,
          total: 1,
          environments: [{
            id: 'dotenv--env',
            environment: 'development',
            driver: 'mysql2',
            host: 'localhost',
            port: 3306,
            database: 'sample_development',
            passwordConfigured: false,
            source: 'dotenv',
            sourceDetail: '.env',
            reachability: 'reachable',
            serviceAvailable: true,
            runtime: 'docker',
            dockerServices: ['mysql'],
          }],
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    if (url.pathname.endsWith('/rails/migrations')) {
      migrationLoads += 1;
      migrationRuntimes.push(url.searchParams.get('runtime') ?? '');
      return new Response(JSON.stringify({
        migrations: {
          supported: true,
          databases: ['primary'],
          migrations: [{
            version: '20260803120000',
            name: 'Add status to users',
            status: 'down',
          }],
          statusAvailable: false,
          runtime: 'docker',
          warning: 'Não foi possível consultar o status no runtime Docker. Exibindo os arquivos do projeto como pendentes.',
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    if (/\/rails\/migrations\/\d+$/.test(url.pathname)) {
      return new Response(JSON.stringify({
        migration: {
          supported: true,
          version: '20260803120000',
          name: 'Add status to users',
          status: 'down',
          filePath: 'db/migrate/20260803120000_add_status_to_users.rb',
          source: 'class AddStatusToUsers < ActiveRecord::Migration[7.1]\nend\n',
          truncated: false,
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    if (url.pathname.endsWith('/rails/models')) {
      return new Response(JSON.stringify({ models: { supported: false, databases: ['primary'], tables: [] } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    if (url.pathname.endsWith('/database/snapshots')) {
      return new Response(JSON.stringify({ snapshots: { snapshots: [], total: 0, retentionLimit: 10, supportedEnvironmentIds: ['dotenv--env'] } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    if (url.pathname.endsWith('/rails/migrations/confirmations')) {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      confirmationBodies.push(body);
      return new Response(JSON.stringify({
        confirmation: {
          token: 't'.repeat(64),
          operation: 'migrate',
          runtime: 'docker',
          command: 'bin/docker-rails db:migrate',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      }), { status: 201, headers: { 'content-type': 'application/json' } });
    }

    if (url.pathname.endsWith('/rails/migrations/mutations')) {
      return new Response(JSON.stringify({
        result: {
          operation: 'migrate',
          succeeded: true,
          output: '== migrating ==',
          truncated: false,
          masked: false,
          redactionCount: 0,
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    if (/\/database\/[^/]+\/start$/.test(url.pathname)) {
      return new Response(JSON.stringify({ action: { environmentId: 'dotenv--env', action: 'start', succeeded: true } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  if (globalThis.window) {
    globalThis.window.confirm = vi.fn((message?: string) => {
      confirmationMessages.push(message ?? '');
      return true;
    });
  }

  const wrapper = mount(ProjectDatabasePanel, {
    props: { project: makeProject({ type: 'rails', capabilities: ['database'] }) },
  });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
    if (globalThis.window && originalConfirm) globalThis.window.confirm = originalConfirm;
  };

  await flushPromises();
  await flushPromises();

  assert.ok(migrationRuntimes.includes('docker'));
  assert.match(wrapper.text(), /Add status to users/);
  assert.match(wrapper.text(), /Exibindo os arquivos do projeto como pendentes/);

  await tab(wrapper, 'Operações').trigger('click');
  const migrateButton = wrapper.findAll('button').find((button) => button.text() === 'Rodar migrate');
  assert.ok(migrateButton);
  await migrateButton!.trigger('click');
  await flushPromises();
  await flushPromises();

  assert.deepEqual(confirmationBodies, [{ operation: 'migrate', runtime: 'docker' }]);
  assert.match(confirmationMessages[0] ?? '', /bin\/docker-rails db:migrate/);

  const beforeRuntimeChange = migrationLoads;
  await tab(wrapper, 'Ambientes').trigger('click');
  const localButton = wrapper.findAll('button').find((button) => button.text() === 'Usar banco local');
  assert.ok(localButton);
  await localButton!.trigger('click');
  await flushPromises();
  await flushPromises();

  assert.ok(migrationLoads > beforeRuntimeChange, 'esperava recarregar migrations após a ação de banco');
});
