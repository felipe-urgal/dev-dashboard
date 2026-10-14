import assert from 'node:assert/strict';
import test from 'node:test';

import type { Stack } from '@dev-dashboard/contracts';

import { stackRevision } from '../src/services/stack-revision.js';

function definition(): Stack {
  return {
    id: 'app',
    name: 'App',
    nodes: [
      {
        id: 'web',
        name: 'Web',
        target: {
          kind: 'compose-service',
          projectId: 'p',
          environmentInstanceId: 'env',
          service: 'web',
        },
      },
      {
        id: 'db',
        name: 'Database',
        target: {
          kind: 'compose-service',
          projectId: 'p',
          environmentInstanceId: 'env',
          service: 'db',
        },
      },
    ],
    dependencies: [{ nodeId: 'web', dependsOnNodeId: 'db' }],
  };
}

test('revision is stable across node and object key ordering', () => {
  const stack = definition();
  const reordered = {
    ...stack,
    dependencies: [...stack.dependencies].reverse(),
    nodes: [...stack.nodes].reverse().map((node) => ({
      name: node.name,
      id: node.id,
      target: { ...node.target },
    })),
  } as Stack;
  assert.equal(stackRevision(stack), stackRevision(reordered));
  assert.match(stackRevision(stack), /^[a-f0-9]{64}$/);
});

test('revision changes when a node, dependency or target changes', () => {
  const original = stackRevision(definition());
  const renamed = definition();
  renamed.nodes[0]!.name = 'Other';
  assert.notEqual(stackRevision(renamed), original);

  const dependency = definition();
  dependency.dependencies = [];
  assert.notEqual(stackRevision(dependency), original);

  const target = definition();
  target.nodes[0]!.target.projectId = 'other-project';
  assert.notEqual(stackRevision(target), original);
});
