import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'vitest';

import { mount, flushPromises } from '@vue/test-utils';

import type {
  ProjectDatabaseEnvironment,
  ProjectDatabaseOverview,
  RailsMigrationsOverview,
  RailsModelsOverview,
} from '@dev-dashboard/contracts';

import ProjectDatabasePanel from '../src/components/ProjectDatabasePanel.vue';
import { makeProject } from './support/activity-fixtures.js';

const emptyDatabase: ProjectDatabaseOverview = {
  supported: false,
  environments: [],
  page: 1,
  pageSize: 20,
  total: 0,
};

const migrationsWithPending: RailsMigrationsOverview = {
  supported: true,
  databases: ['primary'],
  database: 'sample_development',
  migrations: [
    { version: '20200101010101', name: 'Create users', status: 'up' },
    { version: '20200102020202', name: 'Add index to users', status: 'down' },
  ],
};

const modelsOverview: RailsModelsOverview = {
  supported: true,
  databases: ['primary'],
  schemaPath: 'db/schema.rb',
  tables: [
    {
      name: 'users',
      columns: [
        { name: 'id', type: 'bigint', nullable: false, primaryKey: true },
        { name: 'email', type: 'string', nullable: false, primaryKey: false },
      ],
      indexes: [
        { name: 'index_users_on_email', columns: ['email'], unique: true },
      ],
      foreignKeys: [],
    },
  ],
};

class FakeWebSocket {
  public static instances: FakeWebSocket[] = [];
  public readonly url: string;
  public readyState = 0;
  private readonly listeners = new Map<
    string,
    Array<(event: unknown) => void>
  >();

