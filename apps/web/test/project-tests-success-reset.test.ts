import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

import { mount } from '@vue/test-utils';
import type { ManagedProcess, ProjectTestOverview } from '@dev-dashboard/contracts';

import ProjectTestsPanel from '../src/components/ProjectTestsPanel.vue';
import { makeProject } from './support/activity-fixtures.js';

const baseOverview: ProjectTestOverview = {
  supported: true,
  commands: [
    {
      id: 'node-script-test',
      runner: 'vitest',
      label: 'npm run test',
      description: 'Executa o script `test` do package.json.',
      origin: 'package-script',
      originDetail: 'scripts.test',
      priority: 10,
      supportsFileTarget: true,
    },
  ],
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function flushMicrotasks(iterations = 20): Promise<void> {
  for (let index = 0; index < iterations; index += 1) await Promise.resolve();
}

function installTerminalProcessFetch(process: ManagedProcess): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/tests')) return jsonResponse({ tests: baseOverview });
    if (url.pathname.endsWith('/tests/process/logs')) {
      return jsonResponse({
        log: {
          projectId: 'p1',
          processId: process.id,
          content: process.exitCode === 0 ? '1 test passed' : '1 test failed',
          sizeBytes: 13,
          truncated: false,
          masked: false,
          redactionCount: 0,
          readAt: '2026-07-31T14:12:49Z',
        },
      });
    }
    if (url.pathname.endsWith('/tests/process')) return jsonResponse({ process });
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

test('volta ao estado pronto automaticamente depois de uma execução bem-sucedida', async () => {
  vi.useFakeTimers();
  installTerminalProcessFetch({
    id: 'node-script-test',
    projectId: 'p1',
    kind: 'test',
    status: 'stopped',
    command: 'npm',
    args: ['run', 'test'],
    startedAt: '2026-07-31T14:12:29Z',
    stoppedAt: '2026-07-31T14:12:49Z',
    exitCode: 0,
  });

  const wrapper = mount(ProjectTestsPanel, { props: { project: makeProject() } });
  await flushMicrotasks();

  assert.match(wrapper.text(), /Concluído com sucesso/);
  assert.match(wrapper.text(), /Resultado da execução/);

  await vi.advanceTimersByTimeAsync(1_600);
  await flushMicrotasks();

  assert.doesNotMatch(wrapper.text(), /Resultado da execução/);
  assert.match(wrapper.text(), /Configure a execução acima para começar/);
  wrapper.unmount();
});

test('mantém o resultado visível quando a execução falha', async () => {
  vi.useFakeTimers();
  installTerminalProcessFetch({
    id: 'node-script-test',
    projectId: 'p1',
    kind: 'test',
    status: 'failed',
    command: 'npm',
    args: ['run', 'test'],
    startedAt: '2026-07-31T14:12:29Z',
    stoppedAt: '2026-07-31T14:12:49Z',
    exitCode: 1,
  });

  const wrapper = mount(ProjectTestsPanel, { props: { project: makeProject() } });
  await flushMicrotasks();

  assert.match(wrapper.text(), /Falhou \(código 1\)/);
  assert.match(wrapper.text(), /Resultado da execução/);

  await vi.advanceTimersByTimeAsync(10_000);
  await flushMicrotasks();

  assert.match(wrapper.text(), /Resultado da execução/);
  assert.doesNotMatch(wrapper.text(), /Configure a execução acima para começar/);
  wrapper.unmount();
});
