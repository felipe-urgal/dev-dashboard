import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';

import { flushPromises, mount } from '@vue/test-utils';

import type { ProjectTestOverview } from '@dev-dashboard/contracts';

import ProjectTestsPanel from '../src/components/ProjectTestsPanel.vue';
import { makeProject } from './support/activity-fixtures.js';
import { createTestRouter } from './support/test-router';

vi.mock('../src/stores/notice-center', () => ({
  noticeCenterStore: { publishTerminalNotice: vi.fn() },
}));

const overview: ProjectTestOverview = {
  supported: true,
  commands: [
    {
      id: 'node-script-test',
      runner: 'vitest',
      label: 'yarn run test',
      description: 'Executa o script `test` do package.json.',
      origin: 'package-script',
      originDetail: 'scripts.test',
      priority: 10,
      supportsFileTarget: true,
      supportsCaseTarget: false,
      supportsNamePatternTarget: true,
    },
  ],
};

let cleanup: (() => void) | undefined;

beforeEach(() => {
  cleanup = undefined;
});

afterEach(() => {
  cleanup?.();
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function settle(): Promise<void> {
  await flushPromises();
  await flushPromises();
}

test('estrutura o log, remove ANSI e extrai o resumo da execução', async () => {
  const originalFetch = globalThis.fetch;
  const process = {
    id: 'node-script-test:file',
    projectId: 'p1',
    kind: 'test',
    status: 'stopped',
    command: 'yarn',
    args: ['run', 'test', '--', 'spec/ui/default-template.spec.tsx'],
    startedAt: '2026-07-29T16:27:29Z',
    stoppedAt: '2026-07-29T16:27:32Z',
    exitCode: 0,
  };
  const log = [
    'yarn run v1.22.22',
    'warning From Yarn 1.0 onwards, scripts do not require -- for options.',
    '\u001b[36m RUN \u001b[39m v2.1.9 /workspace/app',
    '\u001b[32m ✓ \u001b[39m spec/ui/default-template.spec.tsx (25 tests) 232ms',
    'Test Files  1 passed (1)',
    'Tests       25 passed (25)',
    'Start at    13:27:30',
    'Duration    2.26s (transform 81ms, setup 520ms, collect 196ms, tests 232ms)',
    'Done in 2.87s.',
  ].join('\n');

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/tests'))
      return jsonResponse({ tests: overview });
    if (url.pathname.endsWith('/files')) {
      return jsonResponse({
        files: [{ path: 'spec/ui/default-template.spec.tsx' }],
      });
    }
    if (url.pathname.endsWith('/tests/process/logs')) {
      return jsonResponse({
        log: {
          projectId: 'p1',
          processId: 'node-script-test:file',
          content: log,
          sizeBytes: log.length,
          truncated: false,
          masked: false,
          redactionCount: 0,
          readAt: '2026-07-29T16:27:32Z',
        },
      });
    }
    if (url.pathname.endsWith('/tests/process'))
      return jsonResponse({ process });
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectTestsPanel, {
    props: { project: makeProject() },
    global: { plugins: [createTestRouter()] },
  });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await settle();

  const summary = wrapper.find('.tests-summary');
  assert.match(summary.text(), /default-template\.spec\.tsx/);
  assert.match(summary.text(), /Sucessos25/);
  assert.match(summary.text(), /Falhas/);
  assert.match(summary.text(), /232ms/);
  assert.match(summary.text(), /Vitest|Arquivo específico/);

  const output = wrapper.find('.tests-log-output');
  assert.doesNotMatch(output.text(), /\u001b\[/);
  assert.equal(wrapper.findAll('.tests-log-lines li').length, 9);

  const warningsTab = wrapper
    .findAll('.tests-log-tabs button')
    .find((button) => button.text() === 'Avisos (1)');
  assert.ok(warningsTab);
  await warningsTab.trigger('click');
  assert.equal(wrapper.findAll('.tests-log-lines li').length, 1);
  assert.match(wrapper.find('.tests-log-lines').text(), /warning From Yarn/);
});

test('repete a execução atual preservando o arquivo alvo', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ path: string; body?: string }> = [];
  let process: Record<string, unknown> | null = {
    id: 'node-script-test:file',
    projectId: 'p1',
    kind: 'test',
    status: 'stopped',
    command: 'yarn',
    args: ['run', 'test', '--', 'src/app.test.ts'],
    startedAt: '2026-07-29T15:00:00Z',
    stoppedAt: '2026-07-29T15:00:02Z',
    exitCode: 0,
  };

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    calls.push({
      path: url.pathname,
      ...(typeof init?.body === 'string' ? { body: init.body } : {}),
    });
    if (url.pathname.endsWith('/tests'))
      return jsonResponse({ tests: overview });
    if (
      url.pathname.endsWith('/files') &&
      !url.pathname.endsWith('/files/start')
    ) {
      return jsonResponse({ files: [{ path: 'src/app.test.ts' }] });
    }
    if (url.pathname.endsWith('/files/start')) {
      process = {
        id: 'node-script-test:file',
        projectId: 'p1',
        kind: 'test',
        status: 'stopped',
        command: 'yarn',
        args: ['run', 'test', '--', 'src/app.test.ts'],
        startedAt: '2026-07-29T16:30:00Z',
        stoppedAt: '2026-07-29T16:30:02Z',
        exitCode: 0,
      };
      return jsonResponse({ process }, 201);
    }
    if (url.pathname.endsWith('/tests/process/logs')) {
      return jsonResponse({
        log: {
          projectId: 'p1',
          processId: 'node-script-test:file',
          content: 'Tests 1 passed\nDone in 2s.',
          sizeBytes: 28,
          truncated: false,
          masked: false,
          redactionCount: 0,
          readAt: '2026-07-29T16:30:02Z',
        },
      });
    }
    if (url.pathname.endsWith('/tests/process'))
      return jsonResponse({ process });
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectTestsPanel, {
    props: { project: makeProject() },
    global: { plugins: [createTestRouter()] },
  });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await settle();

  const repeatButton = wrapper
    .findAll('button')
    .find((button) => button.text() === 'Repetir execução');
  assert.ok(repeatButton);
  await repeatButton.trigger('click');
  await settle();

  const startCall = calls.find((call) => call.path.endsWith('/files/start'));
  assert.ok(startCall);
  assert.match(startCall.body ?? '', /src\/app\.test\.ts/);
  assert.match(wrapper.text(), /Concluído com sucesso/);
  assert.match(wrapper.text(), /src\/app\.test\.ts/);
});
