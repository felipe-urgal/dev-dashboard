import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  DevelopmentEnvironmentInstance,
  ManagedProcess,
  Project,
} from '@dev-dashboard/contracts';

import { EnvironmentInstanceCleanupService } from '../src/services/environment-instance-cleanup-service.js';

const TARGET_ENVIRONMENT = 'environment:worktree:project-1:worktree-a';
const OTHER_ENVIRONMENT = 'environment:worktree:project-1:worktree-b';
const WORKTREE_PATH_FIXTURE = '/workspace/project-1-feature';

function instance(
  overrides: Partial<DevelopmentEnvironmentInstance> = {},
): DevelopmentEnvironmentInstance {
  return {
    id: TARGET_ENVIRONMENT,
    projectId: 'project-1',
    source: {
      kind: 'worktree',
      path: '/workspace/project-1-feature',
      worktreeId: 'worktree-a',
    },
    runtime: { kind: 'host' },
    lifecycle: 'degraded',
    ...overrides,
  };
}

function managedProcess(
  id: string,
  kind: ManagedProcess['kind'],
  environmentInstanceId: string,
): ManagedProcess {
  return {
    id,
    projectId: 'project-1',
    environmentInstanceId,
    kind,
    status: 'running',
  };
}

test('cleanup de worktree ausente encerra somente recursos da Environment Instance dona', async () => {
  const stopped: string[] = [];
  const closedTerminals: string[] = [];
  const cleanedPtys: Array<[string, string]> = [];
  const processes = [
    managedProcess('server-a', 'server', TARGET_ENVIRONMENT),
    managedProcess('test-a', 'test', TARGET_ENVIRONMENT),
    managedProcess('worker-a', 'worker', TARGET_ENVIRONMENT),
    managedProcess('webpack-a', 'webpack', TARGET_ENVIRONMENT),
    managedProcess('server-b', 'server', OTHER_ENVIRONMENT),
  ];

  const service = new EnvironmentInstanceCleanupService({
    processManager: {
      listProcesses: async () => processes,
      stopServer: async (_projectId, environmentInstanceId) => {
        stopped.push(`server:${environmentInstanceId}`);
        return { ...processes[0]!, status: 'stopped' };
      },
      stopTest: async (_projectId, environmentInstanceId) => {
        stopped.push(`test:${environmentInstanceId}`);
        return { ...processes[1]!, status: 'stopped' };
      },
      stopWorker: async (_projectId, kind, environmentInstanceId) => {
        stopped.push(`${kind}:${environmentInstanceId}`);
        return {
          ...processes[kind === 'worker' ? 2 : 3]!,
          status: 'stopped',
        };
      },
    },
    projectTerminalService: {
      closeEnvironment: (environmentInstanceId) => {
        closedTerminals.push(environmentInstanceId);
      },
    },
    detachableExecutionService: {
      cleanupEnvironment: (projectId, environmentInstanceId) => {
        cleanedPtys.push([projectId, environmentInstanceId]);
        return 1;
      },
    },
  });

  assert.deepEqual(await service.cleanupMissingWorktree(instance()), {
    state: 'cleaned',
  });
  assert.deepEqual(stopped.sort(), [
    `server:${TARGET_ENVIRONMENT}`,
    `test:${TARGET_ENVIRONMENT}`,
    `webpack:${TARGET_ENVIRONMENT}`,
    `worker:${TARGET_ENVIRONMENT}`,
  ]);
  assert.deepEqual(closedTerminals, [TARGET_ENVIRONMENT]);
  assert.deepEqual(cleanedPtys, [['project-1', TARGET_ENVIRONMENT]]);
  assert.equal(
    stopped.some((entry) => entry.includes(OTHER_ENVIRONMENT)),
    false,
  );
});

