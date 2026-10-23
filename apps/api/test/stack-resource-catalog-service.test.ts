import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { StackResourceCatalogService } from '../src/services/stack-resource-catalog-service.js';

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

test('catalog exposes only backend-resolved targets, without paths or commands', async () => {
  const service = new StackResourceCatalogService({
    projectStore: { findProject: (id) => (id === 'api' ? project : null) },
    environments: {
      list: () => [{
        id: 'environment:primary:api',
        projectId: 'api',
        source: { kind: 'primary', path: '/tmp/api' },
        runtime: { kind: 'host' },
        lifecycle: 'ready',
      }],
      resolveForProject: () => ({
        environmentInstanceId: 'environment:primary:api',
        cwd: '/tmp/api',
        runtime: 'host',
      }),
    },
    processes: {
      listProcesses: async () => [{
        id: 'owned-process',
        projectId: 'api',
        environmentInstanceId: 'environment:primary:api',
        kind: 'server',
        status: 'running',
      }, {
        id: 'foreign-process',
        projectId: 'other',
        environmentInstanceId: 'environment:primary:api',
        kind: 'worker',
        status: 'running',
      }],
    },
    ownership: {
      get: async () => ({
        projectId: 'api',
        projectPath: '/tmp/api',
        composeProjectName: 'owned-compose',
        startedAt: new Date().toISOString(),
      }),
    },
    compose: {
      inspect: async () => ({
        state: 'available',
        observedAt: new Date().toISOString(),
        config: {
          projectName: 'owned-compose',
          observedAt: new Date().toISOString(),
          services: [{ name: 'postgres', profiles: [], dependsOn: [], ports: [] }],
          declaredPorts: [],
        },
      }),
    },
  } as unknown as ConstructorParameters<typeof StackResourceCatalogService>[0]);

  const resources = await service.list();
  assert.deepEqual(
    resources.map((resource) => resource.target.kind).sort(),
    ['compose-service', 'environment', 'health-check', 'process'],
  );
  assert.equal(resources.some((r) => JSON.stringify(r).includes('foreign-process')), false);
  assert.equal(resources.some((r) => JSON.stringify(r).includes('/tmp/')), false);
  assert.equal(resources.some((r) => r.target.kind === 'compose-service' && r.target.service === 'postgres'), true);
});

test('catalog does not offer Compose services with incompatible owner', async () => {
  const service = new StackResourceCatalogService({
    projectStore: { findProject: () => project },
    environments: {
      list: () => [{
        id: 'environment:primary:api',
        projectId: 'api',
        source: { kind: 'primary', path: '/tmp/api' },
        runtime: { kind: 'host' },
        lifecycle: 'ready',
      }],
      resolveForProject: () => ({
        environmentInstanceId: 'environment:primary:api',
        cwd: '/tmp/api',
        runtime: 'host',
      }),
    },
    processes: { listProcesses: async () => [] },
    ownership: { get: async () => ({ composeProjectName: 'previous-owner' }) },
    compose: {
      inspect: async () => ({
        config: { projectName: 'new-owner', services: [{ name: 'db' }] },
      }),
    },
  } as unknown as ConstructorParameters<typeof StackResourceCatalogService>[0]);
  const resources = await service.list();
  assert.equal(resources.some((resource) => resource.target.kind === 'compose-service'), false);
});
