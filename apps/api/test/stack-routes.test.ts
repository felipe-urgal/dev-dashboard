import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type {
  Project,
  Stack,
  StackDependencyDiscovery,
} from '@dev-dashboard/contracts';

import { buildApp } from '../src/app.js';
import { createAppContext } from '../src/app-context.js';
import { StackStore } from '../src/store/stack-store.js';

const TOKEN = 's'.repeat(64);

function registerApiProject(
  appContext: ReturnType<typeof createAppContext>,
): void {
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
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'workspace-a',
    workspacePath: '/tmp',
    projects: [project],
    warnings: [],
  });
}

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

test('Stack HTTP expõe CRUD autenticado e valida a topologia antes de persistir', async (context) => {
  const stateDirectory = mkdtempSync(
    path.join(os.tmpdir(), 'dev-dashboard-stack-routes-'),
  );
  const appContext = createAppContext();
  registerApiProject(appContext);
  appContext.stackStore = new StackStore({ stateDirectory });
  const app = await buildApp({ localToken: TOKEN, context: appContext });

  context.after(async () => {
    await app.close();
    rmSync(stateDirectory, { recursive: true, force: true });
  });

  const unauthorized = await app.inject({
    method: 'GET',
    url: '/api/stacks',
  });
  assert.equal(unauthorized.statusCode, 401);

  const headers = {
    'x-dev-dashboard-token': TOKEN,
    'content-type': 'application/json',
  };

  const created = await app.inject({
    method: 'PUT',
    url: '/api/stacks/local-stack',
    headers,
    payload: stack(),
  });
  assert.equal(created.statusCode, 200);
  assert.deepEqual(created.json<{ stack: Stack }>().stack, stack());

  const listed = await app.inject({
    method: 'GET',
    url: '/api/stacks',
    headers,
  });
  assert.equal(listed.statusCode, 200);
  assert.deepEqual(listed.json<{ stacks: Stack[] }>().stacks, [stack()]);

  const fetched = await app.inject({
    method: 'GET',
    url: '/api/stacks/local-stack',
    headers,
  });
  assert.equal(fetched.statusCode, 200);
  assert.equal(fetched.json<{ stack: Stack }>().stack.name, 'Local stack');

  const checked = await app.inject({
    method: 'GET',
    url: '/api/stacks/local-stack/check',
    headers,
  });
  assert.equal(checked.statusCode, 200);
  const check = checked.json<{
    check: {
      topology: { startOrder: string[]; stopOrder: string[] };
      health: {
        state: string;
        nodes: Array<{ nodeId: string; state: string }>;
      };
    };
  }>().check;
  assert.deepEqual(check.topology.startOrder, ['postgres', 'api']);
  assert.deepEqual(check.topology.stopOrder, ['api', 'postgres']);
  assert.equal(check.health.state, 'unknown');
  assert.deepEqual(
    check.health.nodes.map((node) => [node.nodeId, node.state]),
    [
      ['postgres', 'unknown'],
      ['api', 'ready'],
    ],
  );

  const mismatch = await app.inject({
    method: 'PUT',
    url: '/api/stacks/other-stack',
    headers,
    payload: stack(),
  });
  assert.equal(mismatch.statusCode, 400);
  assert.equal(mismatch.json<{ error: string }>().error, 'BAD_REQUEST');

  const cyclic = stack();
  cyclic.dependencies.push({
    nodeId: 'postgres',
    dependsOnNodeId: 'api',
  });
  const rejected = await app.inject({
    method: 'PUT',
    url: '/api/stacks/local-stack',
    headers,
    payload: cyclic,
  });
  assert.equal(rejected.statusCode, 409);
  assert.equal(rejected.json<{ error: string }>().error, 'CONFLICT');

  const removed = await app.inject({
    method: 'DELETE',
    url: '/api/stacks/local-stack',
    headers: { 'x-dev-dashboard-token': TOKEN },
  });
  assert.equal(removed.statusCode, 204);

  const missing = await app.inject({
    method: 'GET',
    url: '/api/stacks/local-stack',
    headers,
  });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json<{ error: string }>().error, 'NOT_FOUND');
});

test('Stack HTTP sanitiza propriedades extras e rejeita nodes vazios', async (context) => {
  const appContext = createAppContext();
  registerApiProject(appContext);
  const app = await buildApp({ localToken: TOKEN, context: appContext });
  context.after(async () => app.close());

  const headers = {
    'x-dev-dashboard-token': TOKEN,
    'content-type': 'application/json',
  };

  const extraProperty = await app.inject({
    method: 'PUT',
    url: '/api/stacks/local-stack',
    headers,
    payload: { ...stack(), unexpected: true },
  });
  assert.equal(extraProperty.statusCode, 200);
  assert.equal(
    Object.hasOwn(extraProperty.json<{ stack: Stack }>().stack, 'unexpected'),
    false,
  );

  const empty = stack();
  empty.nodes = [];
  const emptyNodes = await app.inject({
    method: 'PUT',
    url: '/api/stacks/local-stack',
    headers,
    payload: empty,
  });
  assert.equal(emptyNodes.statusCode, 400);
});

