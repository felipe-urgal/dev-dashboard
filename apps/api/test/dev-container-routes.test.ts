import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import type { Project } from '@dev-dashboard/contracts';

import { registerApiErrorHandling } from '../src/http/api-error.js';
import { devContainerRoutes } from '../src/routes/dev-container.js';
import type { DevContainerInspection } from '../src/services/dev-container-discovery-service.js';
import type { DevContainerLifecyclePreflight } from '../src/services/dev-container-lifecycle-planning-service.js';
import {
  DevContainerRebuildError,
  DevContainerStartError,
  type DevContainerRebuildInput,
  type DevContainerStartInput,
} from '../src/services/dev-container-start-service.js';
import { ProjectStore } from '../src/store/project-store.js';

const project: Project = {
  id: 'project-1',
  name: 'Projeto',
  path: '/workspace/project-1',
  type: 'node',
  source: 'workspace',
  workspaceId: 'workspace-1',
  enabled: true,
  capabilities: [],
};

function projectStore(): ProjectStore {
  const store = new ProjectStore();
  store.saveWorkspaceScan({
    workspaceId: 'workspace-1',
    workspacePath: '/workspace',
    projects: [project],
    warnings: [],
  });
  return store;
}

const unusedLifecycleConfirmationService = {
  prepare: (_preflight: DevContainerLifecyclePreflight) => {
    throw new Error('não usado');
  },
};

const unusedStartService = {
  start: async (_project: Project, _input: DevContainerStartInput = {}) => {
    throw new Error('não usado');
  },
  rebuild: async (_project: Project, _input: DevContainerRebuildInput = {}) => {
    throw new Error('não usado');
  },
};

test('Dev Container HTTP expõe discovery sanitizado e 404 determinístico', async (context) => {
  const calls: string[] = [];
  const inspection: DevContainerInspection = {
    state: 'available',
    observedAt: '2026-09-24T21:15:00.000Z',
    configSource: '.devcontainer/devcontainer.json',
    cliVersion: '0.80.1',
    configuration: {
      kind: 'compose',
      name: 'Workspace',
      service: 'api',
      lifecycleHooks: ['postCreateCommand', 'postStartCommand'],
    },
  };

  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(devContainerRoutes, {
    prefix: '/api',
    projectStore: projectStore(),
    devContainerLifecycleConfirmationService:
      unusedLifecycleConfirmationService,
    devContainerStartService: unusedStartService,
    devContainerLifecyclePlanningService: {
      plan: async () => {
        throw new Error('não usado');
      },
    },
    devContainerDiscoveryService: {
      inspect: async (selectedProject) => {
        calls.push(selectedProject.id);
        return {
          ...inspection,
          configurationHash: 'e'.repeat(64),
          internalSecret: 'não pode sair',
          configuration: {
            ...inspection.configuration!,
            composeUsesDefaultConfiguration: true,
            internalSecret: 'não pode sair',
          },
        } as DevContainerInspection;
      },
    },
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: 'GET',
    url: '/api/projects/project-1/dev-container',
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { inspection });
  assert.equal(response.body.includes('não pode sair'), false);
  assert.equal(response.body.includes('eeeeeeee'), false);
  assert.deepEqual(calls, ['project-1']);

  const missing = await app.inject({
    method: 'GET',
    url: '/api/projects/missing/dev-container',
  });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json<{ error: string }>().error, 'PROJECT_NOT_FOUND');
  assert.deepEqual(calls, ['project-1']);
});

