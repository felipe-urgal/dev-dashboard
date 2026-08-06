import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';

import { flushPromises, mount } from '@vue/test-utils';

import type { Project } from '@dev-dashboard/contracts';

import ProjectDatabasePanel from '../src/components/ProjectDatabasePanel.vue';

const jsonHeaders = { 'content-type': 'application/json' };

const project: Project = {
  id: 'projeto-1',
  workspaceId: 'workspace-1',
  name: 'projeto',
  path: '/tmp/projeto',
  type: 'node',
  source: 'workspace',
  favorite: false,
  capabilities: [],
};

const environment = {
  id: 'dotenv--env',
  environment: 'development',
  driver: 'postgresql',
  host: 'localhost',
  port: 5432,
  database: 'app_development',
  username: 'dev',
  passwordConfigured: true,
  maskedUrl: 'postgresql://dev:••••••••@localhost:5432/app_development',
  source: 'dotenv',
  sourceDetail: '.env',
  reachability: 'reachable',
  serviceAvailable: false,
};

const snapshot = {
  id: '11111111-2222-3333-4444-555555555555',
  environmentId: 'dotenv--env',
  environment: 'development',
  driver: 'postgresql',
  database: 'app_development',
  label: 'fix-cadastro',
  createdAt: '2026-07-31T12:00:00.000Z',
  sizeBytes: 2048,
};

interface RequestRecord {
  path: string;
  method: string;
  body?: Record<string, unknown>;
}

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: jsonHeaders,
  });
}

async function mountPanel(
  options: { snapshots?: unknown[]; restoreStatus?: number } = {},
) {
  const originalFetch = globalThis.fetch;
  const requests: RequestRecord[] = [];
  const stored = options.snapshots ?? [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    requests.push({
      path: url.pathname,
      method: init?.method ?? 'GET',
      ...(init?.body
        ? { body: JSON.parse(String(init.body)) as Record<string, unknown> }
        : {}),
    });

    if (url.pathname.endsWith('/restore/confirmation')) {
      return jsonResponse({
        confirmation: {
          token: 'a'.repeat(64),
          snapshotId: snapshot.id,
          expiresAt: '2026-07-31T12:01:00.000Z',
        },
      });
    }
    if (url.pathname.endsWith('/restore')) {
      if (options.restoreStatus && options.restoreStatus !== 200) {
        return jsonResponse(
          {
            error: 'DATABASE_RESTORE_FAILED',
            message: 'psql terminou com código 1.',
          },
          options.restoreStatus,
        );
      }
      return jsonResponse({
        restore: { snapshotId: snapshot.id, restored: true },
      });
    }
    if (url.pathname.endsWith('/database/snapshots')) {
      if ((init?.method ?? 'GET') === 'POST') {
        stored.unshift(snapshot);
        return jsonResponse({ snapshot });
      }
      return jsonResponse({
        snapshots: {
          snapshots: stored,
          total: stored.length,
          retentionLimit: 10,
          supportedEnvironmentIds: ['dotenv--env'],
        },
      });
    }
    if (url.pathname.endsWith('/database')) {
      return jsonResponse({
        database: {
          supported: true,
          environments: [environment],
          page: 1,
          pageSize: 20,
          total: 1,
        },
      });
    }
    return jsonResponse({}, 404);
  }) as typeof globalThis.fetch;

  const wrapper = mount(ProjectDatabasePanel, {
    props: { project },
    attachTo: document.body,
  });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };

  await flushPromises();
  await flushPromises();

  const snapshotTab = wrapper
    .findAll('.database-explorer-tabs button')
    .find((button) => button.text().includes('Snapshots'));
  await snapshotTab?.trigger('click');
  await flushPromises();

  return { wrapper, requests };
}

test('mostra a seção de snapshots com o estado vazio', async () => {
  const { wrapper } = await mountPanel();

  assert.ok(wrapper.text().includes('Nenhum snapshot guardado'));
  const button = wrapper
    .findAll('button')
    .find((item) => item.text().includes('Gerar snapshot'));
  assert.ok(button);
  assert.equal(button!.attributes('disabled'), undefined);
});

test('gera um snapshot para o ambiente detectado', async () => {
  const { wrapper, requests } = await mountPanel();

  const button = wrapper
    .findAll('button')
    .find((item) => item.text().includes('Gerar snapshot'))!;
  await button.trigger('click');
  await flushPromises();
  await flushPromises();

  const created = requests.find(
    (request) =>
      request.method === 'POST' && request.path.endsWith('/database/snapshots'),
  );
  assert.ok(created, 'esperava um POST de criação');
  assert.deepEqual(created!.body, { environmentId: 'dotenv--env' });
  assert.ok(wrapper.text().includes('fix-cadastro'));
  assert.ok(wrapper.text().includes('2.0 kB'));
});

test('restaurar exige confirmação em duas etapas', async () => {
  const { wrapper, requests } = await mountPanel({ snapshots: [snapshot] });

  const restoreButton = wrapper
    .findAll('button')
    .find((item) => item.text().includes('Restaurar'))!;
  await restoreButton.trigger('click');

  assert.ok(wrapper.text().includes('Restaurar sobrescreve o banco atual'));
  assert.equal(
    requests.filter((request) => request.path.endsWith('/restore')).length,
    0,
  );

  const confirm = wrapper
    .findAll('button')
    .find((item) => item.text().trim() === 'Confirmar')!;
  await confirm.trigger('click');
  await flushPromises();
  await flushPromises();

  const prepared = requests.find((request) =>
    request.path.endsWith('/restore/confirmation'),
  );
  const restored = requests.find((request) =>
    request.path.endsWith('/restore'),
  );
  assert.ok(prepared, 'esperava o pedido de confirmação');
  assert.ok(restored, 'esperava a restauração');
  assert.deepEqual(restored!.body, { confirmationToken: 'a'.repeat(64) });
  assert.ok(wrapper.text().includes('Banco restaurado'));
});

test('cancelar mantém o banco intacto', async () => {
  const { wrapper, requests } = await mountPanel({ snapshots: [snapshot] });

  await wrapper
    .findAll('button')
    .find((item) => item.text().includes('Restaurar'))!
    .trigger('click');
  await wrapper
    .findAll('button')
    .find((item) => item.text().trim() === 'Cancelar')!
    .trigger('click');

  assert.ok(!wrapper.text().includes('Restaurar sobrescreve o banco atual'));
  assert.equal(
    requests.filter((request) => request.path.includes('/restore')).length,
    0,
  );
});

test('mostra o erro devolvido pela API na restauração', async () => {
  const { wrapper } = await mountPanel({
    snapshots: [snapshot],
    restoreStatus: 500,
  });

  await wrapper
    .findAll('button')
    .find((item) => item.text().includes('Restaurar'))!
    .trigger('click');
  await wrapper
    .findAll('button')
    .find((item) => item.text().trim() === 'Confirmar')!
    .trigger('click');
  await flushPromises();
  await flushPromises();

  assert.ok(wrapper.text().includes('psql terminou com código 1.'));
});
