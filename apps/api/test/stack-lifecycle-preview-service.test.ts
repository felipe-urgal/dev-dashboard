import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  Stack,
  StackCheck,
  StackNodeHealth,
  StackResource,
} from '@dev-dashboard/contracts';

import { StackLifecyclePreviewService } from '../src/services/stack-lifecycle-preview-service.js';

function definitions(): Stack[] {
  return [
    {
      id: 'stack-api',
      name: 'API',
      nodes: [
        {
          id: 'db',
          name: 'Postgres',
          target: {
            kind: 'compose-service',
            projectId: 'api',
            environmentInstanceId: 'environment:primary:api',
            service: 'db',
          },
        },
        {
          id: 'api',
          name: 'API',
          target: {
            kind: 'compose-service',
            projectId: 'api',
            environmentInstanceId: 'environment:primary:api',
            service: 'api',
          },
        },
      ],
      dependencies: [{ nodeId: 'api', dependsOnNodeId: 'db' }],
    },
    {
      id: 'stack-other',
      name: 'Other',
      nodes: [
        {
          id: 'shared-db',
          name: 'Shared Postgres',
          target: {
            kind: 'compose-service',
            projectId: 'api',
            environmentInstanceId: 'environment:primary:api',
            service: 'db',
          },
        },
      ],
      dependencies: [],
    },
  ];
}

function harness() {
  const stacks = definitions();
  const nodeState = new Map<string, StackNodeHealth['state']>([
    ['db', 'stopped'],
    ['api', 'stopped'],
  ]);
  const resources: StackResource[] = stacks[0]!.nodes.map((node) => ({
    name: node.name,
    target: node.target,
  }));
  let available = true;
  let now = Date.parse('2026-10-23T18:00:00.000Z');
  const service = new StackLifecyclePreviewService(
    {
      check: {
        async check(stackId): Promise<StackCheck> {
          const stack = stacks.find((candidate) => candidate.id === stackId);
          if (!stack) throw new Error('missing fixture');
          return {
            stack,
            topology: {
              stackId,
              startOrder: ['db', 'api'],
              stopOrder: ['api', 'db'],
            },
            health: {
              stackId,
              observedAt: new Date(now).toISOString(),
              state: 'unknown',
              nodes: stack.nodes.map((node) => ({
                nodeId: node.id,
                state: nodeState.get(node.id) ?? 'unknown',
                observedAt: new Date(now).toISOString(),
              })),
            },
          };
        },
      },
      stacks: { list: () => stacks },
      resources: {
        async list() {
          if (!available) throw new Error('SECRET_TOKEN_INSPECTION_FAILED');
          return resources;
        },
      },
    },
    { now: () => new Date(now) },
  );
  return {
    service,
    stacks,
    resources,
    nodeState,
    advance: () => {
      now += 1_000;
    },
    outage: () => {
      available = false;
    },
  };
}

test('Stack preview is dependency first on start, stable across timestamp polls and never executable', async () => {
  const h = harness();
  const start = await h.service.preview('stack-api', 'start');
  assert.deepEqual(start.order, ['db', 'api']);
  assert.deepEqual(start.nodes.map((node) => node.disposition), [
    'willStart',
    'willStart',
  ]);
  assert.equal(start.executable, false);
  assert.equal(start.target.kind, 'stack');
  assert.match(start.planHash, /^[a-f0-9]{64}$/);
  assert.equal(
    Date.parse(start.expiresAt) - Date.parse(start.observedAt),
    30_000,
  );

  h.advance();
  const same = await h.service.preview(
    'stack-api',
    'start',
    start.planHash,
    start.expectedRevision,
  );
  assert.equal(same.planHash, start.planHash);
  assert.notEqual(same.observedAt, start.observedAt);

  h.nodeState.set('db', 'ready');
  await assert.rejects(
    () => h.service.preview('stack-api', 'start', start.planHash),
    (error: { statusCode?: number }) => error.statusCode === 409,
  );
  h.stacks[0]!.nodes[0]!.name = 'Database changed';
  await assert.rejects(
    () =>
      h.service.preview(
        'stack-api',
        'start',
        undefined,
        start.expectedRevision,
      ),
    (error: { statusCode?: number }) => error.statusCode === 409,
  );
});

test('Stack stop reverses order and conservatively retains service in another Stack', async () => {
  const h = harness();
  h.nodeState.set('db', 'ready');
  h.nodeState.set('api', 'ready');
  const stop = await h.service.preview('stack-api', 'stop');
  assert.deepEqual(stop.order, ['api', 'db']);
  assert.equal(stop.nodes[0]?.disposition, 'willStop');
  assert.equal(stop.nodes[1]?.disposition, 'retained');
  assert.equal(stop.nodes[1]?.otherStackConsumers, 1);
  assert.match(stop.nodes[1]?.diagnostic ?? '', /Another Stack/);
  assert.equal(stop.executable, false);
  assert.notEqual(stop.planHash, (await h.service.preview('stack-api', 'start')).planHash);

  // An active dependent retained by policy keeps its dependency alive.
  h.stacks[0]!.nodes[1]!.target = {
    kind: 'environment',
    projectId: 'api',
    environmentInstanceId: 'environment:primary:api',
  };
  h.resources.push({ name: 'Environment', target: h.stacks[0]!.nodes[1]!.target });
  const retained = await h.service.preview('stack-api', 'stop');
  assert.deepEqual(retained.nodes.map((node) => node.disposition), [
    'retained',
    'retained',
  ]);
});

test('Missing target, unknown health and catalog outage fail closed without leaking provider errors', async () => {
  const h = harness();
  h.nodeState.set('db', 'unknown');
  const unknown = await h.service.preview('stack-api', 'start');
  assert.equal(unknown.nodes[0]?.disposition, 'blocked');
  assert.equal(unknown.nodes[1]?.disposition, 'blocked');
  assert.equal(unknown.status, 'blocked');

  h.resources.pop();
  h.nodeState.set('db', 'stopped');
  const stale = await h.service.preview('stack-api', 'start');
  assert.equal(stale.nodes[1]?.disposition, 'blocked');
  h.outage();
  const failure = await h.service.preview('stack-api', 'start');
  assert.equal(failure.status, 'blocked');
  assert.equal(failure.nodes.every((node) => node.disposition === 'blocked'), true);
  assert.equal(JSON.stringify(failure).includes('SECRET_TOKEN'), false);
});

test('Process Manager running is not represented as independently proven readiness', async () => {
  const h = harness();
  h.stacks[0]!.nodes[0]!.target = {
    kind: 'process',
    projectId: 'api',
    environmentInstanceId: 'environment:primary:api',
    processId: 'process-1',
  };
  h.resources.push({ name: 'Process', target: h.stacks[0]!.nodes[0]!.target });
  h.nodeState.set('db', 'ready');
  const plan = await h.service.preview('stack-api', 'start');
  assert.equal(plan.nodes[0]?.disposition, 'blocked');
  assert.equal(plan.nodes[1]?.disposition, 'blocked');
  assert.equal(plan.executable, false);
});
