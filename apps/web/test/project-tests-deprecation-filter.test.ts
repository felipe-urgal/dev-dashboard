import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';

import { mount } from '@vue/test-utils';
import type {
  ManagedProcess,
  ProjectTestOverview,
} from '@dev-dashboard/contracts';

import ProjectTestsPanel from '../src/components/ProjectTestsPanel.vue';
import { makeProject } from './support/activity-fixtures.js';
import { createTestRouter } from './support/test-router';

const overview: ProjectTestOverview = {
  supported: true,
  commands: [
    {
      id: 'rails-rspec',
      runner: 'rspec',
      label: 'bundle exec rspec',
      description: 'Executa a suíte completa do RSpec.',
      origin: 'gemfile',
      originDetail: 'Gemfile',
      priority: 10,
      supportsFileTarget: true,
      supportsCaseTarget: true,
      supportsNamePatternTarget: false,
    },
  ],
};

const process: ManagedProcess = {
  id: 'rails-rspec',
  projectId: 'p1',
  kind: 'test',
  status: 'stopped',
  command: 'bundle',
  args: ['exec', 'rspec'],
  startedAt: '2026-08-07T12:00:00Z',
  stoppedAt: '2026-08-07T12:00:02Z',
  exitCode: 0,
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function flushMicrotasks(iterations = 100): Promise<void> {
  for (let index = 0; index < iterations; index += 1) await Promise.resolve();
}

test('oculta blocos de DEPRECATION WARNING do log exibido do RSpec', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/tests'))
      return jsonResponse({ tests: overview });
    if (url.pathname.endsWith('/tests/process/logs')) {
      return jsonResponse({
        log: {
          projectId: 'p1',
          processId: process.id,
          content: [
            'DEPRECATION WARNING: ActiveSupport::Configurable is deprecated.',
            'You can emulate the previous behavior with `class_attribute`.',
            '(called from <main> at /tmp/app/config/application.rb:7)',
            '',
            'Randomized with seed 19207',
            '.',
            '1 example, 0 failures',
          ].join('\n'),
          sizeBytes: 240,
          truncated: false,
          masked: false,
          redactionCount: 0,
          readAt: '2026-08-07T12:00:02Z',
        },
      });
    }
    if (url.pathname.endsWith('/tests/process'))
      return jsonResponse({ process });
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectTestsPanel, {
    props: { project: makeProject({ type: 'rails' }) },
    global: { plugins: [createTestRouter()] },
  });
  await flushMicrotasks();

  assert.doesNotMatch(wrapper.text(), /DEPRECATION WARNING/);
  assert.doesNotMatch(wrapper.text(), /ActiveSupport::Configurable/);
  assert.match(wrapper.text(), /Randomized with seed 19207/);
  assert.match(wrapper.text(), /1 example, 0 failures/);

  wrapper.unmount();
});
