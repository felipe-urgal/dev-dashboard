import assert from 'node:assert/strict';
import test from 'node:test';

import type { ExecutionContext, Project } from '@dev-dashboard/contracts';

import type { DevContainerInspection } from '../src/services/dev-container-discovery-service.js';
import {
  DevContainerLifecyclePlanningError,
  DevContainerLifecyclePlanningService,
} from '../src/services/dev-container-lifecycle-planning-service.js';

const project: Project = {
  id: 'project-1',
  name: 'Projeto',
  path: '/workspace/project',
  type: 'node',
  source: 'workspace',
  workspaceId: 'workspace-1',
  enabled: true,
  capabilities: [],
};

const CONFIG_HASH = 'b'.repeat(64);
const RUNTIME_ID = 'a'.repeat(64);
const OWNERSHIP_TOKEN = '11111111-1111-4111-8111-111111111111';

const hostContext: ExecutionContext = {
  projectId: project.id,
  environmentInstanceId: 'environment:primary:project-1',
  cwd: project.path,
  runtime: 'host',
};

function planner(
  inspection: DevContainerInspection,
  context: ExecutionContext | null = hostContext,
  ownership:
    | {
        phase: 'owned';
        containerId: string;
        ownershipToken: string;
      }
    | undefined = undefined,
) {
  const inspectedPaths: string[] = [];
  const service = new DevContainerLifecyclePlanningService(
    {
      inspect: async (selectedProject) => {
        inspectedPaths.push(selectedProject.path);
        return inspection;
      },
    },
    {
      resolveForProject: () => context,
    },
    undefined,
    {
      get: async () =>
        ownership
          ? {
              projectId: project.id,
              environmentInstanceId:
                context?.environmentInstanceId ??
                hostContext.environmentInstanceId,
              projectPath: context?.cwd ?? project.path,
              configSource: '.devcontainer/devcontainer.json',
              phase: ownership.phase,
              containerId: ownership.containerId,
              ownershipToken: ownership.ownershipToken,
              claimedAt: '2026-09-24T21:59:00.000Z',
              updatedAt: '2026-09-24T21:59:30.000Z',
            }
          : undefined,
    },
  );
  return { service, inspectedPaths };
}

test('preflight deixa image/dockerfile apenas em review e nunca habilita execução', async () => {
  const { service, inspectedPaths } = planner({
    state: 'available',
    observedAt: '2026-09-24T22:00:00.000Z',
    configSource: '.devcontainer/devcontainer.json',
    cliVersion: '0.80.1',
    configurationHash: CONFIG_HASH,
    configuration: {
      kind: 'image',
      name: 'Workspace',
      lifecycleHooks: ['postCreateCommand', 'postStartCommand'],
    },
  });

  const plan = await service.plan(project);

  assert.equal(plan.state, 'review');
  assert.equal(plan.reason, 'review-required');
  assert.equal(plan.executionEnabled, false);
  assert.equal(plan.requiresConfirmation, true);
  assert.equal(plan.discoveryState, 'available');
  assert.equal(plan.configurationHash, CONFIG_HASH);
  assert.equal(plan.configuration?.name, 'Workspace');
  assert.deepEqual(plan.limitations, ['post-create-hooks-deferred']);
  assert.deepEqual(plan.configuration?.lifecycleHooks, [
    'postCreateCommand',
    'postStartCommand',
  ]);
  assert.deepEqual(inspectedPaths, [project.path]);
});

test('preflight bloqueia initializeCommand porque pode executar no host', async () => {
  const { service } = planner({
    state: 'available',
    observedAt: '2026-09-24T22:01:00.000Z',
    configSource: '.devcontainer.json',
    cliVersion: '0.80.1',
    configurationHash: CONFIG_HASH,
    configuration: {
      kind: 'dockerfile',
      lifecycleHooks: ['initializeCommand', 'postCreateCommand'],
    },
  });

  const plan = await service.plan(project);

  assert.equal(plan.state, 'blocked');
  assert.equal(plan.reason, 'initialize-command-declared');
  assert.equal(plan.executionEnabled, false);
  assert.equal(plan.requiresConfirmation, false);
  assert.match(plan.diagnostic, /initializeCommand/);
});

test('preflight bloqueia Compose até existir ownership compartilhado', async () => {
  const { service } = planner({
    state: 'available',
    observedAt: '2026-09-24T22:02:00.000Z',
    configSource: '.devcontainer/devcontainer.json',
    cliVersion: '0.80.1',
    configurationHash: CONFIG_HASH,
    configuration: {
      kind: 'compose',
      service: 'api',
      lifecycleHooks: [],
    },
  });

  const plan = await service.plan(project);

  assert.equal(plan.state, 'blocked');
  assert.equal(plan.reason, 'compose-ownership-required');
  assert.equal(plan.executionEnabled, false);
  assert.match(plan.diagnostic, /stacks duplicadas/);
});

test('preflight não promove configuração available sem fingerprint', async () => {
  const { service } = planner({
    state: 'available',
    observedAt: '2026-09-24T22:02:30.000Z',
    configSource: '.devcontainer.json',
    cliVersion: '0.80.1',
    configuration: {
      kind: 'image',
      lifecycleHooks: [],
    },
  });

  const plan = await service.plan(project);

  assert.equal(plan.state, 'unavailable');
  assert.equal(plan.reason, 'discovery-not-ready');
  assert.equal(plan.requiresConfirmation, false);
  assert.equal(plan.configurationHash, undefined);
});

