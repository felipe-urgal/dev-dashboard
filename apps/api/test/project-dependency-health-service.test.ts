import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import type { NodeDependencyInventory } from '../src/services/node-dependency-inventory-service.js';
import type { NodeRuntimeDiscovery } from '../src/services/node-runtime-discovery-service.js';
import type { NpmDependencyMetadata } from '../src/services/npm-dependency-metadata-service.js';
import type { OsvDependencyAdvisoryEvidence } from '../src/services/osv-dependency-advisory-service.js';
import { ProjectDependencyHealthService } from '../src/services/project-dependency-health-service.js';

const NOW = new Date('2026-09-19T17:40:00.000Z');

const project: Project = {
  id: 'project-1',
  name: 'Projeto',
  path: '/workspace/project-1',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: [],
};

const inventory: NodeDependencyInventory = {
  status: 'ready',
  projectId: project.id,
  packageManager: 'npm',
  observedAt: '2026-09-19T17:39:00.000Z',
  lockfile: 'present',
  lockfileVersion: 3,
  dependencies: [
    {
      name: 'fastify',
      kind: 'dependency',
      declaredRange: '^5.0.0',
      resolution: 'resolved',
      resolvedVersion: '5.6.0',
    },
    {
      name: 'typescript',
      kind: 'devDependency',
      declaredRange: '^5.9.0',
      resolution: 'unknown',
    },
  ],
  warnings: [],
};

const runtime: NodeRuntimeDiscovery = {
  state: 'declared',
  observedAt: '2026-09-19T17:39:10.000Z',
  declarations: [
    {
      source: '.node-version',
      raw: '22.12.0',
      version: '22.12.0',
    },
  ],
  version: '22.12.0',
};

const metadata: NpmDependencyMetadata[] = [
  {
    name: 'fastify',
    state: 'available',
    source: 'npm-registry',
    observedAt: '2026-09-19T17:39:20.000Z',
    latestVersion: '6.0.0',
    latestNodeEngine: '>=22.0.0',
    runtimeVersion: '22.12.0',
    latestRuntimeCompatibility: 'compatible',
    update: 'major',
  },
  {
    name: 'typescript',
    state: 'available',
    source: 'npm-registry',
    observedAt: '2026-09-19T17:39:20.000Z',
    latestVersion: '5.9.3',
    runtimeVersion: '22.12.0',
    latestRuntimeCompatibility: 'unknown',
    update: 'unknown',
  },
];

const advisories: OsvDependencyAdvisoryEvidence[] = [
  {
    name: 'fastify',
    state: 'available',
    source: 'osv',
    observedAt: '2026-09-19T17:39:30.000Z',
    resolvedVersion: '5.6.0',
    advisories: [],
    complete: true,
  },
  {
    name: 'typescript',
    state: 'unknown-version',
    source: 'osv',
    observedAt: '2026-09-19T17:39:30.000Z',
    advisories: [],
    complete: false,
    diagnostic:
      'A versão resolvida não foi comprovada; advisories não foram consultados.',
  },
];

test('compõe inventário, runtime, metadata e advisories preservando evidência por fonte', async () => {
  let receivedRuntime: string | undefined;
  const service = new ProjectDependencyHealthService({
    now: () => NOW,
    inventoryService: { inspect: async () => inventory },
    runtimeDiscoveryService: { inspect: async () => runtime },
    metadataService: {
      enrich: async (receivedInventory, runtimeVersion) => {
        assert.equal(receivedInventory, inventory);
        receivedRuntime = runtimeVersion;
        return { inventory: receivedInventory, metadata };
      },
    },
    advisoryService: {
      inspect: async (receivedInventory) => {
        assert.equal(receivedInventory, inventory);
        return { inventory: receivedInventory, advisories };
      },
    },
  });

  const snapshot = await service.inspect(project);

  assert.equal(snapshot.generatedAt, NOW.toISOString());
  assert.equal(snapshot.inventory, inventory);
  assert.equal(snapshot.runtime, runtime);
  assert.equal(receivedRuntime, '22.12.0');
  assert.equal(snapshot.metadata, metadata);
  assert.equal(snapshot.advisories, advisories);
});

