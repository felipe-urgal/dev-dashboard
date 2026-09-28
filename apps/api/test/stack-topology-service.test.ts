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
  const input = stack();

  const healthy = service.health(
    input,
    input.nodes.map((node) => ({
      nodeId: node.id,
      state: 'ready' as const,
      observedAt,
    })),
    observedAt,
  );
  assert.equal(healthy.state, 'ready');

  const mixed = service.health(
    input,
    input.nodes.map((node) => ({
      nodeId: node.id,
      state: node.id === 'web' ? ('stopped' as const) : ('ready' as const),
      observedAt,
    })),
    observedAt,
  );
  assert.equal(mixed.state, 'unknown');

  const failed = service.health(
    input,
    input.nodes.map((node) => ({
      nodeId: node.id,
      state: node.id === 'web' ? ('failed' as const) : ('ready' as const),
      observedAt,
    })),
    observedAt,
  );
  assert.equal(failed.state, 'failed');
});

test('missing health evidence is normalized to unknown instead of false ready', () => {
  const observedAt = '2026-09-21T22:30:00.000Z';
  const health = new StackTopologyService().health(
    stack(),
    [
      { nodeId: 'postgres', state: 'ready', observedAt },
      { nodeId: 'api', state: 'ready', observedAt },
    ],
    observedAt,
  );

  assert.equal(health.state, 'unknown');
  assert.deepEqual(
    health.nodes.filter((node) => node.state === 'unknown'),
    [
      {
        nodeId: 'web',
        state: 'unknown',
        observedAt,
        diagnostic: 'No health evidence is available for this stack node.',
      },
      {
        nodeId: 'worker',
        state: 'unknown',
        observedAt,
        diagnostic: 'No health evidence is available for this stack node.',
      },
    ],
  );
});

test('health evidence rejects unknown and duplicate node ids', () => {
  const service = new StackTopologyService();
  const observedAt = '2026-09-21T22:30:00.000Z';
  const input = stack();

  assert.throws(
    () =>
      service.health(
        input,
        [{ nodeId: 'missing', state: 'ready', observedAt }],
        observedAt,
      ),
    (error: unknown) =>
      error instanceof StackTopologyServiceError &&
      error.code === 'STACK_INVALID',
  );

  assert.throws(
    () =>
      service.health(
        input,
        [
          { nodeId: 'api', state: 'ready', observedAt },
          { nodeId: 'api', state: 'ready', observedAt },
        ],
        observedAt,
      ),
    (error: unknown) =>
      error instanceof StackTopologyServiceError &&
      error.code === 'STACK_INVALID',
  );
});