test('cleanup continua nos demais recursos e sinaliza falha quando um processo não pode ser encerrado', async () => {
  let terminalClosed = false;
  let ptyCleanupCalled = false;

  const service = new EnvironmentInstanceCleanupService({
    processManager: {
      listProcesses: async () => [
        managedProcess('server-a', 'server', TARGET_ENVIRONMENT),
      ],
      stopServer: async () => {
        throw new Error('stop failed');
      },
      stopTest: async () =>
        managedProcess('test-a', 'test', TARGET_ENVIRONMENT),
      stopWorker: async (_projectId, kind) =>
        managedProcess(`${kind}-a`, kind, TARGET_ENVIRONMENT),
    },
    projectTerminalService: {
      closeEnvironment: () => {
        terminalClosed = true;
      },
    },
    detachableExecutionService: {
      cleanupEnvironment: () => {
        ptyCleanupCalled = true;
        return 0;
      },
    },
  });

  const result = await service.cleanupMissingWorktree(instance());
  assert.equal(result.state, 'cleanup-required');
  assert.equal(terminalClosed, true);
  assert.equal(ptyCleanupCalled, true);
});

test('runtime Dev Container sem adapter owned permanece fail-closed mas limpa recursos locais', async () => {
  let localCleanupObserved = false;
  const service = new EnvironmentInstanceCleanupService({
    processManager: {
      listProcesses: async () => {
        localCleanupObserved = true;
        return [];
      },
      stopServer: async () =>
        managedProcess('server', 'server', TARGET_ENVIRONMENT),
      stopTest: async () => managedProcess('test', 'test', TARGET_ENVIRONMENT),
      stopWorker: async (_projectId, kind) =>
        managedProcess(kind, kind, TARGET_ENVIRONMENT),
    },
    projectTerminalService: {
      closeEnvironment: () => {
        localCleanupObserved = true;
      },
    },
  });

  const result = await service.cleanupMissingWorktree(
    instance({ runtime: { kind: 'devcontainer', runtimeId: 'runtime-1' } }),
  );
  assert.equal(result.state, 'cleanup-required');
  assert.match(result.diagnostic ?? '', /Dev Container associado/i);
  assert.equal(localCleanupObserved, true);
});

test('cleanup de worktree ausente preserva Compose owned e sinaliza intervenção explícita', async () => {
  const stopped: string[] = [];
  let terminalClosed = false;
  let ptyCleanupCalled = false;
  const baseProject: Project = {
    id: 'project-1',
    name: 'Projeto',
    path: '/workspace/project-1',
    type: 'node',
    source: 'workspace',
    enabled: true,
    capabilities: ['git'],
  };

  const service = new EnvironmentInstanceCleanupService({
    processManager: {
      listProcesses: async () => [
        managedProcess('server-a', 'server', TARGET_ENVIRONMENT),
      ],
      stopServer: async (_projectId, environmentInstanceId) => {
        stopped.push(environmentInstanceId);
        return managedProcess('server-a', 'server', TARGET_ENVIRONMENT);
      },
      stopTest: async () =>
        managedProcess('test-a', 'test', TARGET_ENVIRONMENT),
      stopWorker: async (_projectId, kind) =>
        managedProcess(`${kind}-a`, kind, TARGET_ENVIRONMENT),
    },
    projectTerminalService: {
      closeEnvironment: () => {
        terminalClosed = true;
      },
    },
    detachableExecutionService: {
      cleanupEnvironment: () => {
        ptyCleanupCalled = true;
        return 0;
      },
    },
    projectStore: {
      findProject: (projectId) =>
        projectId === baseProject.id ? baseProject : undefined,
    },
    dockerComposeOwnershipStore: {
      get: async (target) => ({
        projectId: target.id,
        projectPath: target.path,
        composeProjectName: 'devdash-test',
        startedAt: '2026-09-19T16:00:00.000Z',
      }),
    },
  });

  const result = await service.cleanupMissingWorktree(instance());

  assert.equal(result.state, 'cleanup-required');
  assert.match(result.diagnostic ?? '', /Docker Compose owned/i);
  assert.deepEqual(stopped, [TARGET_ENVIRONMENT]);
  assert.equal(terminalClosed, true);
  assert.equal(ptyCleanupCalled, true);
});

