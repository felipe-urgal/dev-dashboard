import assert from 'node:assert/strict';
import test from 'node:test';

import type { NodeDependencyInventory } from '../src/services/node-dependency-inventory-service.js';
import {
  OsvDependencyAdvisoryService,
  type OsvFetch,
} from '../src/services/osv-dependency-advisory-service.js';

const NOW = new Date('2026-09-19T17:10:00.000Z');

function inventory(
  dependencies: NodeDependencyInventory['dependencies'],
): NodeDependencyInventory {
  return {
    status: 'ready',
    projectId: 'project-1',
    packageManager: 'npm',
    observedAt: '2026-09-19T17:09:00.000Z',
    lockfile: 'present',
    lockfileVersion: 3,
    dependencies,
    warnings: [],
  };
}

test('consulta OSV em batch somente para versões resolvidas e preserva evidência explícita', async () => {
  let requestedUrl = '';
  let requestedInit: RequestInit | undefined;
  const fetcher: OsvFetch = async (url, init) => {
    requestedUrl = url;
    requestedInit = init;
    return new Response(
      JSON.stringify({
        results: [
          {
            vulns: [
              {
                id: 'GHSA-test-0001',
                modified: '2026-09-18T12:00:00Z',
              },
            ],
          },
        ],
      }),
      { status: 200 },
    );
  };
  const local = inventory([
    {
      name: 'fastify',
      kind: 'dependency',
      declaredRange: '^5.0.0',
      resolution: 'resolved',
      resolvedVersion: '5.6.0',
    },
    {
      name: 'unknown-package',
      kind: 'devDependency',
      declaredRange: 'workspace:*',
      resolution: 'unknown',
    },
  ]);

  const result = await new OsvDependencyAdvisoryService({
    fetcher,
    now: () => NOW,
  }).inspect(local);

  assert.equal(result.inventory, local);
  assert.equal(requestedUrl, 'https://api.osv.dev/v1/querybatch');
  assert.equal(requestedInit?.method, 'POST');
  assert.equal(requestedInit?.credentials, 'omit');
  assert.equal(requestedInit?.redirect, 'error');
  assert.equal(
    (requestedInit?.headers as Record<string, string>)['Content-Type'],
    'application/json',
  );
  assert.deepEqual(JSON.parse(String(requestedInit?.body)), {
    queries: [
      {
        package: { ecosystem: 'npm', name: 'fastify' },
        version: '5.6.0',
      },
    ],
  });
  assert.deepEqual(result.advisories, [
    {
      name: 'fastify',
      state: 'available',
      source: 'osv',
      observedAt: NOW.toISOString(),
      resolvedVersion: '5.6.0',
      advisories: [
        {
          id: 'GHSA-test-0001',
          modified: '2026-09-18T12:00:00Z',
        },
      ],
      complete: true,
    },
    {
      name: 'unknown-package',
      state: 'unknown-version',
      source: 'osv',
      observedAt: NOW.toISOString(),
      advisories: [],
      complete: false,
      diagnostic:
        'A versão resolvida não foi comprovada; advisories não foram consultados.',
    },
  ]);
});

test('resultado vazio comprovado é available e não inventa advisory', async () => {
  const fetcher: OsvFetch = async () =>
    new Response(JSON.stringify({ results: [{}] }), { status: 200 });
  const local = inventory([
    {
      name: 'safe-package',
      kind: 'dependency',
      declaredRange: '1.0.0',
      resolution: 'resolved',
      resolvedVersion: '1.0.0',
    },
  ]);

  const result = await new OsvDependencyAdvisoryService({
    fetcher,
    now: () => NOW,
  }).inspect(local);

  assert.equal(result.advisories[0]?.state, 'available');
  assert.equal(result.advisories[0]?.complete, true);
  assert.deepEqual(result.advisories[0]?.advisories, []);
});

test('paginação OSV permanece partial em vez de falso resultado completo', async () => {
  const fetcher: OsvFetch = async () =>
    new Response(
      JSON.stringify({
        results: [
          {
            vulns: [
              {
                id: 'GHSA-page-0001',
                modified: '2026-09-18T12:00:00Z',
              },
            ],
            next_page_token: 'opaque-token',
          },
        ],
      }),
      { status: 200 },
    );
  const local = inventory([
    {
      name: 'package-a',
      kind: 'dependency',
      declaredRange: '1.0.0',
      resolution: 'resolved',
      resolvedVersion: '1.0.0',
    },
  ]);

  const result = await new OsvDependencyAdvisoryService({
    fetcher,
    now: () => NOW,
  }).inspect(local);

  assert.equal(result.advisories[0]?.state, 'partial');
  assert.equal(result.advisories[0]?.complete, false);
  assert.match(result.advisories[0]?.diagnostic ?? '', /parcial/i);
});

test('HTTP e falha de rede afetam somente evidência externa', async () => {
  const local = inventory([
    {
      name: 'package-a',
      kind: 'dependency',
      declaredRange: '1.0.0',
      resolution: 'resolved',
      resolvedVersion: '1.0.0',
    },
  ]);

  const http = await new OsvDependencyAdvisoryService({
    fetcher: async () => new Response('', { status: 503 }),
    now: () => NOW,
  }).inspect(local);
  assert.equal(http.inventory, local);
  assert.equal(http.advisories[0]?.state, 'unavailable');
  assert.match(http.advisories[0]?.diagnostic ?? '', /HTTP 503/);

  const offline = await new OsvDependencyAdvisoryService({
    fetcher: async () => {
      throw new Error('offline');
    },
    now: () => NOW,
  }).inspect(local);
  assert.equal(offline.inventory, local);
  assert.equal(offline.advisories[0]?.state, 'unavailable');
  assert.match(offline.advisories[0]?.diagnostic ?? '', /indisponível|timeout/i);
});

