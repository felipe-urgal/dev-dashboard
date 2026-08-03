import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ServerHealthCheckService } from '../src/services/server-health-check-service.js';

test('detecta o primeiro endpoint local saudável', async () => {
  const requestedPaths: string[] = [];
  const service = new ServerHealthCheckService(
    async (_port, path) => {
      requestedPaths.push(path);

      return path === '/health'
        ? { httpStatus: 204, latencyMs: 8 }
        : { httpStatus: 404, latencyMs: 3 };
    },
  );

  const health = await service.check({
    projectId: 'project-a',
    port: 3_000,
  });

  assert.deepEqual(requestedPaths, ['/up', '/health']);
  assert.equal(health.path, '/health');
  assert.equal(health.pathSource, 'detected');
  assert.equal(health.status, 'healthy');
  assert.equal(health.httpStatus, 204);
  assert.equal(health.latencyMs, 8);
});

test('classifica redirecionamento como degradado sem segui-lo', async () => {
  const service = new ServerHealthCheckService(
    async () => ({ httpStatus: 302, latencyMs: 4 }),
  );

  const health = await service.check({
    projectId: 'project-a',
    port: 3_000,
    healthCheckPath: '/up',
  });

  assert.equal(health.pathSource, 'configured');
  assert.equal(health.status, 'degraded');
  assert.equal(health.httpStatus, 302);
});

test('resume falhas de rede sem expor detalhes internos', async () => {
  const service = new ServerHealthCheckService(
    async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:3000');
    },
  );

  const health = await service.check({
    projectId: 'project-a',
    port: 3_000,
  });

  assert.equal(health.status, 'unavailable');
  assert.equal(health.message?.includes('ECONNREFUSED'), false);
});
