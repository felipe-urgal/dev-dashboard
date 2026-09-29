import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  ManagedProcess,
  Project,
  Stack,
  StackCheck,
  StackNodeState,
} from '@dev-dashboard/contracts';

import { StackStopService } from '../src/services/stack-stop-service.js';

const project: Project = {
  id: 'api',
  workspaceId: 'workspace-a',
  name: 'API',
  path: '/tmp/api',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: ['server'],
};

function stack(): Stack {
  return {
    id: 'local-stack',
    name: 'Local stack',
    nodes: [
      {
        id: 'postgres',
        name: 'Postgres',
        target: {
          kind: 'compose-service',
          projectId: 'api',
          environmentInstanceId: 'environment:primary:api',
          service: 'postgres',
        },
      },
      {
        id: 'api-server',
        name: 'API server',
        target: {
          kind: 'process',
          projectId: 'api',
          environmentInstanceId: 'environment:primary:api',
          processId: 'server:api',
        },
      },
    ],
    dependencies: [{ nodeId: 'api-server', dependsOnNodeId: 'postgres' }],
  };
}

function check(
  postgres: StackNodeState,
  api: StackNodeState,
): StackCheck {
  const value = stack();
  return {
    stack: value,
    topology: {
      stackId: value.id,
      startOrder: ['postgres', 'api-server'],
      stopOrder: ['api-server', 'postgres'],
    },
    health: {
      stackId: value.id,
      state: 'unknown',
      observedAt: '2026-09-29T11:30:00.000Z',
      nodes: [
        {
          nodeId: 'postgres',
          state: postgres,
          observedAt: '2026-09-29T11:30:00.000Z',
        },
        {
          nodeId: 'api-server',
          state: api,
          observedAt: '2026-09-29T11:30:00.000Z',
        },
      ],
    },
  };
}

function managedProcess(
  overrides: Partial<ManagedProcess> = {},
): ManagedProcess {
  return {
    id: 'server:api',
    projectId: 'api',
    environmentInstanceId: 'environment:primary:api',
    kind: 'server',
    status: 'running',
    ...overrides,
  };
}

function createService(options: {
  checks: StackCheck[];
  processes?: ManagedProcess[];
  composeStop?: () => Promise<{
    state: 'stopped' | 'stopped-unverified';
    diagnostic?: string;
  }>;
  stopServer?: () => Promise<ManagedProcess>;
}): StackStopService {
  const queue = [...options.checks];
  return new StackStopService({
    stackCheckService: {
      check: async () =>
        queue.shift() ?? options.checks[options.checks.length - 1]!,
    },
    projectStore: {
      findProject: (id) => (id === project.id ? project : null),
    },
    developmentEnvironmentInstanceStore: {
      resolveForProject: (projectId, environmentInstanceId) =>
        projectId === project.id &&
        environmentInstanceId === 'environment:primary:api'
          ? {
              projectId,
              environmentInstanceId,
              cwd: project.path,
              runtime: 'host',
            }
          : null,
    },
    dockerComposeLifecycleService: {
      stop: async () =>
        options.composeStop?.() ?? {
          state: 'stopped',
        },
    },
    processManager: {
      listProcesses: async () => options.processes ?? [managedProcess()],
      stopServer: async () =>
        options.stopServer?.() ?? managedProcess({ status: 'stopped' }),
      stopWorker: async () => {
        throw new Error('unexpected worker stop');
      },
      stopTest: async () => {
        throw new Error('unexpected test stop');
      },
    },
  });
}

test('stops mutable nodes in reverse topology order', async () => {
  const calls: string[] = [];
  const service = createService({
    checks: [
      check('ready', 'ready'),
      check('ready', 'stopped'),
      check('stopped', 'stopped'),
      check('stopped', 'stopped'),
    ],
    stopServer: async () => {
      calls.push('api-server');
      return managedProcess({ status: 'stopped' });
    },
    composeStop: async () => {
      calls.push('postgres');
      return { state: 'stopped' };
    },
  });

  const result = await service.stop('local-stack');

  assert.equal(result.state, 'completed');
  assert.deepEqual(calls, ['api-server', 'postgres']);
  assert.deepEqual(
    result.steps.map((step) => [step.nodeId, step.state]),
    [
      ['api-server', 'stopped'],
      ['postgres', 'stopped'],
    ],
  );
});

test('blocks before stopping a process when explicit ownership drifted', async () => {
  let stopCalls = 0;
  const service = createService({
    checks: [check('ready', 'ready')],
    processes: [
      managedProcess({
        environmentInstanceId: 'environment:primary:other',
      }),
    ],
    stopServer: async () => {
      stopCalls += 1;
      return managedProcess({ status: 'stopped' });
    },
  });

  const result = await service.stop('local-stack');

  assert.equal(result.state, 'blocked');
  assert.equal(result.steps[0]?.nodeId, 'api-server');
  assert.equal(result.steps[0]?.state, 'blocked');
  assert.equal(stopCalls, 0);
});

test('does not continue after an unverified Compose stop', async () => {
  const service = createService({
    checks: [check('ready', 'stopped'), check('unknown', 'stopped')],
    processes: [managedProcess({ status: 'stopped' })],
    composeStop: async () => ({
      state: 'stopped-unverified',
      diagnostic: 'runtime ambiguous',
    }),
  });

  const result = await service.stop('local-stack');

  assert.equal(result.state, 'blocked');
  assert.deepEqual(
    result.steps.map((step) => [step.nodeId, step.state]),
    [
      ['api-server', 'already-stopped'],
      ['postgres', 'blocked'],
    ],
  );
});

test('retains environment and health-check nodes as explicit no-op', async () => {
  const value = stack();
  value.nodes = [
    {
      id: 'environment',
      name: 'Environment',
      target: {
        kind: 'environment',
        projectId: 'api',
        environmentInstanceId: 'environment:primary:api',
      },
    },
    {
      id: 'health',
      name: 'Health',
      target: {
        kind: 'health-check',
        projectId: 'api',
        environmentInstanceId: 'environment:primary:api',
        checkId: 'server',
      },
    },
  ];
  value.dependencies = [];
  const valueCheck: StackCheck = {
    stack: value,
    topology: {
      stackId: value.id,
      startOrder: ['environment', 'health'],
      stopOrder: ['health', 'environment'],
    },
    health: {
      stackId: value.id,
      state: 'ready',
      observedAt: '2026-09-29T11:30:00.000Z',
      nodes: value.nodes.map((node) => ({
        nodeId: node.id,
        state: 'ready',
        observedAt: '2026-09-29T11:30:00.000Z',
      })),
    },
  };

  const service = createService({ checks: [valueCheck, valueCheck] });
  const result = await service.stop(value.id);

  assert.equal(result.state, 'completed');
  assert.deepEqual(
    result.steps.map((step) => [step.nodeId, step.state]),
    [
      ['health', 'retained'],
      ['environment', 'retained'],
    ],
  );
});