test('payload inválido ou acima do limite falha fechado', async () => {
  const local = inventory([
    {
      name: 'package-a',
      kind: 'dependency',
      declaredRange: '1.0.0',
      resolution: 'resolved',
      resolvedVersion: '1.0.0',
    },
  ]);

  const invalid = await new OsvDependencyAdvisoryService({
    fetcher: async () =>
      new Response(JSON.stringify({ results: [{ vulns: [{ id: 'missing-date' }] }] }), {
        status: 200,
      }),
    now: () => NOW,
  }).inspect(local);
  assert.equal(invalid.advisories[0]?.state, 'invalid');
  assert.deepEqual(invalid.advisories[0]?.advisories, []);

  const oversized = await new OsvDependencyAdvisoryService({
    fetcher: async () =>
      new Response(JSON.stringify({ results: [{}] }), {
        status: 200,
        headers: { 'content-length': String(3 * 1024 * 1024) },
      }),
    now: () => NOW,
  }).inspect(local);
  assert.equal(oversized.advisories[0]?.state, 'invalid');
});

test('resultado desalinhado com o batch não é associado ao pacote errado', async () => {
  const local = inventory([
    {
      name: 'package-a',
      kind: 'dependency',
      declaredRange: '1.0.0',
      resolution: 'resolved',
      resolvedVersion: '1.0.0',
    },
    {
      name: 'package-b',
      kind: 'dependency',
      declaredRange: '2.0.0',
      resolution: 'resolved',
      resolvedVersion: '2.0.0',
    },
  ]);

  const result = await new OsvDependencyAdvisoryService({
    fetcher: async () =>
      new Response(JSON.stringify({ results: [{}] }), { status: 200 }),
    now: () => NOW,
  }).inspect(local);

  assert.deepEqual(
    result.advisories.map((item) => item.state),
    ['invalid', 'invalid'],
  );
});

test('divide inventários grandes em batches bounded preservando ordem', async () => {
  const local = inventory(
    Array.from({ length: 5 }, (_, index) => ({
      name: `package-${index}`,
      kind: 'dependency' as const,
      declaredRange: '1.0.0',
      resolution: 'resolved' as const,
      resolvedVersion: '1.0.0',
    })),
  );
  const bodies: unknown[] = [];
  const fetcher: OsvFetch = async (_url, init) => {
    const body = JSON.parse(String(init.body)) as {
      queries: Array<{ package: { name: string } }>;
    };
    bodies.push(body);
    return new Response(
      JSON.stringify({
        results: body.queries.map((query) => ({
          vulns:
            query.package.name === 'package-3'
              ? [
                  {
                    id: 'GHSA-package-3',
                    modified: '2026-09-18T12:00:00Z',
                  },
                ]
              : [],
        })),
      }),
      { status: 200 },
    );
  };

  const result = await new OsvDependencyAdvisoryService({
    fetcher,
    now: () => NOW,
    batchSize: 2,
  }).inspect(local);

  assert.equal(bodies.length, 3);
  assert.deepEqual(
    result.advisories.map((item) => item.name),
    local.dependencies.map((item) => item.name),
  );
  assert.deepEqual(
    result.advisories.map((item) => item.state),
    ['available', 'available', 'available', 'available', 'available'],
  );
  assert.equal(result.advisories[3]?.advisories[0]?.id, 'GHSA-package-3');
});

test('timeout aborta consulta e mantém versão local conhecida', async () => {
  const local = inventory([
    {
      name: 'package-a',
      kind: 'dependency',
      declaredRange: '1.0.0',
      resolution: 'resolved',
      resolvedVersion: '1.0.0',
    },
  ]);
  const fetcher: OsvFetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener(
        'abort',
        () => reject(new Error('aborted')),
        { once: true },
      );
    });

  const result = await new OsvDependencyAdvisoryService({
    fetcher,
    now: () => NOW,
    timeoutMs: 10,
  }).inspect(local);

  assert.equal(result.advisories[0]?.state, 'unavailable');
  assert.equal(result.advisories[0]?.resolvedVersion, '1.0.0');
  assert.equal(result.advisories[0]?.complete, false);
});


test('opções numéricas inválidas usam defaults bounded', async () => {
  const local = inventory([
    {
      name: 'package-a',
      kind: 'dependency',
      declaredRange: '1.0.0',
      resolution: 'resolved',
      resolvedVersion: '1.0.0',
    },
  ]);
  let calls = 0;
  const result = await new OsvDependencyAdvisoryService({
    fetcher: async () => {
      calls += 1;
      return new Response(JSON.stringify({ results: [{}] }), { status: 200 });
    },
    now: () => NOW,
    timeoutMs: Number.NaN,
    batchSize: Number.NaN,
  }).inspect(local);

  assert.equal(calls, 1);
  assert.equal(result.advisories[0]?.state, 'available');
});