test('Dev Container HTTP preserva estados fail-closed sem inventar configuration', async (context) => {
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(devContainerRoutes, {
    prefix: '/api',
    projectStore: projectStore(),
    devContainerLifecycleConfirmationService:
      unusedLifecycleConfirmationService,
    devContainerStartService: unusedStartService,
    devContainerLifecyclePlanningService: {
      plan: async () => {
        throw new Error('não usado');
      },
    },
    devContainerDiscoveryService: {
      inspect: async () => ({
        state: 'cli-missing',
        observedAt: '2026-09-24T21:16:00.000Z',
        configSource: '.devcontainer.json',
        diagnostic: 'A Dev Container CLI não está disponível no PATH da API.',
      }),
    },
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: 'GET',
    url: '/api/projects/project-1/dev-container',
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    inspection: {
      state: 'cli-missing',
      observedAt: '2026-09-24T21:16:00.000Z',
      configSource: '.devcontainer.json',
      diagnostic: 'A Dev Container CLI não está disponível no PATH da API.',
    },
  });
});

test('Dev Container lifecycle preflight expõe apenas plano read-only e encaminha Environment Instance', async (context) => {
  const calls: Array<{ projectId: string; environmentInstanceId?: string }> =
    [];
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(devContainerRoutes, {
    prefix: '/api',
    projectStore: projectStore(),
    devContainerLifecycleConfirmationService:
      unusedLifecycleConfirmationService,
    devContainerStartService: unusedStartService,
    devContainerDiscoveryService: {
      inspect: async () => ({
        state: 'not-configured',
        observedAt: '2026-09-24T22:10:00.000Z',
      }),
    },
    devContainerLifecyclePlanningService: {
      plan: async (selectedProject, input) => {
        calls.push({
          projectId: selectedProject.id,
          ...(input.environmentInstanceId
            ? { environmentInstanceId: input.environmentInstanceId }
            : {}),
        });
        return {
          projectId: selectedProject.id,
          operation: 'create',
          state: 'review',
          reason: 'review-required',
          observedAt: '2026-09-24T22:10:00.000Z',
          environmentInstanceId:
            input.environmentInstanceId ?? 'environment:primary:project-1',
          runtime: 'host',
          executionEnabled: false,
          requiresConfirmation: true,
          discoveryState: 'available',
          configSource: '.devcontainer/devcontainer.json',
          configurationHash: 'f'.repeat(64),
          cliVersion: '0.80.1',
          configuration: {
            kind: 'image',
            name: 'Workspace',
            lifecycleHooks: ['postCreateCommand'],
          },
          limitations: ['post-create-hooks-deferred'],
          diagnostic: 'Revisão humana necessária.',
          internalSecret: 'não pode sair',
        } as DevContainerLifecyclePreflight & { internalSecret: string };
      },
    },
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: 'GET',
    url:
      '/api/projects/project-1/dev-container/lifecycle-preflight?' +
      'environmentInstanceId=environment%3Aworktree%3Aproject-1%3Afeature',
  });

  assert.equal(response.statusCode, 200);
  const body = response.json<{
    preflight: {
      state: string;
      executionEnabled: boolean;
      environmentInstanceId: string;
      discoveryState?: string;
      configuration?: { name?: string };
      configurationHash?: string;
      internalSecret?: string;
    };
  }>();
  assert.equal(body.preflight.state, 'review');
  assert.equal(body.preflight.executionEnabled, false);
  assert.equal(body.preflight.discoveryState, 'available');
  assert.equal(body.preflight.configuration?.name, 'Workspace');
  assert.equal(body.preflight.configurationHash, undefined);
  assert.equal(
    body.preflight.environmentInstanceId,
    'environment:worktree:project-1:feature',
  );
  assert.equal(body.preflight.internalSecret, undefined);
  assert.deepEqual(calls, [
    {
      projectId: 'project-1',
      environmentInstanceId: 'environment:worktree:project-1:feature',
    },
  ]);
});