test('cleanup de worktree ausente falha fechado se ownership Compose não puder ser confirmado', async () => {
  const baseProject: Project = {
    id: 'project-1',
    name: 'Projeto',
    path: '/workspace/project-1',
    type: 'node',
    source: 'workspace',
    enabled: true,
    capabilities: ['git'],
  };

  const service = new EnvironmentInstanceCleanupService({
    processManager: {
      listProcesses: async () => [],
      stopServer: async () =>
        managedProcess('server-a', 'server', TARGET_ENVIRONMENT),
      stopTest: async () =>
        managedProcess('test-a', 'test', TARGET_ENVIRONMENT),
      stopWorker: async (_projectId, kind) =>
        managedProcess(`${kind}-a`, kind, TARGET_ENVIRONMENT),
    },
    projectTerminalService: {
      closeEnvironment: () => undefined,
    },
    projectStore: {
      findProject: () => baseProject,
    },
    dockerComposeOwnershipStore: {
      get: async () => {
        throw new Error('ownership unavailable');
      },
    },
  });

  const result = await service.cleanupMissingWorktree(instance());

  assert.equal(result.state, 'cleanup-required');
  assert.match(result.diagnostic ?? '', /ownership do Docker Compose/i);
});

test('cleanup de worktree órfão remove Dev Container owned e preserva origem degradada', async () => {
  const runtimeId = 'a'.repeat(64);
  const baseProject: Project = {
    id: 'project-1',
    name: 'Projeto',
    path: '/workspace/project-1',
    type: 'node',
    source: 'workspace',
    enabled: true,
    capabilities: ['git'],
  };
  const updates: DevelopmentEnvironmentInstance[] = [];
  const devContainerCalls: string[] = [];

  const service = new EnvironmentInstanceCleanupService({
    processManager: {
      listProcesses: async () => [],
      stopServer: async () =>
        managedProcess('server-a', 'server', TARGET_ENVIRONMENT),
      stopTest: async () =>
        managedProcess('test-a', 'test', TARGET_ENVIRONMENT),
      stopWorker: async (_projectId, kind) =>
        managedProcess(kind, kind, TARGET_ENVIRONMENT),
    },
    projectTerminalService: {
      closeEnvironment: () => undefined,
    },
    projectStore: {
      findProject: () => baseProject,
    },
    developmentEnvironmentInstanceStore: {
      upsert: (value) => updates.push(value),
    },
    devContainerCleanupService: {
      inspect: async (_project, environmentInstanceId) => {
        devContainerCalls.push(`inspect:${environmentInstanceId}`);
        return {
          state: 'present' as const,
          environmentInstanceId: TARGET_ENVIRONMENT,
          ownership: {
            projectId: baseProject.id,
            environmentInstanceId: TARGET_ENVIRONMENT,
            projectPath: WORKTREE_PATH_FIXTURE,
            configSource: '.devcontainer/devcontainer.json' as const,
            ownershipToken: '11111111-1111-4111-8111-111111111111',
            phase: 'owned' as const,
            containerId: runtimeId,
            claimedAt: '2026-10-02T10:00:00.000Z',
            updatedAt: '2026-10-02T10:00:00.000Z',
          },
          containerId: runtimeId,
          running: true,
        };
      },
      cleanup: async (_project, environmentInstanceId) => {
        devContainerCalls.push(`cleanup:${environmentInstanceId}`);
        return {
          state: 'cleaned' as const,
          environmentInstanceId: TARGET_ENVIRONMENT,
          containerId: runtimeId,
        };
      },
    },
  });

  const result = await service.cleanupMissingWorktree(
    instance({
      runtime: { kind: 'devcontainer', runtimeId },
    }),
  );

  assert.equal(result.state, 'cleaned');
  assert.deepEqual(devContainerCalls, [
    `inspect:${TARGET_ENVIRONMENT}`,
    `cleanup:${TARGET_ENVIRONMENT}`,
  ]);
  assert.equal(updates.at(-1)?.runtime.kind, 'host');
  assert.equal(updates.at(-1)?.lifecycle, 'degraded');
});
