import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { NodeDependencyInventoryService } from '../src/services/node-dependency-inventory-service.js';

const NOW = new Date('2026-09-06T14:00:00.000Z');

async function createProjectFixture(
  files: Record<string, string>,
): Promise<{ project: Project; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-deps-'));
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(root, name), content, 'utf8');
  }

  return {
    project: {
      id: 'project-1',
      name: 'Projeto',
      path: root,
      type: 'node',
      source: 'workspace',
      enabled: true,
      capabilities: [],
    },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

function service(): NodeDependencyInventoryService {
  return new NodeDependencyInventoryService(() => NOW);
}

test('diferencia range declarado, versão resolvida e devDependency em package-lock atual', async (context) => {
  const fixture = await createProjectFixture({
    'package.json': JSON.stringify({
      dependencies: { fastify: '^5.0.0' },
      devDependencies: { typescript: '~5.9.0' },
    }),
    'package-lock.json': JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/fastify': { version: '5.6.0' },
        'node_modules/typescript': { version: '5.9.3' },
      },
    }),
  });
  context.after(fixture.cleanup);

  const result = await service().inspect(fixture.project);

  assert.equal(result.status, 'ready');
  assert.equal(result.lockfile, 'present');
  assert.equal(result.lockfileVersion, 3);
  assert.deepEqual(result.dependencies, [
    {
      name: 'fastify',
      kind: 'dependency',
      declaredRange: '^5.0.0',
      resolution: 'resolved',
      resolvedVersion: '5.6.0',
    },
    {
      name: 'typescript',
      kind: 'devDependency',
      declaredRange: '~5.9.0',
      resolution: 'resolved',
      resolvedVersion: '5.9.3',
    },
  ]);
  assert.equal(result.observedAt, NOW.toISOString());
});

test('dependência ausente do lockfile permanece unknown sem inventar versão', async (context) => {
  const fixture = await createProjectFixture({
    'package.json': JSON.stringify({ dependencies: { fastify: '^5.0.0' } }),
    'package-lock.json': JSON.stringify({
      lockfileVersion: 3,
      packages: { '': {} },
    }),
  });
  context.after(fixture.cleanup);

  const result = await service().inspect(fixture.project);

  assert.deepEqual(result.dependencies, [
    {
      name: 'fastify',
      kind: 'dependency',
      declaredRange: '^5.0.0',
      resolution: 'unknown',
    },
  ]);
});

test('funciona offline sem package-lock preservando apenas fatos locais', async (context) => {
  const fixture = await createProjectFixture({
    'package.json': JSON.stringify({ dependencies: { fastify: '^5.0.0' } }),
  });
  context.after(fixture.cleanup);

  const result = await service().inspect(fixture.project);

  assert.equal(result.status, 'ready');
  assert.equal(result.lockfile, 'missing');
  assert.equal(result.dependencies[0]?.resolution, 'unknown');
  assert.match(result.warnings.join(' '), /package-lock\.json ausente/u);
});

test('lockfile incompatível não apaga o inventário declarado', async (context) => {
  const fixture = await createProjectFixture({
    'package.json': JSON.stringify({ dependencies: { fastify: '^5.0.0' } }),
    'package-lock.json': JSON.stringify({
      lockfileVersion: 99,
      packages: {
        'node_modules/fastify': { version: '999.0.0' },
      },
    }),
  });
  context.after(fixture.cleanup);

  const result = await service().inspect(fixture.project);

  assert.equal(result.status, 'ready');
  assert.equal(result.lockfile, 'unsupported');
  assert.equal(result.lockfileVersion, 99);
  assert.equal(result.dependencies[0]?.resolution, 'unknown');
  assert.equal(result.dependencies[0]?.resolvedVersion, undefined);
});

test('package.json estruturalmente inválido falha fechado', async (context) => {
  const fixture = await createProjectFixture({
    'package.json': JSON.stringify({ dependencies: ['fastify'] }),
  });
  context.after(fixture.cleanup);

  const result = await service().inspect(fixture.project);

  assert.equal(result.status, 'invalid');
  assert.deepEqual(result.dependencies, []);
  assert.match(result.warnings.join(' '), /dependências declaradas/u);
});

test('package-lock v1 usa somente resolução direta comprovada', async (context) => {
  const fixture = await createProjectFixture({
    'package.json': JSON.stringify({ dependencies: { fastify: '^4.0.0' } }),
    'package-lock.json': JSON.stringify({
      lockfileVersion: 1,
      dependencies: {
        fastify: { version: '4.29.1' },
      },
    }),
  });
  context.after(fixture.cleanup);

  const result = await service().inspect(fixture.project);

  assert.equal(result.lockfile, 'present');
  assert.equal(result.dependencies[0]?.resolvedVersion, '4.29.1');
});
