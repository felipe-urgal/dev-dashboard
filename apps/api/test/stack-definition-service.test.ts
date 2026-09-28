import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  DevelopmentEnvironmentInstance,
  Project,
  Stack,
} from '@dev-dashboard/contracts';

import {
  StackDefinitionService,
  StackDefinitionServiceError,
} from '../src/services/stack-definition-service.js';

function stack(
  projectId = 'api',
  environmentInstanceId = 'environment:primary:api',
): Stack {
  return {
    id: 'local-stack',
    name: 'Local stack',
    nodes: [
      {
        id: 'api',
        name: 'API',
        target: {
          kind: 'environment',
          projectId,
          environmentInstanceId,
        },
      },
    ],
    dependencies: [],
  };
}

function project(id: string): Project {
  return {
    id,
    workspaceId: 'workspace-a',
    name: id,
    path: `/tmp/${id}`,
    type: 'node',
    source: 'workspace',
    enabled: true,
    capabilities: ['server'],
  };
}

function environment(
  id: string,
  projectId: string,
): DevelopmentEnvironmentInstance {
  return {
    id,
    projectId,
    source: {
      kind: 'primary',
      path: `/tmp/${projectId}`,
    },
    runtime: { kind: 'host' },
    lifecycle: 'ready',
  };
}

test('persists only when project and environment ownership are proven', () => {
  const saved: Stack[] = [];
  const service = new StackDefinitionService({
    stackStore: {
      list: () => [...saved],
      findById: (id) => saved.find((item) => item.id === id) ?? null,
      save: (value) => {
        saved.push(value);
        return value;
      },
      delete: () => false,
    },
    projectStore: {
      findProject: (id) => (id === 'api' ? project('api') : null),
    },
    developmentEnvironmentInstanceStore: {
      findById: (id) =>
        id === 'environment:primary:api' ? environment(id, 'api') : null,
    },
  });

  const value = stack();
  assert.deepEqual(service.save(value), value);
  assert.deepEqual(saved, [value]);
});

test('fails closed when a node references an unknown project', () => {
  let persisted = false;
  const service = new StackDefinitionService({
    stackStore: {
      list: () => [],
      findById: () => null,
      save: (value) => {
        persisted = true;
        return value;
      },
      delete: () => false,
    },
    projectStore: { findProject: () => null },
    developmentEnvironmentInstanceStore: { findById: () => null },
  });

  assert.throws(
    () => service.save(stack('missing')),
    (error: unknown) =>
      error instanceof StackDefinitionServiceError &&
      error.code === 'STACK_PROJECT_NOT_FOUND',
  );
  assert.equal(persisted, false);
});

test('fails closed when an environment instance does not exist', () => {
  const service = new StackDefinitionService({
    stackStore: {
      list: () => [],
      findById: () => null,
      save: (value) => value,
      delete: () => false,
    },
    projectStore: { findProject: (id) => project(id) },
    developmentEnvironmentInstanceStore: { findById: () => null },
  });

  assert.throws(
    () => service.save(stack()),
    (error: unknown) =>
      error instanceof StackDefinitionServiceError &&
      error.code === 'STACK_ENVIRONMENT_NOT_FOUND',
  );
});

test('rejects cross-project environment ownership', () => {
  const service = new StackDefinitionService({
    stackStore: {
      list: () => [],
      findById: () => null,
      save: (value) => value,
      delete: () => false,
    },
    projectStore: { findProject: (id) => project(id) },
    developmentEnvironmentInstanceStore: {
      findById: (id) => environment(id, 'worker'),
    },
  });

  assert.throws(
    () => service.save(stack()),
    (error: unknown) =>
      error instanceof StackDefinitionServiceError &&
      error.code === 'STACK_ENVIRONMENT_PROJECT_MISMATCH',
  );
});

test('health-check without environment still requires an existing project', () => {
  const value = stack();
  value.nodes = [
    {
      id: 'api-health',
      name: 'API health',
      target: {
        kind: 'health-check',
        projectId: 'api',
        checkId: 'server',
      },
    },
  ];

  const service = new StackDefinitionService({
    stackStore: {
      list: () => [],
      findById: () => null,
      save: (candidate) => candidate,
      delete: () => false,
    },
    projectStore: { findProject: (id) => project(id) },
    developmentEnvironmentInstanceStore: { findById: () => null },
  });

  assert.deepEqual(service.save(value), value);
});
