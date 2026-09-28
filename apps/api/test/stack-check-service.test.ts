import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  DevelopmentEnvironmentInstance,
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
          processId: 'worker',
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

test('returns topology and conservative aggregate health', () => {
  const value = stack();
  const service = new StackCheckService(
    {
      stackStore: {
        findById: (id) => (id === value.id ? value : null),
      },
      developmentEnvironmentInstanceStore: {
        findById: () => environment('ready'),
      },
    },
    { now: () => new Date('2026-09-28T17:30:00.000Z') },
  );

  const result = service.check(value.id);

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
    /No read-only health adapter/,
  );
});

test('maps Environment Instance lifecycle without inventing readiness', () => {
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
    const service = new StackCheckService({
      stackStore: { findById: () => value },
      developmentEnvironmentInstanceStore: {
        findById: () => environment(lifecycle),
      },
    });

    assert.equal(service.check(value.id).health.state, expected);
  }
});

test('returns unknown when Environment Instance disappeared or ownership drifted', () => {
  const value = stack();
  value.nodes = [value.nodes[0]!];
  value.dependencies = [];

  const missing = new StackCheckService({
    stackStore: { findById: () => value },
    developmentEnvironmentInstanceStore: { findById: () => null },
  });
  assert.equal(missing.check(value.id).health.state, 'unknown');

  const drifted = new StackCheckService({
    stackStore: { findById: () => value },
    developmentEnvironmentInstanceStore: {
      findById: () => environment('ready', 'other-project'),
    },
  });
  const result = drifted.check(value.id);
  assert.equal(result.health.state, 'unknown');
  assert.match(
    result.health.nodes[0]?.diagnostic ?? '',
    /ownership no longer matches/,
  );
});

test('fails with explicit not found when Stack does not exist', () => {
  const service = new StackCheckService({
    stackStore: { findById: () => null },
    developmentEnvironmentInstanceStore: { findById: () => null },
  });

  assert.throws(
    () => service.check('missing'),
    (error: unknown) =>
      error instanceof StackCheckServiceError &&
      error.code === 'STACK_NOT_FOUND',
  );
});
