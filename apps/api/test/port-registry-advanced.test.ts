import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { PortRegistryConfiguration } from '@dev-dashboard/contracts';

import { PortInspectorService } from '../src/services/port-inspector-service.js';
import {
  exportPortRegistryConfiguration,
  importPortRegistryConfiguration,
  PortRegistryConfigurationError,
} from '../src/services/port-registry-configuration.js';
import {
  declaredPortsFromResolvedCompose,
  PortAllocationLeaseRegistry,
  reconcilePorts,
} from '../src/services/port-registry-service.js';

test('Compose resolvido fornece declarations canônicas sem parser YAML no Registry', () => {
  const declared = declaredPortsFromResolvedCompose('home-music', [
    { service: 'web', publishedPort: 3_000 },
    { service: 'postgres', publishedPort: 5_432 },
    { service: 'web', publishedPort: 3_000 },
    { service: '', publishedPort: 9_999 },
    { service: 'invalid', publishedPort: 70_000 },
  ]);

  assert.deepEqual(declared, [
    {
      projectId: 'home-music',
      port: 3_000,
      role: 'web',
      source: 'compose',
      confidence: 'certain',
    },
    {
      projectId: 'home-music',
      port: 5_432,
      role: 'postgres',
      source: 'compose',
      confidence: 'certain',
    },
  ]);

  const reconciliation = reconcilePorts({
    reserved: [
      {
        port: 5_432,
        scope: 'infrastructure',
        owner: 'shared-postgres',
      },
    ],
    declared,
  });
  assert.equal(
    reconciliation.entries.find((entry) => entry.port === 5_432)?.state,
    'reserved-by-other',
  );
});

test('Inspector trata porta livre reservada por outro owner como conflito e sugere alternativa', async () => {
  const inspection = await new PortInspectorService({
    platform: 'linux',
    runSs: async () => '',
    getUid: () => 1_000,
  }).inspect({
    expectedPorts: [
      {
        port: 5_173,
        projectId: 'home-music',
        projectName: 'Home Music',
        service: 'server',
      },
    ],
    reservedPorts: [
      {
        port: 5_173,
        scope: 'infrastructure',
        owner: 'shared-vite',
      },
    ],
  });

  assert.equal(inspection.entries[0]?.state, 'available');
  assert.equal(inspection.entries[0]?.conflict, true);
  assert.equal(inspection.entries[0]?.suggestedPort, 5_174);
});

test('allocator com lease não entrega a mesma porta a consumidores locais concorrentes', () => {
  const registry = new PortAllocationLeaseRegistry();
  const first = registry.reserve(
    {},
    {
      leaseId: 'worktree-a:web',
      projectId: 'home-music/worktree-a',
      role: 'web',
      preferredPort: 5_173,
      maxPort: 5_175,
    },
  );
  const second = registry.reserve(
    {},
    {
      leaseId: 'worktree-b:web',
      projectId: 'home-music/worktree-b',
      role: 'web',
      preferredPort: 5_173,
      maxPort: 5_175,
    },
  );

  assert.equal(first?.port, 5_173);
  assert.equal(second?.port, 5_174);
  assert.notEqual(first?.port, second?.port);
});

test('lease é idempotente por identidade e pode ser liberado pelo lifecycle consumidor', () => {
  const registry = new PortAllocationLeaseRegistry();
  const request = {
    leaseId: 'stack-42:api',
    projectId: 'stack-42',
    role: 'api',
    preferredPort: 4_000,
    maxPort: 4_001,
  } as const;

  const first = registry.reserve({}, request);
  const repeated = registry.reserve(
    { observed: [{ port: 4_000, owner: { kind: 'unknown' } }] },
    request,
  );
  assert.deepEqual(repeated, first);
  assert.equal(registry.release(request.leaseId), true);

  const afterRelease = registry.reserve(
    { observed: [{ port: 4_000, owner: { kind: 'unknown' } }] },
    request,
  );
  assert.equal(afterRelease?.port, 4_001);
});

test('leaseId não pode ser reutilizado por outro owner/role', () => {
  const registry = new PortAllocationLeaseRegistry();
  assert.ok(
    registry.reserve(
      {},
      {
        leaseId: 'environment-1:web',
        projectId: 'project-a',
        role: 'web',
        preferredPort: 3_000,
      },
    ),
  );
  assert.equal(
    registry.reserve(
      {},
      {
        leaseId: 'environment-1:web',
        projectId: 'project-b',
        role: 'web',
        preferredPort: 3_001,
      },
    ),
    null,
  );
});

test('configuração do Registry faz round-trip determinístico com ignores do workspace', () => {
  const configuration: PortRegistryConfiguration = {
    version: 1,
    reserved: [
      {
        port: 5_432,
        scope: 'infrastructure',
        owner: 'postgres-local',
        description: 'Postgres compartilhado',
      },
    ],
    declared: [
      {
        projectId: 'home-music',
        port: 5_173,
        role: 'web',
        source: 'config',
        confidence: 'certain',
      },
    ],
    ignoredProjectPaths: ['vendor/legacy', 'tmp/generated', 'vendor/legacy'],
  };

  const exported = exportPortRegistryConfiguration(configuration);
  const imported = importPortRegistryConfiguration(exported);

  assert.deepEqual(imported, {
    ...configuration,
    ignoredProjectPaths: ['tmp/generated', 'vendor/legacy'],
  });
  assert.equal(exportPortRegistryConfiguration(imported), exported);
});

test('import rejeita schema/version/porta inválidos sem aceitar campos como evidência válida', () => {
  assert.throws(
    () =>
      importPortRegistryConfiguration(
        JSON.stringify({ version: 2, reserved: [], declared: [] }),
      ),
    PortRegistryConfigurationError,
  );
  assert.throws(
    () =>
      importPortRegistryConfiguration(
        JSON.stringify({
          version: 1,
          reserved: [{ port: 70_000, scope: 'user' }],
          declared: [],
        }),
      ),
    /porta válida/,
  );
});
