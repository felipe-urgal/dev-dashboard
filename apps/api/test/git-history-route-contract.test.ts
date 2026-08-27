import assert from 'node:assert/strict';
import { test } from 'node:test';

import Fastify, { type FastifySchema } from 'fastify';

import { buildApp } from '../src/app.js';
import { gitExclusiveBranchHistoryRoutes } from '../src/routes/git-exclusive-branch-history.js';
import type { ProjectStore } from '../src/store/project-store.js';

const TOKEN = 'h'.repeat(64);

test('mantém os contratos de histórico Git', async (context) => {
  const app = await buildApp({ localToken: TOKEN });
  context.after(async () => app.close());

  await app.ready();

  assert.equal(
    app.hasRoute({
      method: 'GET',
      url: '/api/projects/:projectId/git/current-branch-commits',
    }),
    true,
  );
  assert.equal(
    app.hasRoute({
      method: 'GET',
      url: '/api/projects/:projectId/git/exclusive-branch-commits',
    }),
    true,
  );
});

test('mantém query e resposta do histórico exclusivo com o mesmo limite', async (context) => {
  const app = Fastify();
  context.after(async () => app.close());

  let routeSchema: FastifySchema | undefined;
  app.addHook('onRoute', (routeOptions) => {
    if (
      routeOptions.method === 'GET' &&
      routeOptions.url === '/projects/:projectId/git/exclusive-branch-commits'
    ) {
      routeSchema = routeOptions.schema;
    }
  });

  await app.register(gitExclusiveBranchHistoryRoutes, {
    projectStore: {
      findProject: () => undefined,
    } as unknown as ProjectStore,
  });
  await app.ready();

  assert.ok(routeSchema);

  const querySchema = routeSchema.querystring as {
    properties: { pageSize: { maximum: number } };
  };
  const responseSchema = routeSchema.response as {
    200: {
      properties: {
        history: {
          properties: { pageSize: { maximum: number } };
        };
      };
    };
  };

  assert.equal(querySchema.properties.pageSize.maximum, 50);
  assert.equal(
    responseSchema[200].properties.history.properties.pageSize.maximum,
    querySchema.properties.pageSize.maximum,
  );
});
