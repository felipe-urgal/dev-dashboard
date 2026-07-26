import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'vitest';

import { mount, RouterLinkStub, flushPromises } from '@vue/test-utils';

import type { ManagedProcess } from '@dev-dashboard/contracts';

import ProcessesView from '../src/views/ProcessesView.vue';
import { ApiRequestError } from '../src/api';
import { makeProject, makeWorkspace } from './support/activity-fixtures.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

interface MountArgs {
  processes: () => Promise<ManagedProcess[]>;
}

async function mountView(args: MountArgs) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/workspaces') {
      return new Response(JSON.stringify({ workspaces: [makeWorkspace()] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname === '/api/projects') {
      return new Response(JSON.stringify({ projects: [makeProject()] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname === '/api/processes') {
      try {
        const processes = await args.processes();
        return new Response(JSON.stringify({ processes }), { status: 200, headers: { 'content-type': 'application/json' } });
      } catch (error) {
        if (error instanceof ApiRequestError) {
          return new Response(JSON.stringify({ error: error.code, message: error.message }), {
            status: error.status, headers: { 'content-type': 'application/json' },
          });
        }
        throw error;
      }
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProcessesView, { global: { stubs: { RouterLink: RouterLinkStub } } });
  return {
    wrapper,
    restore: () => {
      wrapper.unmount();
      globalThis.fetch = originalFetch;
    },
  };
}

let cleanup: (() => void) | undefined;
beforeEach(() => { cleanup = undefined; });
afterEach(() => { cleanup?.(); });

test('mostra estado de carregamento enquanto a lista está pendente', async () => {
  const pending = deferred<ManagedProcess[]>();
  const { wrapper, restore } = await mountView({ processes: () => pending.promise });
  cleanup = restore;

  await flushPromises();
  assert.match(wrapper.text(), /Carregando processos/);
  pending.resolve([]);
  await flushPromises();
});

test('mostra estado vazio quando não há processos gerenciados', async () => {
  const { wrapper, restore } = await mountView({ processes: async () => [] });
  cleanup = restore;
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.text(), /Nenhum processo gerenciado/);
});

test('renderiza processos com nome do projeto, tipo, estado e detalhes', async () => {
  const { wrapper, restore } = await mountView({
    processes: async () => [
      { id: 'srv-1', projectId: 'p1', workspaceId: 'w1', kind: 'server', status: 'running', pid: 4242, port: 3000, startedAt: '2026-07-26T09:00:00Z' },
      { id: 'tst-1', projectId: 'p1', workspaceId: 'w1', kind: 'test', status: 'stopped', startedAt: '2026-07-26T08:00:00Z', stoppedAt: '2026-07-26T08:05:00Z' },
    ],
  });
  cleanup = restore;
  await flushPromises();
  await flushPromises();

  const text = wrapper.text();
  assert.match(text, /sample-node/);
  assert.match(text, /PID 4242/);
  assert.match(text, /porta 3000/);
  const kinds = wrapper.findAll('.activity-item-origin').map((node) => node.text());
  assert.deepEqual(kinds, ['Servidor', 'Testes']);
  const statuses = wrapper.findAll('.activity-status').map((node) => node.text());
  assert.deepEqual(statuses, ['Em execução', 'Parado']);
});

test('congela a duração de processos terminais em stoppedAt na renderização', async () => {
  const { wrapper, restore } = await mountView({
    processes: async () => [
      { id: 'tst-1', projectId: 'p1', workspaceId: 'w1', kind: 'test', status: 'stopped', startedAt: '2026-07-26T08:00:00Z', stoppedAt: '2026-07-26T08:05:00Z' },
      { id: 'srv-1', projectId: 'p1', workspaceId: 'w1', kind: 'server', status: 'failed', startedAt: '2026-07-26T08:00:00Z', stoppedAt: '2026-07-26T08:02:30Z' },
    ],
  });
  cleanup = restore;
  await flushPromises();
  await flushPromises();

  const durations = wrapper.findAll('.activity-item-meta').map((node) => node.text());
  const first = durations[0] ?? '';
  const second = durations[1] ?? '';
  assert.match(first, /duração 5m 0s/);
  assert.match(second, /duração 2m 30s/);
});

test('mostra a mensagem de erro quando o carregamento falha', async () => {
  const { wrapper, restore } = await mountView({
    processes: async () => { throw new ApiRequestError({ status: 500, message: 'API indisponível.' }); },
  });
  cleanup = restore;
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.text(), /API indisponível/);
  assert.equal(wrapper.findAll('.activity-item').length, 0);
});
