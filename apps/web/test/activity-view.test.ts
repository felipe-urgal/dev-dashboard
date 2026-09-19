import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'vitest';
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';

import type { ActivitySnapshot } from '@dev-dashboard/contracts';

import ActivityView from '../src/views/ActivityView.vue';
import { makeProject } from './support/activity-fixtures.js';

const globalSnapshot: ActivitySnapshot = {
  generatedAt: '2026-09-19T12:00:00.000Z',
  partial: false,
  unavailableDomains: [],
  jobs: [
    {
      id: 'process:srv-1',
      projectId: 'p1',
      domain: 'process',
      action: 'server',
      status: 'running',
      startedAt: '2026-09-19T11:55:00.000Z',
      resourceRef: { kind: 'managed-process', id: 'srv-1' },
      cancelSupported: true,
    },
  ],
  events: [
    {
      id: 'git:g1',
      projectId: 'p1',
      domain: 'git',
      type: 'git.push',
      status: 'succeeded',
      summary: 'Git: push',
      occurredAt: '2026-09-19T11:59:00.000Z',
      resourceRef: { kind: 'git-mutation', id: 'g1' },
    },
    {
      id: 'test:t1',
      projectId: 'p2',
      environmentInstanceId: 'environment:primary:p2',
      domain: 'test',
      type: 'test.unit',
      status: 'failed',
      summary: 'Testes: unit',
      occurredAt: '2026-09-19T11:58:00.000Z',
      resourceRef: { kind: 'test-execution', id: 't1' },
    },
  ],
};

const projectSnapshot: ActivitySnapshot = {
  ...globalSnapshot,
  events: [globalSnapshot.events[0]!],
  jobs: [globalSnapshot.jobs[0]!],
};

let originalFetch: typeof globalThis.fetch;
let activityCalls: string[];

beforeEach(() => {
  originalFetch = globalThis.fetch;
  activityCalls = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/projects') {
      return new Response(
        JSON.stringify({
          projects: [
            makeProject({ id: 'p1', name: 'API' }),
            makeProject({ id: 'p2', name: 'Web' }),
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.pathname === '/api/activity') {
      activityCalls.push(url.pathname + url.search);
      return new Response(JSON.stringify({ activity: globalSnapshot }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.pathname === '/api/projects/p1/activity') {
      activityCalls.push(url.pathname + url.search);
      return new Response(JSON.stringify({ activity: projectSnapshot }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('renderiza Jobs ativos e Timeline com links para os domínios originais', async () => {
  const wrapper = mount(ActivityView, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  });

  await flushPromises();
  await flushPromises();

  assert.equal(activityCalls[0], '/api/activity?limit=100');
  assert.match(wrapper.text(), /Jobs ativos/);
  assert.match(wrapper.text(), /Atividade recente/);
  assert.match(wrapper.text(), /API/);
  assert.match(wrapper.text(), /Web/);
  assert.match(wrapper.text(), /Git: push/);
  assert.match(wrapper.text(), /Testes: unit/);
  assert.equal(wrapper.findAll('.activity-job-card').length, 1);
  assert.equal(wrapper.findAll('.activity-timeline-item').length, 2);

  const targets = wrapper
    .findAllComponents(RouterLinkStub)
    .map((link) => link.props('to'));
  assert.equal(
    targets.some(
      (target) =>
        typeof target === 'object' &&
        target !== null &&
        'name' in target &&
        target.name === 'processes',
    ),
    true,
  );
  assert.equal(
    targets.some(
      (target) =>
        typeof target === 'object' &&
        target !== null &&
        'name' in target &&
        target.name === 'project-git',
    ),
    true,
  );
  assert.equal(
    targets.some(
      (target) =>
        typeof target === 'object' &&
        target !== null &&
        'name' in target &&
        target.name === 'project-tests',
    ),
    true,
  );

  wrapper.unmount();
});

test('troca entre snapshot global e snapshot por projeto sem polling independente', async () => {
  const wrapper = mount(ActivityView, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  });

  await flushPromises();
  await flushPromises();
  await wrapper.get('#activity-project-filter').setValue('p1');
  await flushPromises();
  await flushPromises();

  assert.equal(
    activityCalls.includes('/api/projects/p1/activity?limit=100'),
    true,
  );
  assert.equal(wrapper.findAll('.activity-timeline-item').length, 1);
  assert.doesNotMatch(wrapper.text(), /Testes: unit/);

  wrapper.unmount();
});
