import assert from 'node:assert/strict';
import { test } from 'node:test';

import Fastify from 'fastify';

import { projectResponseSchema } from '../src/http/response-schemas/workspaces-projects.js';

test('project response schema preserves Project Profile and strips unknown fields', async (context) => {
  const app = Fastify({ logger: false });

  app.get(
    '/project',
    {
      schema: {
        response: {
          200: projectResponseSchema,
        },
      },
    },
    async () => ({
      id: 'project-1',
      name: 'Fixture',
      path: '/tmp/fixture',
      type: 'node',
      source: 'workspace',
      enabled: true,
      capabilities: ['git'],
      profile: {
        capabilities: [
          {
            id: 'runtime/node',
            provider: 'runtime',
            confidence: 'certain',
            evidence: [
              {
                kind: 'file',
                source: '.nvmrc',
                internalDetail: 'must-not-leak',
              },
            ],
            metadata: { declaredVersion: '22.12.0' },
            internalDetail: 'must-not-leak',
          },
        ],
        diagnostics: [
          {
            provider: 'fixture',
            message: 'Provider indisponível.',
            internalDetail: 'must-not-leak',
          },
        ],
        internalDetail: 'must-not-leak',
      },
      internalDetail: 'must-not-leak',
    }),
  );

  context.after(async () => {
    await app.close();
  });

  const response = await app.inject({ method: 'GET', url: '/project' });
  const body = response.json<Record<string, unknown>>();

  assert.equal(response.statusCode, 200);
  assert.equal(body.internalDetail, undefined);

  const profile = body.profile as {
    capabilities: Array<Record<string, unknown>>;
    diagnostics: Array<Record<string, unknown>>;
    internalDetail?: unknown;
  };

  assert.equal(profile.internalDetail, undefined);
  assert.equal(profile.capabilities[0]?.id, 'runtime/node');
  assert.deepEqual(profile.capabilities[0]?.metadata, {
    declaredVersion: '22.12.0',
  });
  assert.equal(profile.capabilities[0]?.internalDetail, undefined);

  const evidence = profile.capabilities[0]?.evidence as Array<
    Record<string, unknown>
  >;
  assert.equal(evidence[0]?.source, '.nvmrc');
  assert.equal(evidence[0]?.internalDetail, undefined);
  assert.equal(profile.diagnostics[0]?.provider, 'fixture');
  assert.equal(profile.diagnostics[0]?.internalDetail, undefined);
});
