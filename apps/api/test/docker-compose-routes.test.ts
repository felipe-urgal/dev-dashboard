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
  const worktreePath = '/tmp/dev-dashboard-compose-project-worktree';
  const worktree = context.developmentEnvironmentInstanceStore
    .reconcileWorktrees(knownProject.id, [
      {
        id: 'worktree-1',
        path: worktreePath,
        kind: 'linked',
      },
    ])
    .find((instance) => instance.source.kind === 'worktree');
  assert.ok(worktree);

  const calls: Array<{ action: string; project: Project; service?: string }> =
    [];
  const inspectedProjects: Project[] = [];
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
      inspect: async (target) => {
        inspectedProjects.push(target);
        return inspection;
      },
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
      reconcile: async () => ({ state: 'unchanged' }),
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

  return {
    app,
    calls,
    inspectedProjects,
    knownProject,
    worktree,
    worktreePath,
  };
}

// A criação retorna 202 antes de Activity + lifecycle concluírem; os testes
// observam a mesma rota de polling usada pela UI até o estado terminal.
async function waitForComposeExecution(
  app: Awaited<ReturnType<typeof buildApp>>,
  environmentInstanceId?: string,
) {
  const query = environmentInstanceId
    ? '?' + new URLSearchParams({ environmentInstanceId }).toString()
    : '';

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/project-1/docker-compose/lifecycle-execution' + query,
      headers: { 'x-dev-dashboard-token': TOKEN },
    });
    assert.equal(response.statusCode, 200);
    const execution = response.json().execution;
    if (
      !execution ||
      (execution.status !== 'queued' && execution.status !== 'running')
    ) {
      return execution;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }

  assert.fail(
    'Lifecycle Docker Compose não terminou dentro do limite do teste.',
  );
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
  assert.deepEqual(body.ownership.reconciliation, { state: 'unchanged' });
  assert.equal(body.inspection.config.services[0].name, 'web');
  assert.equal(body.inspection.runtime.services[0].containerId, undefined);
  assert.equal(body.inspection.runtime.services[0].containerName, undefined);
});

test('Compose usa a mesma Environment Instance para cwd e ownership isolado', async (context) => {
  const fixture = await createFixture();
  context.after(() => fixture.app.close());

  const environmentQuery = encodeURIComponent(fixture.worktree.id);
  const snapshot = await fixture.app.inject({
    method: 'GET',
    url:
      '/api/projects/project-1/docker-compose?environmentInstanceId=' +
      environmentQuery,
    headers: { 'x-dev-dashboard-token': TOKEN },
  });

  assert.equal(snapshot.statusCode, 200);
  assert.equal(fixture.inspectedProjects.at(-1)?.id, fixture.worktree.id);
  assert.equal(fixture.inspectedProjects.at(-1)?.path, fixture.worktreePath);

  const confirmation = await fixture.app.inject({
    method: 'POST',
    url:
      '/api/projects/project-1/docker-compose/lifecycle-confirmations?environmentInstanceId=' +
      environmentQuery,
    headers: {
      'x-dev-dashboard-token': TOKEN,
      'content-type': 'application/json',
    },
    payload: { operation: 'restart', service: 'web' },
  });
  assert.equal(confirmation.statusCode, 201);

  const restart = await fixture.app.inject({
    method: 'POST',
    url:
      '/api/projects/project-1/docker-compose/lifecycle-executions?environmentInstanceId=' +
      environmentQuery,
    headers: {
      'x-dev-dashboard-token': TOKEN,
      'content-type': 'application/json',
    },
    payload: {
      operation: 'restart',
      service: 'web',
      confirmationToken: confirmation.json().confirmation.token,
    },
  });

  assert.equal(restart.statusCode, 202);
  const completed = await waitForComposeExecution(
    fixture.app,
    fixture.worktree.id,
  );
  assert.equal(completed?.status, 'succeeded');
  assert.equal(fixture.calls[0]?.project.id, fixture.worktree.id);
  assert.equal(fixture.calls[0]?.project.path, fixture.worktreePath);
});

test('Compose rejeita Environment Instance desconhecida antes do lifecycle', async (context) => {
  const fixture = await createFixture();
  context.after(() => fixture.app.close());

  const response = await fixture.app.inject({
    method: 'POST',
    url:
      '/api/projects/project-1/docker-compose/lifecycle-confirmations?environmentInstanceId=' +
      encodeURIComponent('environment:worktree:project-1:missing'),
    headers: {
      'x-dev-dashboard-token': TOKEN,
      'content-type': 'application/json',
    },
    payload: { operation: 'start', service: null },
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error, 'ENVIRONMENT_INSTANCE_NOT_FOUND');
  assert.equal(fixture.calls.length, 0);
});

test('Compose mutações resolvem Project no backend e aceitam somente serviço estruturado', async (context) => {
  const fixture = await createFixture();
  context.after(() => fixture.app.close());

  const confirmation = await fixture.app.inject({
    method: 'POST',
    url: '/api/projects/project-1/docker-compose/lifecycle-confirmations',
    headers: {
      'x-dev-dashboard-token': TOKEN,
      'content-type': 'application/json',
    },
    payload: { operation: 'restart', service: 'web' },
  });
  assert.equal(confirmation.statusCode, 201);

  const response = await fixture.app.inject({
    method: 'POST',
    url: '/api/projects/project-1/docker-compose/lifecycle-executions',
    headers: {
      'x-dev-dashboard-token': TOKEN,
      'content-type': 'application/json',
    },
    payload: {
      operation: 'restart',
      service: 'web',
      confirmationToken: confirmation.json().confirmation.token,
    },
  });

  assert.equal(response.statusCode, 202);
  const completed = await waitForComposeExecution(fixture.app);
  assert.equal(completed?.status, 'succeeded');
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0]?.action, 'restart');
  assert.equal(fixture.calls[0]?.service, 'web');
  assert.equal(fixture.calls[0]?.project, fixture.knownProject);
});

