import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  HostServiceInventory,
  ManagedProcess,
  Project,
  LocalPortInspection,
} from '@dev-dashboard/contracts';

import { ServiceCatalogService } from '../src/services/service-catalog-service.js';

const NOW = new Date('2026-10-19T15:00:00.000Z');
const project: Project = {
  id: 'loto',
  workspaceId: 'lab',
  name: 'Loto Lab',
  path: '/fake/loto',
  source: 'workspace',
  type: 'node',
  enabled: true,
  capabilities: [],
};
const systemd: HostServiceInventory = {
  status: 'ready',
  observedAt: NOW.toISOString(),
  truncated: false,
  sources: [
    { scope: 'user', status: 'ready' },
    { scope: 'system', status: 'ready' },
  ],
  services: [
    {
      id: 'systemd:system:home-music.service',
      provider: 'systemd',
      scope: 'system',
      name: 'home-music.service',
      state: 'running',
      readiness: 'unknown',
      bootState: 'enabled',
      managed: false,
      observedAt: NOW.toISOString(),
    },
  ],
};
const processes: ManagedProcess[] = [
  {
    id: 'api-loto',
    projectId: 'loto',
    kind: 'server',
    status: 'running',
    port: 5200,
    environmentInstanceId: 'environment:primary:loto',
  },
];
const ports: LocalPortInspection = {
  status: 'ready',
  platform: 'linux',
  inspectedAt: NOW.toISOString(),
  truncated: false,
  entries: [
    {
      port: 5200,
      address: '127.0.0.1',
      scope: 'loopback',
      state: 'occupied',
      conflict: false,
      expected: [],
      managedProcess: {
        id: 'api-loto',
        projectId: 'loto',
        projectName: 'Loto Lab',
        kind: 'server',
        status: 'running',
      },
    },
    {
      port: 8787,
      address: '127.0.0.1',
      scope: 'loopback',
      state: 'occupied',
      conflict: false,
      expected: [],
    },
  ],
};

function createService(
  options: { brokenSystemd?: boolean; noComposeOwner?: boolean } = {},
) {
  return new ServiceCatalogService(
    {
      systemd: {
        inspect: async () => {
          if (options.brokenSystemd) throw new Error('secret systemd error');
          return systemd;
        },
      },
      containers: {
        inspect: async () => ({
          status: 'ready' as const,
          truncated: false,
          containers: [
            {
              id: 'a'.repeat(64),
              name: 'loto-lab-app',
              state: 'running' as const,
            },
            {
              id: 'b'.repeat(64),
              name: 'external-postgres',
              state: 'running' as const,
            },
          ],
        }),
      },
      processManager: { listProcesses: async () => processes },
      portInspector: { inspect: async () => ports },
      projectStore: { listProjects: () => [project] },
      composeOwnership: {
        get: async () =>
          options.noComposeOwner
            ? undefined
            : {
                projectId: 'loto',
                projectPath: project.path,
                composeProjectName: 'loto-stack',
                startedAt: NOW.toISOString(),
              },
      },
      composeProvider: {
        inspect: async () => ({
          state: 'available' as const,
          observedAt: NOW.toISOString(),
          config: {
            projectName: 'loto-stack',
            observedAt: NOW.toISOString(),
            declaredPorts: [],
            services: [{ name: 'app', dependsOn: [], profiles: [], ports: [] }],
          },
          runtime: {
            observedAt: NOW.toISOString(),
            services: [
              {
                service: 'app',
                state: 'running' as const,
                health: 'healthy' as const,
                containerId: 'a'.repeat(64),
                ports: [
                  {
                    targetPort: 3000,
                    publishedPort: 5200,
                    protocol: 'tcp' as const,
                  },
                ],
              },
            ],
          },
        }),
      },
    },
    { now: () => NOW },
  );
}

test('joins trusted Compose ownership and managed processes, never adopts external containers', async () => {
  const snapshot = await createService().inspect();
  assert.equal(snapshot.status, 'ready');
  assert.equal(
    snapshot.entries.some((entry) => entry.id === 'docker:' + 'a'.repeat(64)),
    false,
  );

  const composed = snapshot.entries.find(
    (entry) => entry.id === 'compose:loto:app',
  );
  assert.equal(composed?.readiness, 'ready');
  assert.equal(composed?.ownership, 'confirmed');
  assert.deepEqual(composed?.ports, [5200]);

  const external = snapshot.entries.find(
    (entry) => entry.id === 'docker:' + 'b'.repeat(64),
  );
  assert.equal(external?.ownership, 'unmanaged');
  assert.equal(external?.projectId, undefined);

  const process = snapshot.entries.find(
    (entry) => entry.id === 'process:api-loto',
  );
  assert.deepEqual(process?.ports, [5200]);
  assert.equal(process?.environmentInstanceId, 'environment:primary:loto');

  const system = snapshot.entries.find(
    (entry) => entry.id === 'systemd:system:home-music.service',
  );
  assert.equal(system?.readiness, 'unknown');
  assert.equal(system?.ownership, 'unmanaged');
  assert.equal(system?.ports.length, 0); // 8787 is not an ownership claim.
  assert.equal(snapshot.ports.length, 2);
});

test('without confirmed Compose ownership, all observed containers remain unmanaged', async () => {
  const snapshot = await createService({ noComposeOwner: true }).inspect();
  assert.equal(
    snapshot.entries.some((entry) => entry.provider === 'compose'),
    false,
  );
  assert.equal(
    snapshot.entries.filter((entry) => entry.provider === 'docker').length,
    2,
  );
});

test('provider failure degrades independently and does not leak raw errors', async () => {
  const snapshot = await createService({ brokenSystemd: true }).inspect();
  assert.equal(snapshot.status, 'partial');
  assert.equal(
    snapshot.providers.find((provider) => provider.provider === 'systemd')
      ?.status,
    'unavailable',
  );
  assert.equal(
    snapshot.entries.some((entry) => entry.provider === 'compose'),
    true,
  );
  assert.doesNotMatch(JSON.stringify(snapshot), /secret systemd error/);
});