test('Dev Container rebuild expõe operação sem vazar runtimeId ou ownershipToken', async (context) => {
  const environmentInstanceId =
    'environment:worktree:project-1:devcontainer-rebuild';
  const runtimeId = 'a'.repeat(64);
  const ownershipToken = '11111111-1111-4111-8111-111111111111';
  const preparedOperations: string[] = [];
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(devContainerRoutes, {
    prefix: '/api',
    projectStore: projectStore(),
    devContainerDiscoveryService: {
      inspect: async () => ({
        state: 'not-configured',
        observedAt: '2026-09-25T10:50:00.000Z',
      }),
    },
    devContainerLifecyclePlanningService: {
      plan: async (selectedProject, input) => ({
        projectId: selectedProject.id,
        operation: 'rebuild',
        state: 'review',
        reason: 'review-required',
        observedAt: '2026-09-25T10:50:00.000Z',
        environmentInstanceId:
          input.environmentInstanceId ?? environmentInstanceId,
        runtime: 'devcontainer',
        runtimeId,
        ownershipToken,
        executionEnabled: false,
        requiresConfirmation: true,
        discoveryState: 'available',
        configSource: '.devcontainer/devcontainer.json',
        configurationHash: 'f'.repeat(64),
        cliVersion: '0.80.1',
        configuration: {
          kind: 'image',
          lifecycleHooks: [],
        },
        limitations: [],
        diagnostic: 'Rebuild exige revisão humana.',
      }),
    },
    devContainerLifecycleConfirmationService: {
      prepare: (preflight) => {
        preparedOperations.push(preflight.operation);
        assert.equal(preflight.runtimeId, runtimeId);
        assert.equal(preflight.ownershipToken, ownershipToken);
        return {
          token: 'e'.repeat(64),
          projectId: preflight.projectId,
          environmentInstanceId: preflight.environmentInstanceId,
          operation: 'rebuild',
          preflightHash: 'f'.repeat(64),
          expiresAt: '2026-09-25T10:51:00.000Z',
        };
      },
    },
    devContainerStartService: unusedStartService,
  });
  context.after(() => app.close());

  const query =
    '?environmentInstanceId=' + encodeURIComponent(environmentInstanceId);
  const preflightResponse = await app.inject({
    method: 'GET',
    url: '/api/projects/project-1/dev-container/lifecycle-preflight' + query,
  });
  assert.equal(preflightResponse.statusCode, 200);
  assert.equal(preflightResponse.json().preflight.operation, 'rebuild');
  assert.equal(preflightResponse.body.includes(runtimeId), false);
  assert.equal(preflightResponse.body.includes(ownershipToken), false);

  const confirmationResponse = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/dev-container/lifecycle-confirmation',
    payload: { environmentInstanceId },
  });
  assert.equal(confirmationResponse.statusCode, 201);
  assert.deepEqual(confirmationResponse.json(), {
    confirmation: {
      token: 'e'.repeat(64),
      environmentInstanceId,
      operation: 'rebuild',
      expiresAt: '2026-09-25T10:51:00.000Z',
    },
  });
  assert.equal(confirmationResponse.body.includes(runtimeId), false);
  assert.equal(confirmationResponse.body.includes(ownershipToken), false);
  assert.deepEqual(preparedOperations, ['rebuild']);
});

test('Dev Container lifecycle preflight converte ambiente inexistente em 404', async (context) => {
  const { DevContainerLifecyclePlanningError } =
    await import('../src/services/dev-container-lifecycle-planning-service.js');
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(devContainerRoutes, {
    prefix: '/api',
    projectStore: projectStore(),
    devContainerLifecycleConfirmationService:
      unusedLifecycleConfirmationService,
    devContainerStartService: unusedStartService,
    devContainerDiscoveryService: {
      inspect: async () => ({
        state: 'not-configured',
        observedAt: '2026-09-24T22:11:00.000Z',
      }),
    },
    devContainerLifecyclePlanningService: {
      plan: async () => {
        throw new DevContainerLifecyclePlanningError(
          'DEV_CONTAINER_ENVIRONMENT_NOT_FOUND',
          'Ambiente indisponível.',
        );
      },
    },
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: 'GET',
    url:
      '/api/projects/project-1/dev-container/lifecycle-preflight?' +
      'environmentInstanceId=missing',
  });

  assert.equal(response.statusCode, 404);
  assert.equal(
    response.json<{ error: string }>().error,
    'ENVIRONMENT_INSTANCE_NOT_FOUND',
  );
});

