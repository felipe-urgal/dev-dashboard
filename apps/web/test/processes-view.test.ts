import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';

import { mount, RouterLinkStub, flushPromises } from '@vue/test-utils';

import type { ManagedProcess } from '@dev-dashboard/contracts';

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('vue-sonner', () => ({ toast: toastMock }));

import ProcessesView from '../src/views/ProcessesView.vue';
import { ApiRequestError } from '../src/api';
import { makeProject, makeWorkspace } from './support/activity-fixtures.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

interface MountArgs {
  processes: () => Promise<ManagedProcess[]>;
  cleanup?: () => Promise<number>;
}

async function mountView(args: MountArgs) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/workspaces') {
      return new Response(JSON.stringify({ workspaces: [makeWorkspace()] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.pathname === '/api/projects') {
      return new Response(JSON.stringify({ projects: [makeProject()] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.pathname === '/api/processes/cleanup' && init?.method === 'POST') {
      const removedCount = (await args.cleanup?.()) ?? 0;
      return new Response(JSON.stringify({ removed: [], removedCount }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (
      url.pathname === '/api/ports' &&
      (!init?.method || init.method === 'GET')
    ) {
      return new Response(
        JSON.stringify({
          inspection: {
            status: 'ready',
            platform: 'linux',
            inspectedAt: '2026-08-05T14:00:00.000Z',
            entries: [],
            truncated: false,
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    }
    if (
      url.pathname === '/api/processes' &&
      (!init?.method || init.method === 'GET')
    ) {
      try {
        const processes = await args.processes();
        return new Response(JSON.stringify({ processes }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      } catch (error) {
        if (error instanceof ApiRequestError) {
          return new Response(
            JSON.stringify({ error: error.code, message: error.message }),
            {
              status: error.status,
              headers: { 'content-type': 'application/json' },
            },
          );
        }
        throw error;
      }
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProcessesView, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  });
  return {
    wrapper,
    restore: () => {
      wrapper.unmount();
      globalThis.fetch = originalFetch;
    },
  };
}

let cleanup: (() => void) | undefined;
beforeEach(() => {
  cleanup = undefined;
  toastMock.success.mockClear();
  toastMock.error.mockClear();
  toastMock.warning.mockClear();
});
afterEach(() => {
  cleanup?.();
  vi.useRealTimers();
});

test('mostra estado de carregamento enquanto a lista está pendente', async () => {
  vi.useFakeTimers();
  const pending = deferred<ManagedProcess[]>();
  const { wrapper, restore } = await mountView({
    processes: () => pending.promise,
  });
  cleanup = restore;

  await flushPromises();
  assert.equal(wrapper.get('#processes').attributes('aria-busy'), 'true');
  assert.match(wrapper.get('[role="status"]').text(), /Carregando processos/);
  assert.equal(wrapper.find('.loading-skeleton-list').exists(), false);

  await vi.advanceTimersByTimeAsync(150);
  assert.equal(wrapper.findAll('.loading-skeleton-row').length, 4);

  pending.resolve([]);
  await flushPromises();
  assert.equal(wrapper.get('#processes').attributes('aria-busy'), 'false');
  assert.equal(wrapper.find('.loading-skeleton').exists(), false);
});

test('exibe filtros e permite limpar a seleção', async () => {
  const { wrapper, restore } = await mountView({
    processes: async () => [],
  });
  cleanup = restore;
  await flushPromises();
  await flushPromises();

  assert.equal(wrapper.findAll('.processes-filter-field select').length, 4);
  await wrapper.get('[aria-label="Filtrar por estado"]').setValue('failed');
  await flushPromises();

  assert.equal(
    (
      wrapper.get('[aria-label="Filtrar por estado"]')
        .element as HTMLSelectElement
    ).value,
    'failed',
  );
  const clearButton = wrapper.get('.processes-clear-filters-button');
  assert.equal(clearButton.attributes('disabled'), undefined);

  await clearButton.trigger('click');
  await flushPromises();

  assert.equal(
    (
      wrapper.get('[aria-label="Filtrar por estado"]')
        .element as HTMLSelectElement
    ).value,
    '',
  );
  assert.equal(clearButton.attributes('disabled'), '');
});

test('mostra estado vazio quando não há processos gerenciados', async () => {
  const { wrapper, restore } = await mountView({ processes: async () => [] });
  cleanup = restore;
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.text(), /Nenhum processo gerenciado/);
});

test('preserva processos válidos durante uma atualização manual', async () => {
  const pending = deferred<ManagedProcess[]>();
  let calls = 0;
  const existingProcess: ManagedProcess = {
    id: 'srv-preserved',
    projectId: 'p1',
    workspaceId: 'w1',
    kind: 'server',
    status: 'running',
    port: 3000,
    startedAt: '2026-07-26T09:00:00Z',
  };
  const { wrapper, restore } = await mountView({
    processes: () => {
      calls += 1;
      return calls === 1 ? Promise.resolve([existingProcess]) : pending.promise;
    },
  });
  cleanup = restore;
  await flushPromises();
  await flushPromises();

  await wrapper.get('.processes-refresh-button').trigger('click');
  await flushPromises();

  assert.match(wrapper.text(), /srv-preserved/);
  assert.equal(wrapper.get('#processes').attributes('aria-busy'), 'true');
  assert.equal(wrapper.find('.loading-skeleton').exists(), false);

  pending.resolve([]);
  await flushPromises();
});

test('renderiza processos com nome do projeto, tipo, estado e detalhes', async () => {
  const { wrapper, restore } = await mountView({
    processes: async () => [
      {
        id: 'srv-1',
        projectId: 'p1',
        workspaceId: 'w1',
        kind: 'server',
        status: 'running',
        pid: 4242,
        port: 3000,
        startedAt: '2026-07-26T09:00:00Z',
      },
      {
        id: 'tst-1',
        projectId: 'p1',
        workspaceId: 'w1',
        kind: 'test',
        status: 'stopped',
        startedAt: '2026-07-26T08:00:00Z',
        stoppedAt: '2026-07-26T08:05:00Z',
      },
    ],
  });
  cleanup = restore;
  await flushPromises();
  await flushPromises();

  const text = wrapper.text();
  assert.match(text, /sample-node/);
  assert.match(text, /porta 3000/);
  const kinds = wrapper
    .findAll('.processes-kind-badge')
    .map((node) => node.text());
  assert.deepEqual(kinds, ['Servidor', 'Testes']);
  const statuses = wrapper
    .findAll('.dd-status-badge')
    .map((node) => node.text());
  assert.deepEqual(statuses, ['Em execução', 'Parado']);
  assert.equal(wrapper.find('.processes-summary').text().includes('2'), true);
});

test('congela a duração de processos terminais em stoppedAt na renderização', async () => {
  const { wrapper, restore } = await mountView({
    processes: async () => [
      {
        id: 'tst-1',
        projectId: 'p1',
        workspaceId: 'w1',
        kind: 'test',
        status: 'stopped',
        startedAt: '2026-07-26T08:00:00Z',
        stoppedAt: '2026-07-26T08:05:00Z',
      },
      {
        id: 'srv-1',
        projectId: 'p1',
        workspaceId: 'w1',
        kind: 'server',
        status: 'failed',
        startedAt: '2026-07-26T08:00:00Z',
        stoppedAt: '2026-07-26T08:02:30Z',
      },
    ],
  });
  cleanup = restore;
  await flushPromises();
  await flushPromises();

  const durations = wrapper
    .findAll('td[data-label="Duração"]')
    .map((node) => node.text());
  const first = durations[0] ?? '';
  const second = durations[1] ?? '';
  assert.match(first, /5m 0s/);
  assert.match(second, /2m 30s/);
});

test('mostra a mensagem de erro quando o carregamento falha', async () => {
  const { wrapper, restore } = await mountView({
    processes: async () => {
      throw new ApiRequestError({ status: 500, message: 'API indisponível.' });
    },
  });
  cleanup = restore;
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.text(), /API indisponível/);
  assert.equal(wrapper.findAll('.processes-table tbody tr').length, 0);
});

test('limpa todos os processos finalizados e preserva os ativos', async () => {
  let currentProcesses: ManagedProcess[] = [
    {
      id: 'srv-1',
      projectId: 'p1',
      workspaceId: 'w1',
      kind: 'server',
      status: 'running',
      pid: 4242,
      port: 3000,
      startedAt: '2026-07-26T09:00:00Z',
    },
    {
      id: 'tst-stopped',
      projectId: 'p1',
      workspaceId: 'w1',
      kind: 'test',
      status: 'stopped',
      startedAt: '2026-07-26T08:00:00Z',
      stoppedAt: '2026-07-26T08:05:00Z',
    },
    {
      id: 'tst-failed',
      projectId: 'p1',
      workspaceId: 'w1',
      kind: 'test',
      status: 'failed',
      startedAt: '2026-07-26T07:00:00Z',
      stoppedAt: '2026-07-26T07:02:00Z',
    },
  ];
  let cleanupCalls = 0;
  const originalConfirm = window.confirm;
  window.confirm = () => true;

  const { wrapper, restore } = await mountView({
    processes: async () => currentProcesses,
    cleanup: async () => {
      cleanupCalls += 1;
      currentProcesses = currentProcesses.filter(
        (process) => process.status === 'running',
      );
      return 2;
    },
  });
  cleanup = () => {
    window.confirm = originalConfirm;
    restore();
  };
  await flushPromises();
  await flushPromises();

  assert.equal(wrapper.findAll('.processes-table tbody tr').length, 3);
  await wrapper.get('.processes-cleanup-button').trigger('click');
  await flushPromises();
  await flushPromises();

  assert.equal(cleanupCalls, 1);
  assert.equal(wrapper.findAll('.processes-table tbody tr').length, 1);
  assert.equal(toastMock.success.mock.calls.length, 1);
  const [title, options] = toastMock.success.mock.calls[0] as [
    string,
    { description?: string },
  ];
  assert.equal(title, 'Ação concluída.');
  assert.match(options.description ?? '', /2 processos finalizados removidos/);
  assert.match(wrapper.text(), /Em execução/);
});

test('aplica o filtro de falhas vindo da query da rota', async () => {
  const originalUrl = window.location.href;
  window.history.replaceState({}, '', '/processes?status=failed');

  try {
    const { wrapper, restore } = await mountView({
      processes: async () => [
        {
          id: 'srv-running',
          projectId: 'p1',
          workspaceId: 'w1',
          kind: 'server',
          status: 'running',
          port: 3000,
          startedAt: '2026-07-26T09:00:00Z',
        },
        {
          id: 'srv-failed',
          projectId: 'p1',
          workspaceId: 'w1',
          kind: 'server',
          status: 'failed',
          startedAt: '2026-07-26T08:00:00Z',
          stoppedAt: '2026-07-26T08:01:00Z',
        },
      ],
    });
    cleanup = () => {
      restore();
      window.history.replaceState({}, '', originalUrl);
    };

    await flushPromises();
    await flushPromises();

    assert.equal(wrapper.findAll('.processes-table tbody tr').length, 1);
    assert.match(wrapper.text(), /srv-failed/);
    assert.doesNotMatch(wrapper.text(), /srv-running/);
  } finally {
    cleanup?.();
    cleanup = undefined;
  }
});

test('restaura filtros de workspace, projeto e tipo pela query da rota', async () => {
  const originalUrl = window.location.href;

  try {
    window.history.replaceState(
      {},
      '',
      '/processes?workspace=w1&project=p1&kind=test&status=failed',
    );
    const { wrapper, restore } = await mountView({
      processes: async () => [],
    });
    cleanup = () => {
      restore();
      window.history.replaceState({}, '', originalUrl);
    };

    await flushPromises();
    await flushPromises();

    assert.equal(
      (
        wrapper.get('[aria-label="Filtrar por workspace"]')
          .element as HTMLSelectElement
      ).value,
      'w1',
    );
    assert.equal(
      (
        wrapper.get('[aria-label="Filtrar por projeto"]')
          .element as HTMLSelectElement
      ).value,
      'p1',
    );
    assert.equal(
      (wrapper.get('[aria-label="Filtrar por tipo"]').element as HTMLSelectElement)
        .value,
      'test',
    );
    assert.equal(
      (wrapper.get('[aria-label="Filtrar por estado"]').element as HTMLSelectElement)
        .value,
      'failed',
    );
  } finally {
    cleanup?.();
    cleanup = undefined;
  }
});