test('Compose rejeita path, argv e executable enviados pelo browser', async (context) => {
  const fixture = await createFixture();
  context.after(() => fixture.app.close());

  const withService = await fixture.app.inject({
    method: 'POST',
    url: '/api/projects/project-1/docker-compose/lifecycle-confirmations',
    headers: {
      'x-dev-dashboard-token': TOKEN,
      'content-type': 'application/json',
    },
    payload: {
      operation: 'stop',
      service: 'web',
      path: '/etc',
      executable: '/bin/sh',
      argv: ['-c', 'id'],
    },
  });
  const withoutService = await fixture.app.inject({
    method: 'POST',
    url: '/api/projects/project-1/docker-compose/lifecycle-confirmations',
    headers: {
      'x-dev-dashboard-token': TOKEN,
      'content-type': 'application/json',
    },
    payload: { operation: 'stop', service: null, path: '/etc' },
  });

  assert.equal(withService.statusCode, 400);
  assert.equal(withoutService.statusCode, 400);
  assert.equal(fixture.calls.length, 0);
});

test('Compose não expõe mais mutações síncronas sem confirmação', async (context) => {
  const fixture = await createFixture();
  context.after(() => fixture.app.close());

  for (const action of ['start', 'stop', 'restart']) {
    const response = await fixture.app.inject({
      method: 'POST',
      url: `/api/projects/project-1/docker-compose/${action}`,
      headers: {
        'x-dev-dashboard-token': TOKEN,
        'content-type': 'application/json',
      },
      payload: action === 'start' ? {} : { service: null },
    });
    assert.equal(response.statusCode, 404);
  }
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
    url: '/api/projects/missing/docker-compose/lifecycle-confirmations',
    headers: {
      'x-dev-dashboard-token': TOKEN,
      'content-type': 'application/json',
    },
    payload: { operation: 'start', service: null },
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error, 'PROJECT_NOT_FOUND');
  assert.equal(fixture.calls.length, 0);
});

test('Compose lifecycle confirmado roda como job reconsultável', async (context) => {
  const fixture = await createFixture();
  context.after(() => fixture.app.close());

  const confirmationResponse = await fixture.app.inject({
    method: 'POST',
    url: '/api/projects/project-1/docker-compose/lifecycle-confirmations',
    headers: {
      'x-dev-dashboard-token': TOKEN,
      'content-type': 'application/json',
    },
    payload: { operation: 'restart', service: 'web' },
  });
  assert.equal(confirmationResponse.statusCode, 201);
  const confirmation = confirmationResponse.json().confirmation;
  assert.equal(confirmation.operation, 'restart');
  assert.equal(confirmation.service, 'web');

  const startResponse = await fixture.app.inject({
    method: 'POST',
    url: '/api/projects/project-1/docker-compose/lifecycle-executions',
    headers: {
      'x-dev-dashboard-token': TOKEN,
      'content-type': 'application/json',
    },
    payload: {
      operation: 'restart',
      service: 'web',
      confirmationToken: confirmation.token,
    },
  });
  assert.equal(startResponse.statusCode, 202);
  assert.equal(startResponse.json().execution.operation, 'restart');

  const completed = await waitForComposeExecution(fixture.app);
  assert.equal(completed?.status, 'succeeded');
  assert.equal(completed?.resultState, 'restarted');
  assert.equal(fixture.calls.at(-1)?.action, 'restart');
  assert.equal(fixture.calls.at(-1)?.service, 'web');
});

test('Compose lifecycle rejeita confirmação reutilizada', async (context) => {
  const fixture = await createFixture();
  context.after(() => fixture.app.close());

  const confirmationResponse = await fixture.app.inject({
    method: 'POST',
    url: '/api/projects/project-1/docker-compose/lifecycle-confirmations',
    headers: {
      'x-dev-dashboard-token': TOKEN,
      'content-type': 'application/json',
    },
    payload: { operation: 'stop', service: 'web' },
  });
  const token = confirmationResponse.json().confirmation.token;

  const first = await fixture.app.inject({
    method: 'POST',
    url: '/api/projects/project-1/docker-compose/lifecycle-executions',
    headers: {
      'x-dev-dashboard-token': TOKEN,
      'content-type': 'application/json',
    },
    payload: { operation: 'stop', service: 'web', confirmationToken: token },
  });
  assert.equal(first.statusCode, 202);
  const completed = await waitForComposeExecution(fixture.app);
  assert.equal(completed?.status, 'succeeded');

  const second = await fixture.app.inject({
    method: 'POST',
    url: '/api/projects/project-1/docker-compose/lifecycle-executions',
    headers: {
      'x-dev-dashboard-token': TOKEN,
      'content-type': 'application/json',
    },
    payload: { operation: 'stop', service: 'web', confirmationToken: token },
  });
  assert.equal(second.statusCode, 400);
});
