import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyDependencyUpdate,
  evaluateNodeRuntimeCompatibility,
  NpmDependencyMetadataService,
  type NpmRegistryFetch,
} from '../src/services/npm-dependency-metadata-service.js';
import type { NodeDependencyInventory } from '../src/services/node-dependency-inventory-service.js';

const NOW = new Date('2026-09-06T18:00:00.000Z');

function inventory(
  dependencies: NodeDependencyInventory['dependencies'],
): NodeDependencyInventory {
  return {
    status: 'ready',
    projectId: 'project-1',
    packageManager: 'npm',
    observedAt: '2026-09-06T17:59:00.000Z',
    lockfile: 'present',
    lockfileVersion: 3,
    dependencies,
    warnings: [],
  };
}

function singleDependency(): NodeDependencyInventory {
  return inventory([
    {
      name: 'fastify',
      kind: 'dependency',
      declaredRange: '^5.0.0',
      resolution: 'resolved',
      resolvedVersion: '5.6.0',
    },
  ]);
}

test('classifica updates comparáveis sem promover prerelease ou versão desconhecida', () => {
  assert.equal(classifyDependencyUpdate('1.2.3', '1.2.3'), 'none');
  assert.equal(classifyDependencyUpdate('1.2.3', '1.2.4'), 'patch');
  assert.equal(classifyDependencyUpdate('1.2.3', '1.3.0'), 'minor');
  assert.equal(classifyDependencyUpdate('1.2.3', '2.0.0'), 'major');
  assert.equal(classifyDependencyUpdate('2.0.0', '1.9.9'), 'none');
  assert.equal(classifyDependencyUpdate(undefined, '2.0.0'), 'unknown');
  assert.equal(classifyDependencyUpdate('1.2.3-beta.1', '1.2.3'), 'unknown');
});

test('compatibilidade de runtime só afirma resultado para range suportado e runtime comprovado', () => {
  const projectRange = '^20.19.0 || >=22.12.0';
  assert.equal(
    evaluateNodeRuntimeCompatibility('20.19.0', projectRange),
    'compatible',
  );
  assert.equal(
    evaluateNodeRuntimeCompatibility('22.12.0', projectRange),
    'compatible',
  );
  assert.equal(
    evaluateNodeRuntimeCompatibility('21.7.0', projectRange),
    'incompatible',
  );
  assert.equal(
    evaluateNodeRuntimeCompatibility(undefined, projectRange),
    'unknown',
  );
  assert.equal(
    evaluateNodeRuntimeCompatibility('22.12.0', 'workspace:*'),
    'unknown',
  );
});

