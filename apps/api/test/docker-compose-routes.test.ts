import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { buildApp } from '../src/app.js';
import { createAppContext } from '../src/app-context.js';
import type {
  DockerComposeLogSnapshot,
  DockerComposeMutationResult,
  DockerComposeStartResult,
} from '../src/services/docker-compose-lifecycle-service.js';
import type { DockerComposeOwnershipRecord } from '../src/services/docker-compose-ownership-store.js';
import type { DockerComposePortPreflight } from '../src/services/docker-compose-preflight-service.js';
import type { DockerComposeInspection } from '../src/services/docker-compose-provider.js';

const TOKEN = 'c'.repeat(64);
const OBSERVED_AT = '2026-09-19T15:00:00.000Z';

function project(): Project {
  return {
    id: 'project-1',
    name: 'Compose Project',
    path: '/tmp/dev-dashboard-compose-project',
    type: 'node',
    source: 'workspace',
    workspaceId: 'workspace-1',
    enabled: true,
    capabilities: [],
  };
}

const inspection: DockerComposeInspection = {
  state: 'available',
  observedAt: OBSERVED_AT,
  config: {
    projectName: 'compose-project',
    observedAt: OBSERVED_AT,
    services: [
      {
        name: 'web',
        image: 'node:22',
        profiles: [],
        dependsOn: ['db'],
        ports: [{ targetPort: 3000, publishedPort: 4300, protocol: 'tcp' }],
      },
    ],
    declaredPorts: [],
  },
  runtime: {
    observedAt: OBSERVED_AT,
    services: [
      {
        service: 'web',
        containerId: 'sensitive-container-id',
        containerName: 'sensitive-container-name',
        state: 'running',
        health: 'healthy',
        ports: [{ targetPort: 3000, publishedPort: 4300, protocol: 'tcp' }],
      },
    ],
  },
};

const preflight: DockerComposePortPreflight = {
  state: 'ready',
  inspectedAt: OBSERVED_AT,
  conflicts: [],
};

const ownership: DockerComposeOwnershipRecord = {
  projectId: 'project-1',
  projectPath: '/tmp/dev-dashboard-compose-project',
  composeProjectName: 'compose-project',
  startedAt: OBSERVED_AT,
};

async function createFixture() {
  const context = createAppContext();
  const knownProject = project();
  context.projectStore.saveWorkspaceScan({
    workspaceId: 'workspace-1',
    workspacePath: '/tmp',
    projects: [knownProject],
    warnings: [],
  });

  const calls: Array<{ action: string; project: Project; service?: string }> =
    [];
  const startResult: DockerComposeStartResult = {
    state: 'started',
    preflight,
    inspection,
  };
  const stopResult: DockerComposeMutationResult = {
    state: 'stopped',
    inspection,
  };
  const restartResult: DockerComposeMutationResult = {
    state: 'restarted',
    inspection,
  };
  const logResult: DockerComposeLogSnapshot = {
    content: 'web | ready\n',
    truncated: false,
    masked: false,
    redactionCount: 0,
    readAt: OBSERVED_AT,
  };

  const app = await buildApp({
    localToken: TOKEN,
    context,
    dockerComposeProvider: {
      inspect: async () => inspection,
    },
    dockerComposePreflightService: {
      inspect: async () => preflight,
    },
    dockerComposeOwnershipStore: {
      get: async () => ownership,
      claim: async () => ownership,
      release: async () => true,
    },
    dockerComposeLifecycleService: {
      start: async (target) => {
        calls.push({ action: 'start', project: target });
        return startResult;
      },
      stop: async (target, service) => {
        calls.push({
          action: 'stop',
          project: target,
          ...(service ? { service } : {}),
        });
        return stopResult;
      },
      restart: async (target, service) => {
        calls.push({
          action: 'restart',
          project: target,
          ...(service ? { service } : {}),
        });
        return restartResult;
      },
      logs: async (target, options = {}) => {
        calls.push({
          action: 'logs',
          project: target,
          ...(options.service ? { service: options.service } : {}),
        });
        return logResult;
      },
    },
  });

  return { app, calls, knownProject };
}

test('Compose snapshot é autenticado e remove IDs de container do contrato público', async (context) => {
  const fixture = await createFixture();
  context.after(() => fixture.app.close());

  const unauthorized = await fixture.app.inject({
    method: 'GET',
    url: '/api/projects/project-1/docker-compose',
  });
  assert.equal(unauthorized.statusCode, 401);

  const response = await fixture.app.inject({
    method: 'GET',
    url: '/api/projects/project-1/docker-compose',
    headers: { 'x-dev-dashboard-token': TOKEN },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.ownership.owned, true);
  assert.equal(body.inspection.config.services[0].name, 'web');
  assert.equal(body.inspection.runtime.services[0].containerId, undefined);
  assert.equal(body.inspection.runtime.services[0].containerName, undefined);
});

test('Compose mutações resolvem Project no backend e aceitam somente serviço estruturado', async (context) => {
  const fixture = await createFixture();
  context.after(() => fixture.app.close());

  const response = await fixture.app.inject({
    method: 'POST',
    url: '/api/projects/project-1/docker-compose/restart',
    headers: {
      'x-dev-dashboard-token': TOKEN,
      'content-type': 'application/json',
    },
    payload: { service: 'web' },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0]?.action, 'restart');
  assert.equal(fixture.calls[0]?.service, 'web');
  assert.equal(fixture.calls[0]?.project, fixture.knownProject);
});

test('Compose rejeita path, argv e executable enviados pelo browser', async (context) => {
  const fixture = await createFixture();
  context.after(() => fixture.app.close());

  const response = await fixture.app.inject({
    method: 'POST',
    url: '/api/projects/project-1/docker-compose/stop',
    headers: {
      'x-dev-dashboard-token': TOKEN,
      'content-type': 'application/json',
    },
    payload: {
      service: 'web',
      path: '/etc',
      executable: '/bin/sh',
      argv: ['-c', 'id'],
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(fixture.calls.length, 0);
});

test('Compose logs retornam somente snapshot bounded do lifecycle owned', async (context) => {
  const fixture = await createFixture();
  context.after(() => fixture.app.close());

  const response = await fixture.app.inject({
    method: 'GET',
    url: '/api/projects/project-1/docker-compose/logs?service=web&tail=50',
    headers: { 'x-dev-dashboard-token': TOKEN },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().logs.content, 'web | ready\n');
  assert.equal(fixture.calls[0]?.action, 'logs');
  assert.equal(fixture.calls[0]?.service, 'web');
});

test('Compose retorna 404 sem tocar lifecycle para projeto inexistente', async (context) => {
  const fixture = await createFixture();
  context.after(() => fixture.app.close());

  const response = await fixture.app.inject({
    method: 'POST',
    url: '/api/projects/missing/docker-compose/start',
    headers: {
      'x-dev-dashboard-token': TOKEN,
      'content-type': 'application/json',
    },
    payload: {},
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error, 'PROJECT_NOT_FOUND');
  assert.equal(fixture.calls.length, 0);
});