test('Dev Container lifecycle confirmation revalida preflight e não expõe fingerprint interno', async (context) => {
  const prepared: string[] = [];
  const environmentInstanceId =
    'environment:worktree:project-1:devcontainer-confirmation';
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(devContainerRoutes, {
    prefix: '/api',
    projectStore: projectStore(),
    devContainerDiscoveryService: {
      inspect: async () => ({
        state: 'not-configured',
        observedAt: '2026-09-25T09:00:00.000Z',
      }),
    },
    devContainerLifecyclePlanningService: {
      plan: async (selectedProject, input) => ({
        projectId: selectedProject.id,
        operation: 'create',
        state: 'review',
        reason: 'review-required',
        observedAt: '2026-09-25T09:00:00.000Z',
        environmentInstanceId:
          input.environmentInstanceId ?? 'environment:primary:project-1',
        runtime: 'host',
        executionEnabled: false,
        requiresConfirmation: true,
        discoveryState: 'available',
        configSource: '.devcontainer/devcontainer.json',
        configurationHash: 'f'.repeat(64),
        cliVersion: '0.80.1',
        configuration: {
          kind: 'image',
          lifecycleHooks: [],
        },
        limitations: [],
        diagnostic: 'Revisão humana necessária.',
      }),
    },
    devContainerLifecycleConfirmationService: {
      prepare: (preflight) => {
        prepared.push(preflight.environmentInstanceId);
        return {
          token: 'a'.repeat(64),
          projectId: preflight.projectId,
          environmentInstanceId: preflight.environmentInstanceId,
          operation: 'create',
          preflightHash: 'b'.repeat(64),
          expiresAt: '2026-09-25T09:01:00.000Z',
          internalSecret: 'não pode sair',
        };
      },
    },
    devContainerStartService: unusedStartService,
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/dev-container/lifecycle-confirmation',
    payload: { environmentInstanceId },
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.json(), {
    confirmation: {
      token: 'a'.repeat(64),
      environmentInstanceId,
      operation: 'create',
      expiresAt: '2026-09-25T09:01:00.000Z',
    },
  });
  assert.equal(response.body.includes('preflightHash'), false);
  assert.equal(response.body.includes('não pode sair'), false);
  assert.deepEqual(prepared, [environmentInstanceId]);
});

test('Dev Container start encaminha somente Environment Instance e confirmação ao executor', async (context) => {
  const calls: Array<{
    projectId: string;
    input: DevContainerStartInput;
  }> = [];
  const environmentInstanceId =
    'environment:worktree:project-1:devcontainer-start';
  const confirmationToken = 'c'.repeat(64);
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(devContainerRoutes, {
    prefix: '/api',
    projectStore: projectStore(),
    devContainerDiscoveryService: {
      inspect: async () => ({
        state: 'not-configured',
        observedAt: '2026-09-25T09:02:00.000Z',
      }),
    },
    devContainerLifecyclePlanningService: {
      plan: async () => {
        throw new Error('não usado');
      },
    },
    devContainerLifecycleConfirmationService:
      unusedLifecycleConfirmationService,
    devContainerStartService: {
      start: async (selectedProject, input = {}) => {
        calls.push({ projectId: selectedProject.id, input });
        return {
          environmentInstanceId,
          runtime: 'devcontainer',
          containerId: 'a'.repeat(64),
          internalSecret: 'não pode sair',
        };
      },
      rebuild: unusedStartService.rebuild,
    },
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/dev-container/start',
    payload: {
      environmentInstanceId,
      confirmationToken,
      ignored: 'não aceito',
    },
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.json(), {
    result: {
      environmentInstanceId,
      runtime: 'devcontainer',
      containerId: 'a'.repeat(64),
    },
  });
  assert.equal(response.body.includes('não pode sair'), false);
  assert.deepEqual(calls, [
    {
      projectId: 'project-1',
      input: {
        environmentInstanceId,
        confirmationToken,
      },
    },
  ]);
});

test('Dev Container rebuild encaminha somente Environment Instance e confirmação ao executor', async (context) => {
  const calls: Array<{
    projectId: string;
    input: DevContainerRebuildInput;
  }> = [];
  const environmentInstanceId =
    'environment:worktree:project-1:devcontainer-rebuild-runtime';
  const confirmationToken = 'e'.repeat(64);
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(devContainerRoutes, {
    prefix: '/api',
    projectStore: projectStore(),
    devContainerDiscoveryService: {
      inspect: async () => ({
        state: 'not-configured',
        observedAt: '2026-09-25T11:25:00.000Z',
      }),
    },
    devContainerLifecyclePlanningService: {
      plan: async () => {
        throw new Error('não usado');
      },
    },
    devContainerLifecycleConfirmationService:
      unusedLifecycleConfirmationService,
    devContainerStartService: {
      start: unusedStartService.start,
      rebuild: async (selectedProject, input = {}) => {
        calls.push({ projectId: selectedProject.id, input });
        return {
          environmentInstanceId,
          runtime: 'devcontainer',
          containerId: 'b'.repeat(64),
          internalSecret: 'não pode sair',
        };
      },
    },
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/dev-container/rebuild',
    payload: {
      environmentInstanceId,
      confirmationToken,
      ignored: 'não aceito',
    },
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.json(), {
    result: {
      environmentInstanceId,
      runtime: 'devcontainer',
      containerId: 'b'.repeat(64),
    },
  });
  assert.equal(response.body.includes('não pode sair'), false);
  assert.deepEqual(calls, [
    {
      projectId: 'project-1',
      input: {
        environmentInstanceId,
        confirmationToken,
      },
    },
  ]);
});

test('Dev Container rebuild preserva ownership drift como conflito sanitizado', async (context) => {
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(devContainerRoutes, {
    prefix: '/api',
    projectStore: projectStore(),
    devContainerDiscoveryService: {
      inspect: async () => ({
        state: 'not-configured',
        observedAt: '2026-09-25T11:26:00.000Z',
      }),
    },
    devContainerLifecyclePlanningService: {
      plan: async () => {
        throw new Error('não usado');
      },
    },
    devContainerLifecycleConfirmationService:
      unusedLifecycleConfirmationService,
    devContainerStartService: {
      start: unusedStartService.start,
      rebuild: async () => {
        throw new DevContainerRebuildError(
          'DEV_CONTAINER_REBUILD_OWNERSHIP_CHANGED',
          'O ownership do Dev Container mudou depois da confirmação.',
        );
      },
    },
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/dev-container/rebuild',
    payload: {
      confirmationToken: 'f'.repeat(64),
    },
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    error: 'DEV_CONTAINER_REBUILD_OWNERSHIP_CHANGED',
    message: 'O ownership do Dev Container mudou depois da confirmação.',
  });
});

test('Dev Container start preserva erro sanitizado de confirmação como conflito', async (context) => {
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(devContainerRoutes, {
    prefix: '/api',
    projectStore: projectStore(),
    devContainerDiscoveryService: {
      inspect: async () => ({
        state: 'not-configured',
        observedAt: '2026-09-25T09:03:00.000Z',
      }),
    },
    devContainerLifecyclePlanningService: {
      plan: async () => {
        throw new Error('não usado');
      },
    },
    devContainerLifecycleConfirmationService:
      unusedLifecycleConfirmationService,
    devContainerStartService: {
      start: async () => {
        throw new DevContainerStartError(
          'DEV_CONTAINER_START_CONFIRMATION_REQUIRED',
          'Uma confirmação válida e atual é obrigatória para criar o Dev Container.',
        );
      },
      rebuild: unusedStartService.rebuild,
    },
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/dev-container/start',
    payload: {
      confirmationToken: 'd'.repeat(64),
    },
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    error: 'DEV_CONTAINER_START_CONFIRMATION_REQUIRED',
    message:
      'Uma confirmação válida e atual é obrigatória para criar o Dev Container.',
  });
});
