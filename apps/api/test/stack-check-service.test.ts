import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  DevelopmentEnvironmentInstance,
  ManagedProcess,
  Stack,
} from '@dev-dashboard/contracts';

import {
  StackCheckService,
  StackCheckServiceError,
} from '../src/services/stack-check-service.js';

function stack(): Stack {
  return {
    id: 'local-stack',
    name: 'Local stack',
    nodes: [
      {
        id: 'api',
        name: 'API',
        target: {
          kind: 'environment',
          projectId: 'api',
          environmentInstanceId: 'environment:primary:api',
        },
      },
      {
        id: 'worker',
        name: 'Worker',
        target: {
          kind: 'process',
          projectId: 'api',
          environmentInstanceId: 'environment:primary:api',
          processId: 'worker-process',
        },
      },
    ],
    dependencies: [{ nodeId: 'worker', dependsOnNodeId: 'api' }],
  };
}

function environment(
  lifecycle: DevelopmentEnvironmentInstance['lifecycle'],
  projectId = 'api',
): DevelopmentEnvironmentInstance {
  return {
    id: 'environment:primary:api',
    projectId,
    source: {
      kind: 'primary',
      path: '/tmp/api',
    },
    runtime: { kind: 'host' },
    lifecycle,
  };
}

function managedProcess(
  status: ManagedProcess['status'],
  overrides: Partial<ManagedProcess> = {},
): ManagedProcess {
  return {
    id: 'worker-process',
    projectId: 'api',
    environmentInstanceId: 'environment:primary:api',
    kind: 'worker',
    status,
    ...overrides,
  };
}

function createService(
  value: Stack,
  options: {
    environment?: DevelopmentEnvironmentInstance | null;
    processes?: ManagedProcess[];
  } = {},
): StackCheckService {
  return new StackCheckService(
    {
      stackStore: {
        findById: (id) => (id === value.id ? value : null),
      },
      developmentEnvironmentInstanceStore: {
        findById: () =>
          options.environment === undefined
            ? environment('ready')
            : options.environment,
      },
      processManager: {
        listProcesses: async () => options.processes ?? [],
      },
    },
    { now: () => new Date('2026-09-28T17:30:00.000Z') },
  );
}

test('returns topology and conservative aggregate health', async () => {
  const value = stack();
  const service = createService(value);

  const result = await service.check(value.id);

  assert.deepEqual(result.topology, {
    stackId: value.id,
    startOrder: ['api', 'worker'],
    stopOrder: ['worker', 'api'],
  });
  assert.equal(result.health.state, 'unknown');
  assert.deepEqual(
    result.health.nodes.map((node) => [node.nodeId, node.state]),
    [
      ['api', 'ready'],
      ['worker', 'unknown'],
    ],
  );
  assert.match(
    result.health.nodes[1]?.diagnostic ?? '',
    /Managed process is not available/,
  );
});

test('maps Environment Instance lifecycle without inventing readiness', async () => {
  const value = stack();
  value.nodes = [value.nodes[0]!];
  value.dependencies = [];

  for (const [lifecycle, expected] of [
    ['ready', 'ready'],
    ['starting', 'starting'],
    ['stopping', 'starting'],
    ['stopped', 'stopped'],
    ['failed', 'failed'],
    ['degraded', 'unknown'],
  ] as const) {
    const service = createService(value, {
      environment: environment(lifecycle),
    });

    assert.equal((await service.check(value.id)).health.state, expected);
  }
});

test('maps reconciled managed process status into Stack health', async () => {
  const value = stack();

  for (const [status, expected] of [
    ['running', 'ready'],
    ['starting', 'starting'],
    ['stopping', 'starting'],
    ['stopped', 'stopped'],
    ['failed', 'failed'],
  ] as const) {
    const service = createService(value, {
      processes: [managedProcess(status)],
    });
    const result = await service.check(value.id);
    assert.equal(
      result.health.nodes.find((node) => node.nodeId === 'worker')?.state,
      expected,
    );
  }
});

test('process node fails closed when process ownership does not match', async () => {
  const value = stack();
  const service = createService(value, {
    processes: [
      managedProcess('running', {
        environmentInstanceId: 'environment:primary:other',
      }),
    ],
  });

  const result = await service.check(value.id);
  const worker = result.health.nodes.find((node) => node.nodeId === 'worker');

  assert.equal(worker?.state, 'unknown');
  assert.match(worker?.diagnostic ?? '', /ownership no longer matches/);
});

test('returns unknown when Environment Instance disappeared or ownership drifted', async () => {
  const value = stack();
  value.nodes = [value.nodes[0]!];
  value.dependencies = [];

  const missing = createService(value, { environment: null });
  assert.equal((await missing.check(value.id)).health.state, 'unknown');

  const drifted = createService(value, {
    environment: environment('ready', 'other-project'),
  });
  const result = await drifted.check(value.id);
  assert.equal(result.health.state, 'unknown');
  assert.match(
    result.health.nodes[0]?.diagnostic ?? '',
    /ownership no longer matches/,
  );
});

test('fails with explicit not found when Stack does not exist', async () => {
  const service = new StackCheckService({
    stackStore: { findById: () => null },
    developmentEnvironmentInstanceStore: { findById: () => null },
    processManager: { listProcesses: async () => [] },
  });

  await assert.rejects(
    () => service.check('missing'),
    (error: unknown) =>
      error instanceof StackCheckServiceError &&
      error.code === 'STACK_NOT_FOUND',
  );
});
