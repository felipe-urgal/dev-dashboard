import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  DevelopmentEnvironmentInstance,
  ManagedProcess,
} from '@dev-dashboard/contracts';

import { EnvironmentInstanceCleanupService } from '../src/services/environment-instance-cleanup-service.js';

const TARGET_ENVIRONMENT = 'environment:worktree:project-1:worktree-a';
const OTHER_ENVIRONMENT = 'environment:worktree:project-1:worktree-b';

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

test('cleanup não tenta adivinhar runtime não suportado', async () => {
  let inspected = false;
  const service = new EnvironmentInstanceCleanupService({
    processManager: {
      listProcesses: async () => {
        inspected = true;
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
        inspected = true;
      },
    },
  });

  const result = await service.cleanupMissingWorktree(
    instance({ runtime: { kind: 'devcontainer', runtimeId: 'runtime-1' } }),
  );
  assert.equal(result.state, 'cleanup-required');
  assert.equal(inspected, false);
});
