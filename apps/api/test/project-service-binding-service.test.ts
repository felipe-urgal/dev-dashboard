import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  Project,
  ServiceCatalogEntry,
  ServiceCatalogSnapshot,
} from '@dev-dashboard/contracts';

import {
  ProjectServiceBindingService,
  ProjectServiceBindingServiceError,
} from '../src/services/project-service-binding-service.js';
import { ProjectServiceBindingStore } from '../src/store/project-service-binding-store.js';

const NOW = new Date('2026-10-19T15:00:00.000Z');
const projects: Project[] = ['loto', 'gastos'].map((id) => ({
  id,
  workspaceId: 'dev',
  name: id,
  path: '/tmp/' + id,
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: [],
}));
const entries: ServiceCatalogEntry[] = [
  {
    id: 'systemd:system:postgresql.service',
    provider: 'systemd',
    name: 'postgresql.service',
    state: 'running',
    readiness: 'unknown',
    ownership: 'unmanaged',
    scope: 'system',
    ports: [],
    observedAt: NOW.toISOString(),
  },
  {
    id: 'compose:loto:app',
    provider: 'compose',
    name: 'app',
    state: 'running',
    readiness: 'ready',
    ownership: 'confirmed',
    scope: 'environment',
    projectId: 'loto',
    ports: [5200],
    observedAt: NOW.toISOString(),
  },
  {
    id: 'compose:loto:db',
    provider: 'compose',
    name: 'db',
    state: 'running',
    readiness: 'ready',
    ownership: 'confirmed',
    scope: 'environment',
    projectId: 'loto',
    ports: [],
    observedAt: NOW.toISOString(),
  },
  {
    id: 'docker:' + 'b'.repeat(64),
    provider: 'docker',
    name: 'test-postgres',
    state: 'running',
    readiness: 'unknown',
    ownership: 'unmanaged',
    scope: 'host',
    ports: [],
    observedAt: NOW.toISOString(),
  },
];
const environment = (id: string) => ({
  id: 'environment:primary:' + id,
  projectId: id,
  source: { kind: 'primary' as const, path: '/tmp/' + id },
  runtime: { kind: 'host' as const },
  lifecycle: 'ready' as const,
});

function fixture() {
  const store = new ProjectServiceBindingStore();
  const existing = new Map(projects.map((p) => [p.id, p]));
  const observed = [...entries];
  const deps = {
    store,
    projectStore: { findProject: (id: string) => existing.get(id) ?? null },
    environmentStore: {
      findById: (id: string) => {
        const project = existing.get(id.replace('environment:primary:', ''));
        return project ? environment(project.id) : null;
      },
    },
    catalog: {
      inspect: async (): Promise<ServiceCatalogSnapshot> => ({
        status: 'ready',
        observedAt: NOW.toISOString(),
        entries: observed,
        ports: [],
        providers: [],
        truncated: false,
      }),
    },
    composeProvider: {
      inspect: async () => ({
        state: 'available' as const,
        observedAt: NOW.toISOString(),
        config: {
          projectName: 'loto-owned',
          observedAt: NOW.toISOString(),
          declaredPorts: [],
          services: [
            { name: 'app', dependsOn: ['db'], profiles: [], ports: [] },
            { name: 'db', dependsOn: [], profiles: [], ports: [] },
          ],
        },
        runtime: {
          observedAt: NOW.toISOString(),
          services: [
            {
              service: 'app',
              state: 'running' as const,
              health: 'healthy' as const,
              ports: [],
            },
          ],
        },
      }),
    },
    composeOwnership: {
      get: async (project: Project) =>
        project.id !== 'loto'
          ? undefined
          : {
              projectId: project.id,
              projectPath: project.path,
              composeProjectName: 'loto-owned',
              startedAt: NOW.toISOString(),
            },
    },
  };
  return {
    service: new ProjectServiceBindingService(deps, { now: () => NOW }),
    store,
    existing,
    observed,
  };
}

test('preview returns only backend-catalog resources and opt-in Compose dependency evidence', async () => {
  const { service } = fixture();
  const preview = await service.preview('loto');
  assert.equal(preview.partial, false);
  assert.equal(
    preview.candidates.find((c) => c.serviceRef === 'compose:loto:app')
      ?.linkableAsOwned,
    true,
  );
  assert.equal(
    preview.candidates.find(
      (c) => c.serviceRef === 'systemd:system:postgresql.service',
    )?.linkableAsOwned,
    false,
  );
  assert.deepEqual(
    preview.suggestions.map((s) => [s.serviceRef, s.dependsOnServiceRef]),
    [['compose:loto:app', 'compose:loto:db']],
  );
});

