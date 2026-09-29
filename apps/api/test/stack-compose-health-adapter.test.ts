import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  Project,
  StackComposeServiceTarget,
} from '@dev-dashboard/contracts';

import { StackComposeHealthAdapter } from '../src/services/stack-compose-health-adapter.js';
import type { DockerComposeInspection } from '../src/services/docker-compose-provider.js';

const observedAt = '2026-09-28T18:00:00.000Z';

function project(): Project {
  return {
    id: 'api',
    workspaceId: 'workspace-a',
    name: 'API',
    path: '/tmp/api',
    type: 'node',
    source: 'workspace',
    enabled: true,
    capabilities: ['server'],
  };
}

function target(): StackComposeServiceTarget {
  return {
    kind: 'compose-service',
    projectId: 'api',
    environmentInstanceId: 'environment:primary:api',
    service: 'postgres',
  };
}

function inspection(
  state: 'running' | 'restarting' | 'created' | 'paused' | 'dead' | 'exited',
  health: 'healthy' | 'unhealthy' | 'starting' | 'none' | 'unknown',
  exitCode?: number,
): DockerComposeInspection {
  return {
    state: 'available',
    observedAt,
    config: {
      projectName: 'api-compose',
      observedAt,
      services: [
        {
          name: 'postgres',
          profiles: [],
          dependsOn: [],
          ports: [],
        },
      ],
      declaredPorts: [],
    },
    runtime: {
      observedAt,
      services: [
        {
          service: 'postgres',
          state,
          health,
          ...(exitCode === undefined ? {} : { exitCode }),
          ports: [],
        },
      ],
    },
  };
}

function adapter(
  options: {
    ownership?: { composeProjectName: string } | null;
    inspection?: DockerComposeInspection;
  } = {},
): StackComposeHealthAdapter {
  const value = project();
  return new StackComposeHealthAdapter({
    projectStore: {
      findProject: (id) => (id === value.id ? value : null),
    },
    developmentEnvironmentInstanceStore: {
      resolveForProject: (projectId, environmentInstanceId) =>
        projectId === value.id &&
        environmentInstanceId === 'environment:primary:api'
          ? {
              projectId: value.id,
              environmentInstanceId: 'environment:primary:api',
              cwd: value.path,
              runtime: 'host',
            }
          : null,
    },
    ownershipStore: {
      get: async () =>
        options.ownership === undefined
          ? {
              projectId: value.id,
              projectPath: value.path,
              composeProjectName: 'api-compose',
              startedAt: observedAt,
            }
          : options.ownership
            ? {
                projectId: value.id,
                projectPath: value.path,
                composeProjectName: options.ownership.composeProjectName,
                startedAt: observedAt,
              }
            : undefined,
    },
    provider: {
      inspect: async () =>
        options.inspection ?? inspection('running', 'healthy'),
    },
  });
}

test('marks an owned running healthy Compose service as ready', async () => {
  const result = await adapter().observe('postgres', target(), observedAt);

  assert.equal(result.state, 'ready');
  assert.equal(result.diagnostic, undefined);
});

test('does not promote running Compose service without healthy evidence', async () => {
  for (const health of ['none', 'unknown'] as const) {
    const result = await adapter({
      inspection: inspection('running', health),
    }).observe('postgres', target(), observedAt);

    assert.equal(result.state, 'unknown');
    assert.match(result.diagnostic ?? '', /readiness cannot be proven/);
  }

  const unhealthy = await adapter({
    inspection: inspection('running', 'unhealthy'),
  }).observe('postgres', target(), observedAt);
  assert.equal(unhealthy.state, 'failed');

  const starting = await adapter({
    inspection: inspection('running', 'starting'),
  }).observe('postgres', target(), observedAt);
  assert.equal(starting.state, 'starting');
});

test('maps explicit Compose runtime terminal states conservatively', async () => {
  const cases = [
    [inspection('restarting', 'none'), 'starting'],
    [inspection('created', 'none'), 'stopped'],
    [inspection('paused', 'none'), 'blocked'],
    [inspection('dead', 'none'), 'failed'],
    [inspection('exited', 'none', 0), 'stopped'],
    [inspection('exited', 'none', 2), 'failed'],
  ] as const;

  for (const [runtime, expected] of cases) {
    const result = await adapter({ inspection: runtime }).observe(
      'postgres',
      target(),
      observedAt,
    );
    assert.equal(result.state, expected);
  }
});

test('fails closed when Compose ownership or runtime identity cannot be proven', async () => {
  const missingOwnership = await adapter({ ownership: null }).observe(
    'postgres',
    target(),
    observedAt,
  );
  assert.equal(missingOwnership.state, 'unknown');
  assert.match(missingOwnership.diagnostic ?? '', /ownership is not proven/);

  const mismatch = await adapter({
    ownership: { composeProjectName: 'other-compose' },
  }).observe('postgres', target(), observedAt);
  assert.equal(mismatch.state, 'unknown');
  assert.match(mismatch.diagnostic ?? '', /does not match persisted ownership/);

  const noRuntime = inspection('running', 'healthy');
  noRuntime.runtime = { observedAt, services: [] };
  const missingRuntimeService = await adapter({
    inspection: noRuntime,
  }).observe('postgres', target(), observedAt);
  assert.equal(missingRuntimeService.state, 'unknown');
  assert.match(missingRuntimeService.diagnostic ?? '', /no runtime evidence/);
});
