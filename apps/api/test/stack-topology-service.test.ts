import assert from 'node:assert/strict';
import test from 'node:test';

import type { Stack } from '@dev-dashboard/contracts';

import {
  StackTopologyService,
  StackTopologyServiceError,
} from '../src/services/stack-topology-service.js';

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
        id: 'api',
        name: 'API',
        target: {
          kind: 'environment',
          projectId: 'api',
          environmentInstanceId: 'environment:primary:api',
        },
      },
      {
        id: 'web',
        name: 'Web',
        target: {
          kind: 'environment',
          projectId: 'web',
          environmentInstanceId: 'environment:primary:web',
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
    dependencies: [
      { nodeId: 'api', dependsOnNodeId: 'postgres' },
      { nodeId: 'web', dependsOnNodeId: 'api' },
      { nodeId: 'worker', dependsOnNodeId: 'api' },
    ],
  };
}

test('creates deterministic start and reverse stop order', () => {
  const plan = new StackTopologyService().plan(stack());

  assert.deepEqual(plan.startOrder, ['postgres', 'api', 'web', 'worker']);
  assert.deepEqual(plan.stopOrder, ['worker', 'web', 'api', 'postgres']);
});

test('independent nodes use deterministic id ordering without inventing dependencies', () => {
  const input = stack();
  input.dependencies = [];
  input.nodes = [
    input.nodes[2]!,
    input.nodes[0]!,
    input.nodes[3]!,
    input.nodes[1]!,
  ];

  const plan = new StackTopologyService().plan(input);

  assert.deepEqual(plan.startOrder, ['api', 'postgres', 'web', 'worker']);
});

test('unknown dependency target fails closed', () => {
  const input = stack();
  input.dependencies.push({
    nodeId: 'web',
    dependsOnNodeId: 'missing',
  });

  assert.throws(
    () => new StackTopologyService().plan(input),
    (error: unknown) =>
      error instanceof StackTopologyServiceError &&
      error.code === 'STACK_INVALID',
  );
});

test('dependency cycle is rejected instead of producing a partial order', () => {
  const input = stack();
  input.dependencies.push({
    nodeId: 'postgres',
    dependsOnNodeId: 'web',
  });

  assert.throws(
    () => new StackTopologyService().plan(input),
    (error: unknown) =>
      error instanceof StackTopologyServiceError &&
      error.code === 'STACK_DEPENDENCY_CYCLE',
  );
});

test('health aggregation never promotes mixed or unknown evidence to ready', () => {
  const service = new StackTopologyService();
  const observedAt = '2026-09-21T22:30:00.000Z';

  const healthy = service.health(
    'local-stack',
    [
      { nodeId: 'api', state: 'ready', observedAt },
      { nodeId: 'web', state: 'ready', observedAt },
    ],
    observedAt,
  );
  assert.equal(healthy.state, 'ready');

  const mixed = service.health(
    'local-stack',
    [
      { nodeId: 'api', state: 'ready', observedAt },
      { nodeId: 'web', state: 'stopped', observedAt },
    ],
    observedAt,
  );
  assert.equal(mixed.state, 'unknown');

  const failed = service.health(
    'local-stack',
    [
      { nodeId: 'api', state: 'ready', observedAt },
      { nodeId: 'web', state: 'failed', observedAt },
    ],
    observedAt,
  );
  assert.equal(failed.state, 'failed');
});