test('preflight preserva discovery inconclusivo sem promover disponibilidade', async () => {
  const { service } = planner({
    state: 'cli-missing',
    observedAt: '2026-09-24T22:03:00.000Z',
    configSource: '.devcontainer.json',
    diagnostic: 'CLI indisponível.',
  });

  const plan = await service.plan(project);

  assert.equal(plan.state, 'unavailable');
  assert.equal(plan.reason, 'discovery-not-ready');
  assert.equal(plan.executionEnabled, false);
  assert.equal(plan.requiresConfirmation, false);
  assert.equal(plan.discoveryState, 'cli-missing');
  assert.equal(plan.diagnostic, 'CLI indisponível.');
});

test('preflight usa cwd da Environment Instance e falha para ambiente inválido', async () => {
  const worktreeContext: ExecutionContext = {
    ...hostContext,
    environmentInstanceId: 'environment:worktree:project-1:feature',
    cwd: '/workspace/project-feature',
  };
  const { service, inspectedPaths } = planner(
    {
      state: 'available',
      observedAt: '2026-09-24T22:04:00.000Z',
      configSource: '.devcontainer.json',
      cliVersion: '0.80.1',
      configurationHash: CONFIG_HASH,
      configuration: { kind: 'dockerfile', lifecycleHooks: [] },
    },
    worktreeContext,
  );

  const plan = await service.plan(project, {
    environmentInstanceId: worktreeContext.environmentInstanceId,
  });
  assert.equal(
    plan.environmentInstanceId,
    worktreeContext.environmentInstanceId,
  );
  assert.deepEqual(inspectedPaths, [worktreeContext.cwd]);

  const missing = planner(
    {
      state: 'not-configured',
      observedAt: '2026-09-24T22:05:00.000Z',
    },
    null,
  ).service;
  await assert.rejects(
    () => missing.plan(project, { environmentInstanceId: 'missing' }),
    (error: unknown) =>
      error instanceof DevContainerLifecyclePlanningError &&
      error.code === 'DEV_CONTAINER_ENVIRONMENT_NOT_FOUND',
  );
});

test('preflight falha fechado quando o discovery lança erro inesperado', async () => {
  const service = new DevContainerLifecyclePlanningService(
    {
      inspect: async () => {
        throw new Error('raw secret output');
      },
    },
    {
      resolveForProject: () => hostContext,
    },
    () => new Date('2026-09-24T22:05:30.000Z'),
  );

  const plan = await service.plan(project);

  assert.equal(plan.state, 'unavailable');
  assert.equal(plan.reason, 'discovery-not-ready');
  assert.equal(plan.executionEnabled, false);
  assert.equal(plan.observedAt, '2026-09-24T22:05:30.000Z');
  assert.equal(JSON.stringify(plan).includes('raw secret output'), false);
});

test('preflight oferece rebuild somente para runtime Dev Container owned', async () => {
  const devContainerContext: ExecutionContext = {
    ...hostContext,
    runtime: 'devcontainer',
    runtimeId: RUNTIME_ID,
  };
  const inspection: DevContainerInspection = {
    state: 'available',
    observedAt: '2026-09-24T22:06:00.000Z',
    configSource: '.devcontainer/devcontainer.json',
    cliVersion: '0.80.1',
    configurationHash: CONFIG_HASH,
    configuration: { kind: 'image', lifecycleHooks: ['postCreateCommand'] },
  };
  const { service, inspectedPaths } = planner(inspection, devContainerContext, {
    phase: 'owned',
    containerId: RUNTIME_ID,
    ownershipToken: OWNERSHIP_TOKEN,
  });

  const plan = await service.plan(project);

  assert.equal(plan.operation, 'rebuild');
  assert.equal(plan.state, 'review');
  assert.equal(plan.reason, 'review-required');
  assert.equal(plan.runtime, 'devcontainer');
  assert.equal(plan.runtimeId, RUNTIME_ID);
  assert.equal(plan.ownershipToken, OWNERSHIP_TOKEN);
  assert.equal(plan.requiresConfirmation, true);
  assert.equal(plan.executionEnabled, false);
  assert.deepEqual(plan.limitations, ['post-create-hooks-deferred']);
  assert.deepEqual(inspectedPaths, [project.path]);
});

test('preflight de rebuild falha fechado sem ownership exato', async () => {
  const devContainerContext: ExecutionContext = {
    ...hostContext,
    runtime: 'devcontainer',
    runtimeId: RUNTIME_ID,
  };
  const { service, inspectedPaths } = planner(
    {
      state: 'available',
      observedAt: '2026-09-24T22:07:00.000Z',
      configSource: '.devcontainer/devcontainer.json',
      configurationHash: CONFIG_HASH,
      configuration: { kind: 'image', lifecycleHooks: [] },
    },
    devContainerContext,
    {
      phase: 'owned',
      containerId: 'c'.repeat(64),
      ownershipToken: OWNERSHIP_TOKEN,
    },
  );

  const plan = await service.plan(project);

  assert.equal(plan.operation, 'rebuild');
  assert.equal(plan.state, 'blocked');
  assert.equal(plan.reason, 'rebuild-ownership-required');
  assert.equal(plan.requiresConfirmation, false);
  assert.deepEqual(inspectedPaths, []);
});
