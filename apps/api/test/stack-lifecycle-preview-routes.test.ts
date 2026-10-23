import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  Project,
  Stack,
  StackLifecyclePreview,
} from '@dev-dashboard/contracts';

import { buildApp } from '../src/app.js';
import { createAppContext } from '../src/app-context.js';

const TOKEN = 's'.repeat(64);
const headers = { 'x-dev-dashboard-token': TOKEN };

test('Stack lifecycle preview HTTP requires auth, validates params and never exposes execution', async (t) => {
  const context = createAppContext();
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
  context.projectStore.saveWorkspaceScan({
    workspaceId: 'workspace-a',
    workspacePath: '/tmp',
    projects: [project],
    warnings: [],
  });
  const stack: Stack = {
    id: 'api-stack',
    name: 'API',
    nodes: [
      {
        id: 'context',
        name: 'Environment',
        target: {
          kind: 'environment',
          projectId: 'api',
          environmentInstanceId: 'environment:primary:api',
        },
      },
    ],
    dependencies: [],
  };
  context.stackStore.save(stack);
  const app = await buildApp({ context, localToken: TOKEN });
  t.after(async () => app.close());

  const endpoint = '/api/stacks/api-stack/service-plan?action=start';
  assert.equal(
    (await app.inject({ method: 'GET', url: endpoint })).statusCode,
    401,
  );
  const first = await app.inject({ method: 'GET', url: endpoint, headers });
  assert.equal(first.statusCode, 200);
  const plan = first.json<StackLifecyclePreview>();
  assert.equal(plan.target.kind, 'stack');
  assert.equal(plan.target.stackId, 'api-stack');
  assert.equal(plan.action, 'start');
  assert.equal(plan.executable, false);
  assert.deepEqual(plan.order, ['context']);
  assert.equal(plan.nodes[0]?.kind, 'environment');
  assert.match(plan.expectedRevision, /^[a-f0-9]{64}$/);
  assert.match(plan.planHash, /^[a-f0-9]{64}$/);

  const confirmed = await app.inject({
    method: 'GET',
    url:
      endpoint +
      '&expectedPlanHash=' +
      plan.planHash +
      '&expectedRevision=' +
      plan.expectedRevision,
    headers,
  });
  assert.equal(confirmed.statusCode, 200);

  const updatedStack: Stack = { ...stack, name: 'Changed Stack' };
  context.stackStore.save(updatedStack);
  const stale = await app.inject({
    method: 'GET',
    url: endpoint + '&expectedPlanHash=' + plan.planHash,
    headers,
  });
  assert.equal(stale.statusCode, 409);
  const oldRevision = await app.inject({
    method: 'GET',
    url: endpoint + '&expectedRevision=' + plan.expectedRevision,
    headers,
  });
  assert.equal(oldRevision.statusCode, 409);

  const invalidAction = await app.inject({
    method: 'GET',
    url: '/api/stacks/api-stack/service-plan?action=restart',
    headers,
  });
  assert.equal(invalidAction.statusCode, 400);
  const invalidHash = await app.inject({
    method: 'GET',
    url: endpoint + '&expectedPlanHash=not-a-hash',
    headers,
  });
  assert.equal(invalidHash.statusCode, 400);
  const ignoredExtra = await app.inject({
    method: 'GET',
    url: endpoint + '&path=/tmp/arbitrary',
    headers,
  });
  // Fastify sanitizes undeclared query properties; they never become targets.
  assert.equal(ignoredExtra.statusCode, 200);
  assert.equal(ignoredExtra.json<StackLifecyclePreview>().executable, false);
  assert.equal(
    JSON.stringify(ignoredExtra.json()).includes('/tmp/arbitrary'),
    false,
  );
  const missing = await app.inject({
    method: 'GET',
    url: '/api/stacks/nonexistent/service-plan?action=start',
    headers,
  });
  assert.equal(missing.statusCode, 404);
  const mutation = await app.inject({
    method: 'POST',
    url: '/api/stacks/api-stack/service-plan?action=start',
    headers,
  });
  assert.notEqual(mutation.statusCode, 200);
});
