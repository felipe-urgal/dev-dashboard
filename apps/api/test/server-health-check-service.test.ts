import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';

import { ServerHealthCheckService } from '../src/services/server-health-check-service.js';

test('consulta somente o endpoint configurado', async () => {
  const requestedPaths: string[] = [];
  const service = new ServerHealthCheckService(async (_port, path) => {
    requestedPaths.push(path);

    return path === '/status'
      ? { httpStatus: 204, latencyMs: 8 }
      : { httpStatus: 404, latencyMs: 3 };
  });

  const health = await service.check({
    projectId: 'project-a',
    port: 3_000,
    healthCheckPath: '/status',
  });

  assert.deepEqual(requestedPaths, ['/status']);
  assert.equal(health.path, '/status');
  assert.equal(health.pathSource, 'configured');
  assert.equal(health.status, 'healthy');
  assert.equal(health.httpStatus, 204);
  assert.equal(health.latencyMs, 8);
});

test('classifica redirecionamento como degradado sem segui-lo', async () => {
  const service = new ServerHealthCheckService(async () => ({
    httpStatus: 302,
    latencyMs: 4,
  }));

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
  const service = new ServerHealthCheckService(async () => {
    throw new Error('connect ECONNREFUSED 127.0.0.1:3000');
  });

  const health = await service.check({
    projectId: 'project-a',
    port: 3_000,
    healthCheckPath: '/status',
  });

  assert.equal(health.status, 'unavailable');
  assert.equal(health.message?.includes('ECONNREFUSED'), false);
});

test('usa a rede local real e encerra a resposta sem consumir o corpo', async (context) => {
  let receivedHost = '';
  let receivedPath = '';
  let responseClosed!: () => void;
  const closed = new Promise<void>((resolve) => {
    responseClosed = resolve;
  });
  const server = http.createServer((request, response) => {
    receivedHost = request.headers.host ?? '';
    receivedPath = request.url ?? '';
    response.writeHead(200, {
      'Content-Type': 'text/plain',
    });
    response.write('conteúdo que não deve ser consumido');
    response.on('close', responseClosed);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  context.after(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
  );

  const port = (server.address() as AddressInfo).port;
  const health = await new ServerHealthCheckService().check({
    projectId: 'project-real-network',
    port,
    healthCheckPath: '/health',
  });
  await closed;

  assert.equal(health.status, 'healthy');
  assert.equal(health.httpStatus, 200);
  assert.equal(receivedHost, `localhost:${port}`);
  assert.equal(receivedPath, '/health');
});

test('interrompe a requisição real quando o servidor não envia headers', async (context) => {
  const server = http.createServer(() => {
    // Mantém a conexão aberta para exercitar o timeout real de 2 segundos.
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  context.after(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
  );

  const port = (server.address() as AddressInfo).port;
  const startedAt = Date.now();
  const health = await new ServerHealthCheckService().check({
    projectId: 'project-timeout',
    port,
    healthCheckPath: '/health',
  });

  assert.equal(health.status, 'unavailable');
  assert.match(health.message ?? '', /não respondeu/i);
  assert.ok(Date.now() - startedAt >= 1_900);
  assert.ok(Date.now() - startedAt < 5_000);
});
