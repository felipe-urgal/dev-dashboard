import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';
import { ProjectServerSettingsRepository } from '@dev-dashboard/process-manager';

import { buildApp } from '../src/app.js';
import { createAppContext } from '../src/app-context.js';

const TOKEN = 'h'.repeat(64);

test('GET /api/projects/:id/server-health usa somente a porta resolvida pela API', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-health-route-'),
  );
  const appContext = createAppContext();
  appContext.serverSettingsRepository = new ProjectServerSettingsRepository(
    fixtureRoot,
  );
  const project: Project = {
    id: 'project-health',
    workspaceId: 'workspace-health',
    name: 'Projeto Health',
    path: '/tmp/project-health',
    type: 'node',
    source: 'workspace',
    enabled: true,
    capabilities: ['server'],
  };

  appContext.projectStore.saveWorkspaceScan({
    workspaceId: project.workspaceId,
    workspacePath: '/tmp',
    projects: [project],
    warnings: [],
  });
  await appContext.serverSettingsRepository.save(project.id, {
    port: 3_210,
    healthCheckPath: '/healthz',
  });
  appContext.processManager.getServerProcess = async () => ({
    id: 'server-health',
    projectId: project.id,
    kind: 'server',
    status: 'running',
    port: 3_210,
  });

  let receivedInput: unknown;
  let serviceCalls = 0;
  appContext.serverHealthCheckService.check = async (input) => {
    serviceCalls += 1;
    receivedInput = input;

    return {
      projectId: project.id,
      path: '/healthz',
      pathSource: 'configured',
      status: 'healthy',
      httpStatus: 200,
      latencyMs: 5,
      checkedAt: '2026-08-03T10:00:00.000Z',
    };
  };

  const app = await buildApp({
    localToken: TOKEN,
    context: appContext,
  });
  context.after(async () => {
    await app.close();
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const response = await app.inject({
    method: 'GET',
    url: `/api/projects/${project.id}/server-health`,
    headers: { 'x-dev-dashboard-token': TOKEN },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(receivedInput, {
    projectId: project.id,
    port: 3_210,
    healthCheckPath: '/healthz',
  });
  assert.deepEqual(response.json().health, {
    projectId: project.id,
    path: '/healthz',
    pathSource: 'configured',
    status: 'healthy',
    httpStatus: 200,
    latencyMs: 5,
    checkedAt: '2026-08-03T10:00:00.000Z',
  });

  appContext.processManager.getServerProcess = async () => null;
  const stoppedResponse = await app.inject({
    method: 'GET',
    url: `/api/projects/${project.id}/server-health`,
    headers: { 'x-dev-dashboard-token': TOKEN },
  });

  assert.equal(stoppedResponse.statusCode, 200);
  assert.equal(stoppedResponse.json().health.status, 'unavailable');
  assert.match(
    stoppedResponse.json().health.message,
    /precisa estar em execução/i,
  );
  assert.equal(serviceCalls, 1);

  await appContext.serverSettingsRepository.save(project.id, {
    port: 3_210,
  });
  appContext.processManager.getServerProcess = async () => ({
    id: 'server-health',
    projectId: project.id,
    kind: 'server',
    status: 'running',
    port: 3_210,
  });

  const unconfiguredResponse = await app.inject({
    method: 'GET',
    url: `/api/projects/${project.id}/server-health`,
    headers: { 'x-dev-dashboard-token': TOKEN },
  });

  assert.equal(unconfiguredResponse.statusCode, 200);
  assert.equal(unconfiguredResponse.json().health.status, 'unavailable');
  assert.match(
    unconfiguredResponse.json().health.message,
    /configure um caminho/i,
  );
  assert.equal(serviceCalls, 1);

  const maliciousPathResponse = await app.inject({
    method: 'PUT',
    url: `/api/projects/${project.id}/server-settings`,
    headers: { 'x-dev-dashboard-token': TOKEN },
    payload: {
      port: 3_210,
      healthCheckPath: 'http://example.com/health',
    },
  });

  assert.equal(maliciousPathResponse.statusCode, 400);
  assert.equal(maliciousPathResponse.json().error, 'INVALID_HEALTH_CHECK_PATH');
});
