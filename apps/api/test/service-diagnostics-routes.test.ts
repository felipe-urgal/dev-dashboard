import assert from 'node:assert/strict';
import test from 'node:test';
import type { ServiceDiagnosticsSnapshot } from '@dev-dashboard/contracts';
import { buildApp } from '../src/app.js';

const TOKEN = 'd'.repeat(64);

test('diagnostics GET is authenticated, read-only, schema bounded and isolates project', async (context) => {
  const calls: Array<[string, string, string | undefined]> = [];
  const snapshot: ServiceDiagnosticsSnapshot = {
    serviceRef: 'systemd:user:fixture.service',
    projectId: 'loto',
    environmentInstanceId: 'environment:primary:loto',
    provider: 'systemd',
    source: 'journal',
    status: 'unavailable',
    state: 'failed',
    readiness: 'unknown',
    observedAt: '2026-10-20T12:00:00Z',
    readAt: '2026-10-20T12:01:00Z',
    stale: true,
    partial: true,
    masked: false,
    truncated: false,
    diagnostic: 'Journal indisponível por permissão',
    events: [],
    jobs: [],
  };
  const app = await buildApp({
    localToken: TOKEN,
    serviceDiagnostics: {
      read: async (project, ref, environment) => {
        calls.push([project, ref, environment]);
        return snapshot;
      },
    },
  });
  context.after(async () => app.close());
  const url =
    '/api/projects/loto/services/systemd%3Auser%3Afixture.service/diagnostics?environmentInstanceId=environment%3Aprimary%3Aloto';
  const denied = await app.inject({ method: 'GET', url });
  assert.equal(denied.statusCode, 401);
  assert.equal(calls.length, 0);

  const fetched = await app.inject({
    method: 'GET',
    url,
    headers: { 'x-dev-dashboard-token': TOKEN },
  });
  assert.equal(fetched.statusCode, 200);
  assert.deepEqual(
    fetched.json<{ diagnostics: ServiceDiagnosticsSnapshot }>().diagnostics,
    snapshot,
  );
  assert.deepEqual(calls, [
    ['loto', 'systemd:user:fixture.service', 'environment:primary:loto'],
  ]);

  const bad = await app.inject({
    method: 'GET',
    url: url + '&command=journalctl%20--all',
    headers: { 'x-dev-dashboard-token': TOKEN },
  });
  assert.equal(bad.statusCode, 400);
  assert.equal(calls.length, 1);
  const mutation = await app.inject({
    method: 'POST',
    url,
    headers: { 'x-dev-dashboard-token': TOKEN },
  });
  assert.notEqual(mutation.statusCode, 200);
  assert.equal(calls.length, 1);
});
