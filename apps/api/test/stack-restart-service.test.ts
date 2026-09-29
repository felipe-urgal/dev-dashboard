import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  Project,
  Stack,
  StackCheck,
  StackNodeState,
} from '@dev-dashboard/contracts';

import { StackRestartService } from '../src/services/stack-restart-service.js';

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

function stack(): Stack {
  return {
    id: 'local-stack',
    name: 'Local stack',
    nodes: [
      {
        id: 'postgres',
        name: 'Postgres',
        target: {
          kind: 'compose-service',
          projectId: 'api',
          environmentInstanceId: 'environment:primary:api',
          service: 'postgres',
        },
      },
      {
        id: 'api-server',
        name: 'API server',
        target: {
          kind: 'process',
          projectId: 'api',
          environmentInstanceId: 'environment:primary:api',
          processId: 'server:api',
        },
      },
    ],
    dependencies: [{ nodeId: 'api-server', dependsOnNodeId: 'postgres' }],
  };
}

function check(
  postgres: StackNodeState,
  api: StackNodeState,
): StackCheck {
  const value = stack();
  return {
    stack: value,
    topology: {
      stackId: value.id,
      startOrder: ['postgres', 'api-server'],
      stopOrder: ['api-server', 'postgres'],
    },
    health: {
      stackId: value.id,
      state: 'unknown',
      observedAt: '2026-09-29T12:00:00.000Z',
      nodes: [
        {
          nodeId: 'postgres',
          state: postgres,
          observedAt: '2026-09-29T12:00:00.000Z',
        },
        {
          nodeId: 'api-server',
          state: api,
          observedAt: '2026-09-29T12:00:00.000Z',
        },
      ],
    },
  };
}

function createService(
  checks: StackCheck[],
  restart: (...args: unknown[]) => Promise<unknown>,
): StackRestartService {
  const queue = [...checks];
  return new StackRestartService({
    stackCheckService: {
      check: async () => queue.shift() ?? checks[checks.length - 1]!,
    },
    projectStore: {
      findProject: (id) => (id === project.id ? project : null),
    },
    developmentEnvironmentInstanceStore: {
      resolveForProject: (projectId, environmentInstanceId) =>
        projectId === project.id &&
        environmentInstanceId === 'environment:primary:api'
          ? {
              projectId,
              environmentInstanceId,
              cwd: project.path,
              runtime: 'host',
            }
          : null,
    },
    dockerComposeLifecycleService: {
      restart: restart as never,
    },
  });
}

test('restarts the explicit Compose node and returns a fresh check', async () => {
  const calls: unknown[][] = [];
  const service = createService(
    [check('ready', 'ready'), check('starting', 'ready')],
    async (...args) => {
      calls.push(args);
      return { state: 'restarted' };
    },
  );

  const result = await service.restart('local-stack', 'postgres');

  assert.equal(result.state, 'restarted');
  assert.equal(result.nodeId, 'postgres');
  assert.equal(calls.length, 1);
  assert.equal((calls[0]?.[0] as Project).id, project.id);
  assert.equal(calls[0]?.[1], 'postgres');
  assert.equal(result.check.health.nodes[0]?.state, 'starting');
});

test('blocks restart before mutation when a dependency is not ready', async () => {
  const value = stack();
  value.dependencies = [{ nodeId: 'postgres', dependsOnNodeId: 'api-server' }];
  const valueCheck = check('ready', 'stopped');
  valueCheck.stack = value;

  let calls = 0;
  const service = createService([valueCheck], async () => {
    calls += 1;
    return { state: 'restarted' };
  });

  const result = await service.restart('local-stack', 'postgres');

  assert.equal(result.state, 'blocked');
  assert.match(result.diagnostic ?? '', /api-server/);
  assert.equal(calls, 0);
});

test('blocks node kinds without a safe restart adapter', async () => {
  let calls = 0;
  const service = createService([check('ready', 'ready')], async () => {
    calls += 1;
    return { state: 'restarted' };
  });

  const result = await service.restart('local-stack', 'api-server');

  assert.equal(result.state, 'blocked');
  assert.match(result.diagnostic ?? '', /process/);
  assert.equal(calls, 0);
});

test('reports failed when Compose lifecycle throws', async () => {
  const service = createService([check('ready', 'ready'), check('failed', 'ready')], async () => {
    throw new Error('compose failed');
  });

  const result = await service.restart('local-stack', 'postgres');

  assert.equal(result.state, 'failed');
  assert.equal(result.nodeId, 'postgres');
  assert.equal(result.check.health.nodes[0]?.state, 'failed');
});