test('runtime não comprovado nunca é enviado ao metadata provider', async () => {
  let receivedRuntime = 'not-called';
  const missingRuntime: NodeRuntimeDiscovery = {
    state: 'missing',
    observedAt: NOW.toISOString(),
    declarations: [],
  };
  const service = new ProjectDependencyHealthService({
    now: () => NOW,
    inventoryService: { inspect: async () => inventory },
    runtimeDiscoveryService: { inspect: async () => missingRuntime },
    metadataService: {
      enrich: async (receivedInventory, runtimeVersion) => {
        receivedRuntime = runtimeVersion ?? 'undefined';
        return { inventory: receivedInventory, metadata: [] };
      },
    },
    advisoryService: {
      inspect: async (receivedInventory) => ({
        inventory: receivedInventory,
        advisories: [],
      }),
    },
  });

  await service.inspect(project);

  assert.equal(receivedRuntime, 'undefined');
});

test('falha do npm registry é isolada sem apagar inventário, runtime ou OSV', async () => {
  const service = new ProjectDependencyHealthService({
    now: () => NOW,
    inventoryService: { inspect: async () => inventory },
    runtimeDiscoveryService: { inspect: async () => runtime },
    metadataService: {
      enrich: async () => {
        throw new Error('registry failed');
      },
    },
    advisoryService: {
      inspect: async (receivedInventory) => ({
        inventory: receivedInventory,
        advisories,
      }),
    },
  });

  const snapshot = await service.inspect(project);

  assert.equal(snapshot.inventory, inventory);
  assert.equal(snapshot.runtime, runtime);
  assert.equal(snapshot.advisories, advisories);
  assert.deepEqual(
    snapshot.metadata.map((item) => [
      item.name,
      item.state,
      item.runtimeVersion,
      item.update,
    ]),
    [
      ['fastify', 'unavailable', '22.12.0', 'unknown'],
      ['typescript', 'unavailable', '22.12.0', 'unknown'],
    ],
  );
});

test('falha do OSV mantém unresolved como unknown-version e resolved como unavailable', async () => {
  const service = new ProjectDependencyHealthService({
    now: () => NOW,
    inventoryService: { inspect: async () => inventory },
    runtimeDiscoveryService: { inspect: async () => runtime },
    metadataService: {
      enrich: async (receivedInventory) => ({
        inventory: receivedInventory,
        metadata,
      }),
    },
    advisoryService: {
      inspect: async () => {
        throw new Error('osv failed');
      },
    },
  });

  const snapshot = await service.inspect(project);

  assert.deepEqual(
    snapshot.advisories.map((item) => [
      item.name,
      item.state,
      item.resolvedVersion,
      item.complete,
    ]),
    [
      ['fastify', 'unavailable', '5.6.0', false],
      ['typescript', 'unknown-version', undefined, false],
    ],
  );
});

test('falhas locais degradam para estados explícitos e evitam falso snapshot saudável', async () => {
  let externalCalls = 0;
  const service = new ProjectDependencyHealthService({
    now: () => NOW,
    inventoryService: {
      inspect: async () => {
        throw new Error('inventory failed');
      },
    },
    runtimeDiscoveryService: {
      inspect: async () => {
        throw new Error('runtime failed');
      },
    },
    metadataService: {
      enrich: async (receivedInventory) => {
        externalCalls += 1;
        assert.equal(receivedInventory.status, 'unavailable');
        return { inventory: receivedInventory, metadata: [] };
      },
    },
    advisoryService: {
      inspect: async (receivedInventory) => {
        externalCalls += 1;
        assert.equal(receivedInventory.status, 'unavailable');
        return { inventory: receivedInventory, advisories: [] };
      },
    },
  });

  const snapshot = await service.inspect(project);

  assert.equal(snapshot.inventory.status, 'unavailable');
  assert.match(snapshot.inventory.warnings[0] ?? '', /não pôde ser consultado/);
  assert.equal(snapshot.runtime.state, 'invalid');
  assert.match(snapshot.runtime.diagnostic ?? '', /não pôde ser consultada/);
  assert.deepEqual(snapshot.metadata, []);
  assert.deepEqual(snapshot.advisories, []);
  assert.equal(externalCalls, 2);
});
