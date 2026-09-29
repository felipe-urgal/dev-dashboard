import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  DevelopmentEnvironmentInstance,
  ManagedProcess,
  Project,
  ProjectServerHealth,
  StackHealthCheckTarget,
} from '@dev-dashboard/contracts';

import { StackHealthCheckAdapter } from '../src/services/stack-health-check-adapter.js';

const observedAt = '2026-09-29T10:30:00.000Z';

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

function environment(): DevelopmentEnvironmentInstance {
  return {
    id: 'environment:primary:api',
    projectId: 'api',
    source: { kind: 'primary', path: '/tmp/api' },
    runtime: { kind: 'host' },
    lifecycle: 'ready',
  };
}

function target(
  overrides: Partial<StackHealthCheckTarget> = {},
): StackHealthCheckTarget {
  return {
    kind: 'health-check',
    projectId: 'api',
    environmentInstanceId: 'environment:primary:api',
    checkId: 'server',
    ...overrides,
  };
}

function process(overrides: Partial<ManagedProcess> = {}): ManagedProcess {
  return {
    id: 'server:api',
    projectId: 'api',
    environmentInstanceId: 'environment:primary:api',
    kind: 'server',
    status: 'running',
    port: 4343,
    ...overrides,
  };
}

function health(status: ProjectServerHealth['status']): ProjectServerHealth {
  return {
    projectId: 'api',
    path: '/health',
    pathSource: 'configured',
    status,
    checkedAt: observedAt,
  };
}

function adapter(
  options: {
    environment?: DevelopmentEnvironmentInstance | null;
    process?: ManagedProcess | null;
    health?: ProjectServerHealth;
    healthCheckPath?: string;
  } = {},
): StackHealthCheckAdapter {
  const value = project();
  return new StackHealthCheckAdapter({
    projectStore: {
      findProject: (id) => (id === value.id ? value : null),
    },
    developmentEnvironmentInstanceStore: {
      findById: () =>
        options.environment === undefined ? environment() : options.environment,
    },
    processManager: {
      getServerProcess: async () =>
        options.process === undefined ? process() : options.process,
    },
    serverSettingsRepository: {
      find: async () => ({
        projectId: value.id,
        ...(options.settingsPort === undefined
          ? { port: 4343 }
          : options.settingsPort === null
            ? {}
            : { port: options.settingsPort }),
        ...(options.healthCheckPath === undefined
          ? { healthCheckPath: '/health' }
          : options.healthCheckPath
            ? { healthCheckPath: options.healthCheckPath }
            : {}),
      }),
    },
    serverHealthCheckService: {
      check: async () => options.health ?? health('healthy'),
    },
  });
}

test('marks known server health check as ready only with healthy evidence', async () => {
  const result = await adapter().observe('api-health', target(), observedAt);

  assert.equal(result.state, 'ready');
  assert.equal(result.diagnostic, undefined);
});

test('maps degraded and unavailable health conservatively', async () => {
  const degraded = await adapter({ health: health('degraded') }).observe(
    'api-health',
    target(),
    observedAt,
  );
  assert.equal(degraded.state, 'unknown');

  const unavailable = await adapter({ health: health('unavailable') }).observe(
    'api-health',
    target(),
    observedAt,
  );
  assert.equal(unavailable.state, 'failed');
});

test('fails closed for unknown check id or missing explicit ownership', async () => {
  const unknownCheck = await adapter().observe(
    'api-health',
    target({ checkId: 'custom' }),
    observedAt,
  );
  assert.equal(unknownCheck.state, 'unknown');

  const targetWithoutEnvironment = target();
  delete targetWithoutEnvironment.environmentInstanceId;
  const missingEnvironment = await adapter().observe(
    'api-health',
    targetWithoutEnvironment,
    observedAt,
  );
  assert.equal(missingEnvironment.state, 'unknown');

  const missingProcess = await adapter({ process: null }).observe(
    'api-health',
    target(),
    observedAt,
  );
  assert.equal(missingProcess.state, 'unknown');
});

test('requires configured health path and a known port', async () => {
  const noPath = await adapter({ healthCheckPath: '' }).observe(
    'api-health',
    target(),
    observedAt,
  );
  assert.equal(noPath.state, 'unknown');

  const processWithoutPort = process();
  delete processWithoutPort.port;
  const noPort = await adapter({
    process: processWithoutPort,
    settingsPort: null,
    healthCheckPath: '/health',
  }).observe('api-health', target(), observedAt);

  assert.equal(noPort.state, 'unknown');
});
