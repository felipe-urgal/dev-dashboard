import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';

import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';

import type { LocalPortInspection } from '@dev-dashboard/contracts';

import LocalPortsPanel from '../src/components/LocalPortsPanel.vue';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

async function mountPanel(inspection: LocalPortInspection) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/ports') {
      return new Response(JSON.stringify({ inspection }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(LocalPortsPanel, {
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
      },
    },
  });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await flushPromises();
  await flushPromises();
  return wrapper;
}

test('mostra processo gerenciado, processo externo, conflito e sugestão', async () => {
  const wrapper = await mountPanel({
    status: 'ready',
    platform: 'linux',
    inspectedAt: '2026-08-05T14:00:00.000Z',
    truncated: false,
    entries: [
      {
        port: 3_000,
        address: '127.0.0.1',
        scope: 'loopback',
        state: 'occupied',
        conflict: false,
        expected: [
          {
            projectId: 'p1',
            projectName: 'Aplicação',
            service: 'server',
          },
        ],
        managedProcess: {
          id: 'server-p1',
          projectId: 'p1',
          projectName: 'Aplicação',
          kind: 'server',
          status: 'running',
        },
      },
      {
        port: 5_432,
        address: '0.0.0.0',
        scope: 'all-interfaces',
        state: 'occupied',
        conflict: true,
        expected: [
          {
            projectId: 'p2',
            projectName: 'Banco',
            service: 'server',
          },
        ],
        externalProcess: {
          pid: 5_000,
          name: 'postgres',
        },
        suggestedPort: 5_433,
      },
    ],
  });

  assert.equal(wrapper.findAll('.local-ports-table tbody tr').length, 2);
  assert.match(wrapper.text(), /Aplicação/);
  assert.match(wrapper.text(), /postgres/);
  assert.match(wrapper.text(), /PID 5000/);
  assert.match(wrapper.text(), /Conflito/);
  assert.match(wrapper.text(), /Próxima livre: 5433/);
  assert.match(wrapper.text(), /Todas as interfaces/);
  assert.equal(wrapper.findAllComponents(RouterLinkStub).length >= 2, true);
});

test('explica quando a plataforma ainda não é suportada', async () => {
  const wrapper = await mountPanel({
    status: 'unsupported',
    platform: 'unsupported',
    inspectedAt: '2026-08-05T14:00:00.000Z',
    entries: [],
    truncated: false,
    warning: 'Disponível somente no Linux.',
  });

  assert.match(wrapper.text(), /Disponível somente no Linux/);
  assert.equal(wrapper.find('.local-ports-table').exists(), false);
});