test('shared required dependencies do not gain lifecycle ownership', async () => {
  const { service, store } = fixture();
  for (const projectId of ['loto', 'gastos']) {
    await service.save(
      projectId,
      {
        serviceRef: 'systemd:system:postgresql.service',
        relation: 'required',
        requiredForStart: true,
        enabled: true,
        dependencies: [],
      },
      store.revision(projectId),
    );
  }
  const consumer = await service.consumers('systemd:system:postgresql.service');
  assert.equal(consumer.bindings.length, 2);
  assert.equal(
    consumer.bindings.every(
      (binding) => binding.shared && binding.consumerCount === 2,
    ),
    true,
  );
  assert.equal(
    consumer.bindings.some((binding) => binding.relation === 'owned'),
    false,
  );
});

test('refuses an owned relation without matching backend ownership and validates environment', async () => {
  const { service, store } = fixture();
  const input = {
    serviceRef: 'systemd:system:postgresql.service',
    relation: 'owned' as const,
    requiredForStart: true,
    enabled: true,
    dependencies: [],
  };
  await assert.rejects(
    service.save('loto', input, store.revision('loto')),
    (error) =>
      error instanceof ProjectServiceBindingServiceError &&
      error.code === 'CONFLICT',
  );
  await assert.rejects(
    service.save(
      'gastos',
      {
        ...input,
        serviceRef: 'compose:loto:app',
      },
      store.revision('gastos'),
    ),
    (error) =>
      error instanceof ProjectServiceBindingServiceError &&
      error.code === 'CONFLICT',
  );
  await assert.rejects(
    service.preview('loto', 'environment:primary:gastos'),
    (error) =>
      error instanceof ProjectServiceBindingServiceError &&
      error.code === 'NOT_FOUND',
  );
  const created = await service.save(
    'loto',
    {
      ...input,
      serviceRef: 'compose:loto:app',
    },
    store.revision('loto'),
  );
  assert.equal(created.binding.relation, 'owned');
});

test('requires provider evidence for Compose dependency and protects cycles', async () => {
  const { service, store } = fixture();
  await assert.rejects(
    service.save(
      'loto',
      {
        serviceRef: 'compose:loto:app',
        relation: 'owned',
        requiredForStart: true,
        enabled: true,
        dependencies: [
          {
            serviceRef: 'systemd:system:postgresql.service',
            source: 'compose',
          },
        ],
      },
      store.revision('loto'),
    ),
    (error) =>
      error instanceof ProjectServiceBindingServiceError &&
      error.code === 'CONFLICT',
  );

  await service.save(
    'loto',
    {
      serviceRef: 'compose:loto:app',
      relation: 'owned',
      requiredForStart: true,
      enabled: true,
      dependencies: [{ serviceRef: 'compose:loto:db', source: 'compose' }],
    },
    store.revision('loto'),
  );
  await assert.rejects(
    service.save(
      'loto',
      {
        serviceRef: 'compose:loto:db',
        relation: 'owned',
        requiredForStart: true,
        enabled: true,
        dependencies: [{ serviceRef: 'compose:loto:app', source: 'manual' }],
      },
      store.revision('loto'),
    ),
    (error) =>
      error instanceof ProjectServiceBindingServiceError &&
      error.code === 'CONFLICT',
  );
});

test('resource disappearance becomes stale; removed project becomes orphaned', async () => {
  const { service, store, existing, observed } = fixture();
  await service.save(
    'gastos',
    {
      serviceRef: 'docker:' + 'b'.repeat(64),
      relation: 'observed',
      requiredForStart: false,
      enabled: true,
      dependencies: [],
    },
    store.revision('gastos'),
  );
  observed.splice(
    observed.findIndex((entry) => entry.provider === 'docker'),
    1,
  );
  const response = await service.list('gastos');
  assert.equal(response.bindings[0]?.availability, 'stale');
  existing.delete('gastos');
  const consumers = await service.consumers('docker:' + 'b'.repeat(64));
  assert.equal(consumers.bindings[0]?.availability, 'orphaned');
});
