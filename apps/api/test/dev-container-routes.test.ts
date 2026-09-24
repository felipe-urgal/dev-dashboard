import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import type { Project } from '@dev-dashboard/contracts';

import { registerApiErrorHandling } from '../src/http/api-error.js';
import { devContainerRoutes } from '../src/routes/dev-container.js';
import type { DevContainerInspection } from '../src/services/dev-container-discovery-service.js';
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
          internalSecret: 'não pode sair',
          configuration: {
            ...inspection.configuration!,
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
  const calls: Array<{ projectId: string; environmentInstanceId?: string }> = [];
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(devContainerRoutes, {
    prefix: '/api',
    projectStore: projectStore(),
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
          configSource: '.devcontainer/devcontainer.json',
          cliVersion: '0.80.1',
          configuration: {
            kind: 'image',
            lifecycleHooks: ['postCreateCommand'],
          },
          limitations: [
            'cleanup-adapter-pending',
            'post-create-hooks-deferred',
          ],
          diagnostic: 'Revisão humana necessária.',
          internalSecret: 'não pode sair',
        } as Awaited<
          ReturnType<
            import('../src/services/dev-container-lifecycle-planning-service.js').DevContainerLifecyclePlanningService['plan']
          >
        >;
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
      internalSecret?: string;
    };
  }>();
  assert.equal(body.preflight.state, 'review');
  assert.equal(body.preflight.executionEnabled, false);
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

test('Dev Container lifecycle preflight converte ambiente inexistente em 404', async (context) => {
  const { DevContainerLifecyclePlanningError } =
    await import('../src/services/dev-container-lifecycle-planning-service.js');
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(devContainerRoutes, {
    prefix: '/api',
    projectStore: projectStore(),
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
