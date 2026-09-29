import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  Project,
  Stack,
  StackCheck,
  StackNodeState,
} from '@dev-dashboard/contracts';

import { StackStartService } from '../src/services/stack-start-service.js';

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
        id: 'api',
        name: 'API',
        target: {
          kind: 'environment',
          projectId: 'api',
          environmentInstanceId: 'environment:primary:api',
        },
      },
    ],
    dependencies: [{ nodeId: 'api', dependsOnNodeId: 'postgres' }],
  };
}

function check(
  postgres: StackNodeState,
  api: StackNodeState = 'ready',
): StackCheck {
  const value = stack();
  return {
    stack: value,
    topology: {
      stackId: value.id,
      startOrder: ['postgres', 'api'],
      stopOrder: ['api', 'postgres'],
    },
    health: {
      stackId: value.id,
      state: postgres === 'ready' && api === 'ready' ? 'ready' : 'unknown',
      observedAt: '2026-09-29T11:00:00.000Z',
      nodes: [
        {
          nodeId: 'postgres',
          state: postgres,
          observedAt: '2026-09-29T11:00:00.000Z',
        },
        {
          nodeId: 'api',
          state: api,
          observedAt: '2026-09-29T11:00:00.000Z',
        },
      ],
    },
  };
}

function createService(
  checks: StackCheck[],
  start: (...args: unknown[]) => Promise<unknown>,
): StackStartService {
  const queue = [...checks];
  return new StackStartService({
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
      start: start as never,
    },
  });
}

test('starts Compose nodes in topology order and rechecks readiness before dependents', async () => {
  const starts: unknown[][] = [];
  const service = createService(
    [check('stopped'), check('ready')],
    async (...args) => {
      starts.push(args);
      return { state: 'started' };
    },
  );

  const result = await service.start('local-stack');

  assert.equal(result.state, 'completed');
  assert.deepEqual(
    result.steps.map((step) => [step.nodeId, step.state]),
    [
      ['postgres', 'started'],
      ['api', 'already-ready'],
    ],
  );
  assert.equal(starts.length, 1);
  assert.equal((starts[0]?.[0] as Project).id, project.id);
  assert.deepEqual(starts[0]?.[1], {});
  assert.equal(starts[0]?.[2], 'postgres');
});

test('blocks at a non-mutable readiness gate without touching later nodes', async () => {
  const value = check('ready', 'stopped');
  value.topology.startOrder = ['api', 'postgres'];
  value.topology.stopOrder = ['postgres', 'api'];

  let starts = 0;
  const service = createService([value], async () => {
    starts += 1;
    return { state: 'started' };
  });

  const result = await service.start('local-stack');

  assert.equal(result.state, 'blocked');
  assert.deepEqual(
    result.steps.map((step) => step.nodeId),
    ['api'],
  );
  assert.equal(result.steps[0]?.state, 'blocked');
  assert.equal(starts, 0);
});

test('does not advance when Compose start finishes without proven readiness', async () => {
  const service = createService(
    [check('stopped'), check('unknown')],
    async () => ({ state: 'started-unverified' }),
  );

  const result = await service.start('local-stack');

  assert.equal(result.state, 'blocked');
  assert.deepEqual(
    result.steps.map((step) => step.nodeId),
    ['postgres'],
  );
  assert.equal(result.steps[0]?.state, 'blocked');
});

test('records Compose mutation failure on the owning node', async () => {
  const service = createService(
    [check('stopped'), check('stopped')],
    async () => {
      throw new Error('compose failed');
    },
  );

  const result = await service.start('local-stack');

  assert.equal(result.state, 'failed');
  assert.deepEqual(
    result.steps.map((step) => step.nodeId),
    ['postgres'],
  );
  assert.equal(result.steps[0]?.state, 'failed');
});