test('Stack HTTP recusa referências de projeto que o backend não conhece', async (context) => {
  const appContext = createAppContext();
  registerApiProject(appContext);
  const app = await buildApp({ localToken: TOKEN, context: appContext });
  context.after(async () => app.close());

  const invalid = stack();
  invalid.nodes[0]!.target.projectId = 'missing-project';

  const response = await app.inject({
    method: 'PUT',
    url: '/api/stacks/local-stack',
    headers: {
      'x-dev-dashboard-token': TOKEN,
      'content-type': 'application/json',
    },
    payload: invalid,
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json<{ error: string }>().error, 'NOT_FOUND');
});

test('Stack HTTP expõe stop coordenado sem mutar Environment Instance', async (context) => {
  const appContext = createAppContext();
  registerApiProject(appContext);
  const app = await buildApp({ localToken: TOKEN, context: appContext });
  context.after(async () => app.close());

  const environmentOnly: Stack = {
    id: 'environment-stack',
    name: 'Environment stack',
    nodes: [
      {
        id: 'api-environment',
        name: 'API environment',
        target: {
          kind: 'environment',
          projectId: 'api',
          environmentInstanceId: 'environment:primary:api',
        },
      },
    ],
    dependencies: [],
  };
  const headers = {
    'x-dev-dashboard-token': TOKEN,
    'content-type': 'application/json',
  };

  const created = await app.inject({
    method: 'PUT',
    url: '/api/stacks/environment-stack',
    headers,
    payload: environmentOnly,
  });
  assert.equal(created.statusCode, 200);

  const stopped = await app.inject({
    method: 'POST',
    url: '/api/stacks/environment-stack/stop',
    headers,
    payload: {},
  });
  assert.equal(stopped.statusCode, 200);
  const result = stopped.json<{
    result: {
      state: string;
      steps: Array<{ nodeId: string; state: string }>;
    };
  }>().result;
  assert.equal(result.state, 'completed');
  assert.deepEqual(
    result.steps.map((step) => [step.nodeId, step.state]),
    [['api-environment', 'retained']],
  );
});

test('Stack HTTP bloqueia restart de node sem adapter mutável seguro', async (context) => {
  const appContext = createAppContext();
  registerApiProject(appContext);
  const app = await buildApp({ localToken: TOKEN, context: appContext });
  context.after(async () => app.close());

  const processStack: Stack = {
    id: 'process-stack',
    name: 'Process stack',
    nodes: [
      {
        id: 'api-process',
        name: 'API process',
        target: {
          kind: 'process',
          projectId: 'api',
          environmentInstanceId: 'environment:primary:api',
          processId: 'server:api',
        },
      },
    ],
    dependencies: [],
  };
  const headers = {
    'x-dev-dashboard-token': TOKEN,
    'content-type': 'application/json',
  };

  const created = await app.inject({
    method: 'PUT',
    url: '/api/stacks/process-stack',
    headers,
    payload: processStack,
  });
  assert.equal(created.statusCode, 200);

  const restarted = await app.inject({
    method: 'POST',
    url: '/api/stacks/process-stack/nodes/api-process/restart',
    headers,
    payload: {},
  });
  assert.equal(restarted.statusCode, 200);
  const result = restarted.json<{
    result: {
      nodeId: string;
      state: string;
      diagnostic?: string;
    };
  }>().result;
  assert.equal(result.nodeId, 'api-process');
  assert.equal(result.state, 'blocked');
  assert.match(result.diagnostic ?? '', /process/);
});


test('Stack HTTP sugere depends_on Compose sem persistir antes da confirmação explícita', async (context) => {
  const appContext = createAppContext();
  registerApiProject(appContext);

  const composeStack: Stack = {
    id: 'compose-stack',
    name: 'Compose stack',
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
        id: 'api-service',
        name: 'API',
        target: {
          kind: 'compose-service',
          projectId: 'api',
          environmentInstanceId: 'environment:primary:api',
          service: 'api',
        },
      },
    ],
    dependencies: [],
  };

  const app = await buildApp({
    localToken: TOKEN,
    context: appContext,
    dockerComposeProvider: {
      inspect: async () => ({
        state: 'runtime-unavailable',
        observedAt: '2026-09-30T12:00:00.000Z',
        config: {
          observedAt: '2026-09-30T12:00:00.000Z',
          services: [
            {
              name: 'api',
              profiles: [],
              dependsOn: ['postgres'],
              ports: [],
            },
            {
              name: 'postgres',
              profiles: [],
              dependsOn: [],
              ports: [],
            },
          ],
          declaredPorts: [],
        },
        diagnostic: 'Runtime is intentionally unavailable in this test.',
      }),
    },
  });
  context.after(async () => app.close());

  const headers = {
    'x-dev-dashboard-token': TOKEN,
    'content-type': 'application/json',
  };

  const created = await app.inject({
    method: 'PUT',
    url: '/api/stacks/compose-stack',
    headers,
    payload: composeStack,
  });
  assert.equal(created.statusCode, 200);

  const discovered = await app.inject({
    method: 'GET',
    url: '/api/stacks/compose-stack/dependency-suggestions',
    headers,
  });
  assert.equal(discovered.statusCode, 200);
  const discovery =
    discovered.json<{ discovery: StackDependencyDiscovery }>().discovery;
  assert.deepEqual(discovery.suggestions, [
    {
      dependency: {
        nodeId: 'api-service',
        dependsOnNodeId: 'postgres',
      },
      evidence: {
        source: 'compose',
        projectId: 'api',
        environmentInstanceId: 'environment:primary:api',
        service: 'api',
        dependsOnService: 'postgres',
        observedAt: '2026-09-30T12:00:00.000Z',
      },
    },
  ]);

  const unchanged = await app.inject({
    method: 'GET',
    url: '/api/stacks/compose-stack',
    headers,
  });
  assert.deepEqual(
    unchanged.json<{ stack: Stack }>().stack.dependencies,
    [],
  );

  const confirmedStack: Stack = {
    ...composeStack,
    dependencies: [discovery.suggestions[0]!.dependency],
  };
  const confirmed = await app.inject({
    method: 'PUT',
    url: '/api/stacks/compose-stack',
    headers,
    payload: confirmedStack,
  });
  assert.equal(confirmed.statusCode, 200);
  assert.deepEqual(
    confirmed.json<{ stack: Stack }>().stack.dependencies,
    confirmedStack.dependencies,
  );

  const rediscovered = await app.inject({
    method: 'GET',
    url: '/api/stacks/compose-stack/dependency-suggestions',
    headers,
  });
  assert.deepEqual(
    rediscovered.json<{ discovery: StackDependencyDiscovery }>().discovery
      .suggestions,
    [],
  );
});

