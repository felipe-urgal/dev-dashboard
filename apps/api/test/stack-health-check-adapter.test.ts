import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  DevelopmentEnvironmentInstance,
  ManagedProcess,
  Project,
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

function adapter(
  options: {
    environment?: DevelopmentEnvironmentInstance | null;
    process?: ManagedProcess | null;
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
  });
}

test(
  'maps server process lifecycle without requiring an HTTP health endpoint',
  async () => {
    const running = await adapter().observe('api-health', target(), observedAt);
    assert.equal(running.state, 'ready');

    const starting = await adapter({
      process: process({ status: 'starting' }),
    }).observe('api-health', target(), observedAt);
    assert.equal(starting.state, 'starting');

    const stopped = await adapter({
      process: process({ status: 'stopped' }),
    }).observe('api-health', target(), observedAt);
    assert.equal(stopped.state, 'stopped');

    const failed = await adapter({
      process: process({ status: 'failed' }),
    }).observe('api-health', target(), observedAt);
    assert.equal(failed.state, 'failed');
    assert.match(failed.diagnostic ?? '', /failed/i);
  },
);

test(
  'fails closed for unknown check id or missing explicit ownership',
  async () => {
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
  },
);

test('rejects process ownership mismatches', async () => {
  const wrongProject = await adapter({
    process: process({ projectId: 'other-project' }),
  }).observe('api-health', target(), observedAt);
  assert.equal(wrongProject.state, 'unknown');

  const wrongEnvironment = await adapter({
    process: process({ environmentInstanceId: 'environment:other' }),
  }).observe('api-health', target(), observedAt);
  assert.equal(wrongEnvironment.state, 'unknown');
});