  public constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  public addEventListener(
    type: string,
    handler: (event: unknown) => void,
  ): void {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  public close(): void {
    this.readyState = 3;
    this.emit('close', {});
  }

  public emit(type: string, event: unknown): void {
    for (const handler of this.listeners.get(type) ?? []) handler(event);
  }

  public emitMessage(payload: unknown): void {
    this.emit('message', { data: JSON.stringify(payload) });
  }
}

// @ts-expect-error substitui o WebSocket global só para este arquivo de teste
globalThis.WebSocket = FakeWebSocket;

let cleanup: (() => void) | undefined;
beforeEach(() => {
  cleanup = undefined;
  FakeWebSocket.instances = [];
});
afterEach(() => {
  cleanup?.();
});

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
      const action = url.pathname.split('/').at(-1) as
        'start' | 'stop' | 'restart';
      const environmentId = url.pathname.split('/').at(-2) ?? '';
      options.onServiceAction?.(url.pathname);
      return new Response(
        JSON.stringify({ action: { environmentId, action, succeeded: true } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.pathname.endsWith('/database')) {
      return new Response(
        JSON.stringify({ database: options.database ?? emptyDatabase }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (/\/rails\/migrations\/\d+$/.test(url.pathname)) {
      const version = url.pathname.split('/').at(-1) ?? '';
      const entry = migrationsWithPending.migrations.find(
        (migration) => migration.version === version,
      );
      return new Response(
        JSON.stringify({
          migration:
            project === 'rails'
              ? {
                  supported: true,
                  version,
                  name: entry?.name,
                  status: entry?.status,
                  filePath: `db/migrate/${version}_${entry?.name.toLowerCase().replaceAll(' ', '_')}.rb`,
                  source: [
                    `class ${entry?.name.replaceAll(' ', '')} < ActiveRecord::Migration[7.0]`,
                    '  # Mantém compatibilidade com dados antigos',
                    '  t.string :legacy_uuid, limit: 36',
                    'end',
                  ].join('\n'),
                  truncated: false,
                }
              : { supported: false, version, truncated: false },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.pathname.endsWith('/rails/migrations')) {
      return new Response(
        JSON.stringify({
          migrations:
            project === 'rails'
              ? migrationsWithPending
              : { supported: false, databases: [], migrations: [] },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.pathname.endsWith('/rails/models')) {
      return new Response(
        JSON.stringify({
          models:
            project === 'rails'
              ? modelsOverview
              : { supported: false, databases: [], tables: [] },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.pathname.endsWith('/database/snapshots')) {
      return new Response(
        JSON.stringify({
          snapshots: {
            snapshots: [],
            total: 0,
            retentionLimit: 10,
            supportedEnvironmentIds: [],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.pathname.endsWith('/rails/migrations/pty/status')) {
      return new Response(JSON.stringify({ snapshot: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.pathname.endsWith('/rails/migrations/pty/start')) {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      options.onMutationCall?.(url.pathname, body);
      return new Response(
        JSON.stringify({
          snapshot: {
            operation: body.operation,
            status: 'running',
            exitCode: null,
            exitSignal: null,
            startedAt: new Date().toISOString(),
            endedAt: null,
          },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.pathname.endsWith('/rails/migrations/pty/cancel')) {
      options.onMutationCall?.(url.pathname, undefined);
      return new Response(null, { status: 200 });
    }
    if (url.pathname.endsWith('/rails/generate/confirmations')) {
      const body = init?.body
        ? (JSON.parse(String(init.body)) as {
            kind: string;
            name: string;
            fields: Array<{ name: string; type: string }>;
          })
        : { kind: '', name: '', fields: [] };
      options.onMutationCall?.(url.pathname, body);
      const command = [
        'rails',
        'generate',
        body.kind,
        body.name,
        ...body.fields.map((field) => `${field.name}:${field.type}`),
      ].join(' ');
      return new Response(
        JSON.stringify({
          confirmation: {
            token: 'g'.repeat(64),
            kind: body.kind,
            name: body.name,
            fields: body.fields,
            command,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.pathname.endsWith('/rails/generate/mutations')) {
      options.onMutationCall?.(
        url.pathname,
        init?.body ? JSON.parse(String(init.body)) : undefined,
      );
      return new Response(
        JSON.stringify({
          result: {
            kind: 'model',
            name: 'Product',
            succeeded: true,
            createdFiles: [
              'app/models/product.rb',
              'db/migrate/20240101010101_create_products.rb',
            ],
            output:
              '      create  app/models/product.rb\n      create  db/migrate/20240101010101_create_products.rb\n',
            truncated: false,
            masked: false,
            redactionCount: 0,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return originalFetch;
}

test('mostra somente a área de Ambientes', async () => {
  const originalFetch = mockFetchFor('node');
  const wrapper = mount(ProjectDatabasePanel, {
    props: { project: makeProject({ type: 'node' }) },
  });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await flushPromises();
  await flushPromises();

  const labels = wrapper
    .findAll('.database-explorer-tabs button')
    .map((button) => button.text());
  assert.deepEqual(labels, []);
  assert.ok(wrapper.find('.database-environments-layout').exists());
});

function environment(
  overrides: Partial<ProjectDatabaseEnvironment>,
): ProjectDatabaseEnvironment {
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
  const originalFetch = mockFetchFor('node', {
    database,
    onServiceAction: (pathname) => calls.push(pathname),
  });
  const wrapper = mount(ProjectDatabasePanel, {
    props: { project: makeProject({ type: 'node' }) },
  });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await flushPromises();
  await flushPromises();


  const pauseButton = wrapper
    .findAll('button')
    .find((button) => button.text() === 'Pausar banco');
  assert.ok(pauseButton, 'esperava o botão Pausar banco');
  await pauseButton!.trigger('click');
  await flushPromises();
  await flushPromises();

  const restartButton = wrapper
    .findAll('button')
    .find((button) => button.text() === 'Reiniciar banco');
  assert.ok(restartButton, 'esperava o botão Reiniciar banco');
  await restartButton!.trigger('click');
  await flushPromises();
  await flushPromises();

  assert.deepEqual(calls, [
    '/api/projects/p1/database/dotenv--env/stop',
    '/api/projects/p1/database/dotenv--env/restart',
  ]);
  assert.ok(
    !wrapper
      .findAll('button')
      .some((button) => button.text() === 'Abrir cliente'),
  );
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
  const originalFetch = mockFetchFor('node', {
    database,
    onServiceAction: (pathname) => calls.push(pathname),
  });
  const wrapper = mount(ProjectDatabasePanel, {
    props: { project: makeProject({ type: 'node' }) },
  });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await flushPromises();
  await flushPromises();


  const startButton = wrapper
    .findAll('button')
    .find((button) => button.text() === 'Iniciar banco local');
  assert.ok(startButton, 'esperava o botão Iniciar banco local');
  await startButton!.trigger('click');
  await flushPromises();
  await flushPromises();

  assert.deepEqual(calls, ['/api/projects/p1/database/dotenv--env/start']);
  assert.ok(
    !wrapper
      .findAll('button')
      .some((button) => button.text() === 'Pausar banco'),
  );
});

test('avisa quando dois ambientes compartilham o mesmo serviço local', async () => {
  const database: ProjectDatabaseOverview = {
    supported: true,
    total: 2,
    page: 1,
    pageSize: 20,
    environments: [
      environment({
        id: 'rails-development',
        environment: 'development',
        driver: 'mysql2',
        reachability: 'reachable',
      }),
      environment({
        id: 'rails-test',
        environment: 'test',
        driver: 'mysql2',
        reachability: 'reachable',
      }),
    ],
  };
  const originalFetch = mockFetchFor('node', { database });
  const wrapper = mount(ProjectDatabasePanel, {
    props: { project: makeProject({ type: 'node' }) },
  });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await flushPromises();
  await flushPromises();


  assert.match(wrapper.text(), /também é usado por: test/);
});
