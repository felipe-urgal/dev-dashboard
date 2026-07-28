import assert from 'node:assert/strict';
import { test } from 'vitest';

import type { Activity } from '@dev-dashboard/contracts';

import { buildActivityQuery, fetchActivities } from '../src/api.js';
import {
  activityDetailPath,
  originLabel,
  statusLabel,
} from '../src/utils/activity-format.js';
import { activityToneFor } from '../src/utils/status-tones.js';

test('buildActivityQuery omits empty fields and encodes provided ones', () => {
  assert.equal(buildActivityQuery({}), '');
  const encoded = buildActivityQuery({
    workspaceId: 'w1',
    projectId: 'p1',
    origin: 'script',
    status: 'failed',
    search: 'build css',
    page: 2,
    pageSize: 30,
  });
  const params = new URLSearchParams(encoded);
  assert.equal(params.get('workspaceId'), 'w1');
  assert.equal(params.get('projectId'), 'p1');
  assert.equal(params.get('origin'), 'script');
  assert.equal(params.get('status'), 'failed');
  assert.equal(params.get('search'), 'build css');
  assert.equal(params.get('page'), '2');
  assert.equal(params.get('pageSize'), '30');
});

test('status and origin formatters cover every discriminated variant', () => {
  assert.equal(statusLabel('running'), 'Em execução');
  assert.equal(statusLabel('succeeded'), 'Concluída');
  assert.equal(statusLabel('failed'), 'Falhou');
  assert.equal(statusLabel('cancelled'), 'Cancelada');
  assert.equal(statusLabel('unknown'), 'Desconhecida');

  assert.equal(activityToneFor('failed'), 'danger');
  assert.equal(activityToneFor('cancelled'), 'warning');
  assert.equal(activityToneFor('running'), 'info');
  assert.equal(activityToneFor('succeeded'), 'success');
  assert.equal(activityToneFor('unknown'), 'neutral');

  assert.equal(originLabel('script'), 'Catálogo');
  assert.equal(originLabel('test'), 'Testes');
  assert.equal(originLabel('server'), 'Servidor');
});

test('activityDetailPath routes each origin to its safe project sub-route', () => {
  const base: Omit<Activity, 'origin' | 'reference'> = {
    id: 'x', projectId: 'p one', label: 'l', status: 'succeeded', startedAt: '2026-07-26T10:00:00Z',
  };
  assert.equal(
    activityDetailPath({ ...base, origin: 'script', reference: { executionId: 'e', actionId: 'a' } }),
    '/projects/p%20one/scripts',
  );
  assert.equal(
    activityDetailPath({ ...base, origin: 'test', reference: { processId: 'q' } }),
    '/projects/p%20one/tests',
  );
  assert.equal(
    activityDetailPath({ ...base, origin: 'server', reference: { processId: 'q' } }),
    '/projects/p%20one',
  );
});

test('fetchActivities forwards filters and returns the activities payload', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  const payload = {
    activities: {
      items: [
        { id: 'server:1', projectId: 'p1', label: 'srv', origin: 'server', status: 'running', startedAt: '2026-07-26T10:00:00Z', reference: { processId: 'proc' } },
      ],
      page: 1, pageSize: 20, total: 1, totalPages: 1,
      summary: { running: 1, succeeded: 0, failed: 0, total: 1 },
    },
  };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  try {
    const result = await fetchActivities({ workspaceId: 'w1', origin: 'server', page: 1, pageSize: 20 });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.origin, 'server');
    assert.equal(result.summary.running, 1);
    assert.equal(calls.length, 1);
    const url = new URL(calls[0]!, 'http://localhost');
    assert.equal(url.pathname, '/api/activities');
    assert.equal(url.searchParams.get('workspaceId'), 'w1');
    assert.equal(url.searchParams.get('origin'), 'server');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
