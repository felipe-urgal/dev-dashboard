import assert from 'node:assert/strict';
import test from 'node:test';

import type { SystemdProjectCapabilitiesSnapshot } from '@dev-dashboard/contracts';
import { buildApp } from '../src/app.js';

const TOKEN = 'z'.repeat(64);
const RESPONSE: SystemdProjectCapabilitiesSnapshot = {
  projectId: 'fixture',
  environmentInstanceId: 'environment:primary:fixture',
  readAt: '2026-10-21T13:00:00.000Z',
  partial: false,
  services: [
    {
      bindingId: '11111111-1111-4111-8111-111111111111',
      serviceRef: 'systemd:user:fixture.service',
      scope: 'user',
      state: 'stopped',
      readiness: 'unknown',
      start: {
        status: 'permission-required',
        reason: 'No current operator grant.',
      },
      stop: {
        status: 'unsupported',
        reason: 'Unit is already stopped.',
      },
      restart: {
        status: 'unsupported',
        reason: 'Restart has no confirmed plan.',
      },
      executable: false,
    },
  ],
};

test('project systemd capabilities are authenticated, scoped and strictly read-only', async (t) => {
  const calls: Array<{ projectId: string; environment?: string }> = [];
  const app = await buildApp({
    localToken: TOKEN,
    systemdCapabilities: {
      inspect: async (projectId, environmentInstanceId) => {
        calls.push({
          projectId,
          ...(environmentInstanceId
            ? { environment: environmentInstanceId }
            : {}),
        });
        return RESPONSE;
      },
    },
  });
  t.after(async () => app.close());
  const uri = '/api/projects/fixture/systemd-capabilities';
  assert.equal((await app.inject({ method: 'GET', url: uri })).statusCode, 401);
  assert.deepEqual(calls, []);
  const headers = { 'x-dev-dashboard-token': TOKEN };
  const ok = await app.inject({ method: 'GET', url: uri, headers });
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(ok.json<SystemdProjectCapabilitiesSnapshot>(), RESPONSE);
  assert.deepEqual(calls, [{ projectId: 'fixture' }]);

  const env = await app.inject({
    method: 'GET',
    url: uri + '?environmentInstanceId=environment%3Aprimary%3Afixture',
    headers,
  });
  assert.equal(env.statusCode, 200);
  assert.equal(calls[1]?.environment, 'environment:primary:fixture');

  for (const invalid of [
    '?extra=true',
    '?environmentInstanceId=a&environmentInstanceId=b',
    '?environmentInstanceId=',
  ]) {
    assert.equal(
      (await app.inject({ method: 'GET', url: uri + invalid, headers }))
        .statusCode,
      400,
    );
  }
  assert.equal(calls.length, 2);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
    const response = await app.inject({ method, url: uri, headers });
    assert.notEqual(response.statusCode, 200);
  }
  assert.equal(calls.length, 2);
});