test('consulta somente endpoint latest do npm registry e preserva origem/freshness', async () => {
  let requestedUrl = '';
  let requestedInit: RequestInit | undefined;
  const fetcher: NpmRegistryFetch = async (url, init) => {
    requestedUrl = url;
    requestedInit = init;
    return new Response(JSON.stringify({ version: '2.1.0' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const local = inventory([
    {
      name: '@scope/package',
      kind: 'dependency',
      declaredRange: '^1.0.0',
      resolution: 'resolved',
      resolvedVersion: '1.9.0',
    },
  ]);

  const result = await new NpmDependencyMetadataService({
    fetcher,
    now: () => NOW,
  }).enrich(local);

  assert.equal(result.inventory, local);
  assert.equal(
    requestedUrl,
    'https://registry.npmjs.org/@scope%2Fpackage/latest',
  );
  assert.equal(requestedInit?.method, 'GET');
  assert.equal(requestedInit?.credentials, 'omit');
  assert.equal(requestedInit?.redirect, 'error');
  assert.deepEqual(result.metadata, [
    {
      name: '@scope/package',
      state: 'available',
      source: 'npm-registry',
      observedAt: NOW.toISOString(),
      latestVersion: '2.1.0',
      latestRuntimeCompatibility: 'unknown',
      update: 'major',
    },
  ]);
});

test('indica compatibilidade do latest quando registry declara engines.node e runtime é comprovado', async () => {
  const fetcher: NpmRegistryFetch = async () =>
    new Response(
      JSON.stringify({
        version: '6.0.0',
        engines: { node: '^20.19.0 || >=22.12.0' },
      }),
      { status: 200 },
    );

  const compatible = await new NpmDependencyMetadataService({
    fetcher,
    now: () => NOW,
    runtimeVersion: '22.12.0',
  }).enrich(singleDependency());
  assert.deepEqual(compatible.metadata[0], {
    name: 'fastify',
    state: 'available',
    source: 'npm-registry',
    observedAt: NOW.toISOString(),
    latestVersion: '6.0.0',
    latestNodeEngine: '^20.19.0 || >=22.12.0',
    runtimeVersion: '22.12.0',
    latestRuntimeCompatibility: 'compatible',
    update: 'major',
  });

  const incompatible = await new NpmDependencyMetadataService({
    fetcher,
    now: () => NOW,
    runtimeVersion: '21.7.0',
  }).enrich(singleDependency());
  assert.equal(
    incompatible.metadata[0]?.latestRuntimeCompatibility,
    'incompatible',
  );
});

test('não confunde runtime da API com runtime do projeto nem inventa compatibilidade', async () => {
  const fetcher: NpmRegistryFetch = async () =>
    new Response(
      JSON.stringify({
        version: '6.0.0',
        engines: { node: '>=22.0.0' },
      }),
      { status: 200 },
    );

  const withoutRuntime = await new NpmDependencyMetadataService({
    fetcher,
    now: () => NOW,
  }).enrich(singleDependency());
  assert.equal(withoutRuntime.metadata[0]?.runtimeVersion, undefined);
  assert.equal(
    withoutRuntime.metadata[0]?.latestRuntimeCompatibility,
    'unknown',
  );

  const invalidRuntime = await new NpmDependencyMetadataService({
    fetcher,
    now: () => NOW,
    runtimeVersion: 'latest',
  }).enrich(singleDependency());
  assert.equal(invalidRuntime.metadata[0]?.runtimeVersion, undefined);
  assert.equal(
    invalidRuntime.metadata[0]?.latestRuntimeCompatibility,
    'unknown',
  );
});

test('range de engine não suportado permanece visível, mas compatibilidade fica unknown', async () => {
  const fetcher: NpmRegistryFetch = async () =>
    new Response(
      JSON.stringify({
        version: '6.0.0',
        engines: { node: 'workspace:*' },
      }),
      { status: 200 },
    );

  const result = await new NpmDependencyMetadataService({
    fetcher,
    now: () => NOW,
    runtimeVersion: '22.12.0',
  }).enrich(singleDependency());

  assert.equal(result.metadata[0]?.latestNodeEngine, 'workspace:*');
  assert.equal(result.metadata[0]?.runtimeVersion, '22.12.0');
  assert.equal(result.metadata[0]?.latestRuntimeCompatibility, 'unknown');
});

test('falha de registry mantém integralmente os fatos locais e marca externo indisponível', async () => {
  const local = singleDependency();
  const fetcher: NpmRegistryFetch = async () => {
    throw new Error('offline');
  };

  const result = await new NpmDependencyMetadataService({
    fetcher,
    now: () => NOW,
  }).enrich(local);

  assert.equal(result.inventory, local);
  assert.deepEqual(result.inventory.dependencies, local.dependencies);
  assert.equal(result.metadata[0]?.state, 'unavailable');
  assert.equal(result.metadata[0]?.update, 'unknown');
  assert.equal(result.metadata[0]?.latestRuntimeCompatibility, 'unknown');
  assert.match(result.metadata[0]?.diagnostic ?? '', /indisponível|timeout/u);
});

test('timeout aborta consulta sem apagar inventário local', async () => {
  const local = singleDependency();
  const fetcher: NpmRegistryFetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener(
        'abort',
        () => reject(new Error('aborted')),
        { once: true },
      );
    });

  const result = await new NpmDependencyMetadataService({
    fetcher,
    now: () => NOW,
    timeoutMs: 10,
  }).enrich(local);

  assert.equal(result.inventory, local);
  assert.equal(result.metadata[0]?.state, 'unavailable');
  assert.equal(result.metadata[0]?.latestRuntimeCompatibility, 'unknown');
});

test('payload externo acima do limite falha fechado sem consumir versão', async () => {
  const local = singleDependency();
  const fetcher: NpmRegistryFetch = async () =>
    new Response(JSON.stringify({ version: '6.0.0' }), {
      status: 200,
      headers: { 'content-length': String(300 * 1024) },
    });

  const result = await new NpmDependencyMetadataService({
    fetcher,
    now: () => NOW,
  }).enrich(local);

  assert.equal(result.metadata[0]?.state, 'invalid');
  assert.equal(result.metadata[0]?.latestVersion, undefined);
  assert.equal(result.metadata[0]?.update, 'unknown');
  assert.equal(result.metadata[0]?.latestRuntimeCompatibility, 'unknown');
});

test('limita concorrência de consultas ao registry', async () => {
  let active = 0;
  let peak = 0;
  const fetcher: NpmRegistryFetch = async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return new Response(JSON.stringify({ version: '1.0.1' }), { status: 200 });
  };
  const local = inventory(
    Array.from({ length: 5 }, (_, index) => ({
      name: `package-${index}`,
      kind: 'dependency' as const,
      declaredRange: '^1.0.0',
      resolution: 'resolved' as const,
      resolvedVersion: '1.0.0',
    })),
  );

  const result = await new NpmDependencyMetadataService({
    fetcher,
    maxConcurrent: 2,
  }).enrich(local);

  assert.equal(result.metadata.length, 5);
  assert.equal(peak, 2);
});