test('Stack discovery não sugere relação Compose que criaria ciclo', async (context) => {
  const appContext = createAppContext();
  registerApiProject(appContext);

  const cyclicCandidate: Stack = {
    id: 'cycle-stack',
    name: 'Cycle stack',
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
        id: 'api-service',
        name: 'API',
        target: {
          kind: 'compose-service',
          projectId: 'api',
          environmentInstanceId: 'environment:primary:api',
          service: 'api',
        },
      },
    ],
    dependencies: [
      {
        nodeId: 'postgres',
        dependsOnNodeId: 'api-service',
      },
    ],
  };

  const app = await buildApp({
    localToken: TOKEN,
    context: appContext,
    dockerComposeProvider: {
      inspect: async () => ({
        state: 'runtime-unavailable',
        observedAt: '2026-09-30T12:00:00.000Z',
        config: {
          observedAt: '2026-09-30T12:00:00.000Z',
          services: [
            {
              name: 'api',
              profiles: [],
              dependsOn: ['postgres'],
              ports: [],
            },
            {
              name: 'postgres',
              profiles: [],
              dependsOn: [],
              ports: [],
            },
          ],
          declaredPorts: [],
        },
      }),
    },
  });
  context.after(async () => app.close());

  const headers = {
    'x-dev-dashboard-token': TOKEN,
    'content-type': 'application/json',
  };
  const created = await app.inject({
    method: 'PUT',
    url: '/api/stacks/cycle-stack',
    headers,
    payload: cyclicCandidate,
  });
  assert.equal(created.statusCode, 200);

  const discovered = await app.inject({
    method: 'GET',
    url: '/api/stacks/cycle-stack/dependency-suggestions',
    headers,
  });
  assert.equal(discovered.statusCode, 200);
  const discovery =
    discovered.json<{ discovery: StackDependencyDiscovery }>().discovery;
  assert.deepEqual(discovery.suggestions, []);
  assert.equal(
    discovery.diagnostics.some((item) =>
      item.message.includes('topology invalid'),
    ),
    true,
  );
});
