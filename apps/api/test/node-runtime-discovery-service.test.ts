import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { NodeRuntimeDiscoveryService } from '../src/services/node-runtime-discovery-service.js';

const OBSERVED_AT = new Date('2026-09-09T18:00:00.000Z');

function project(projectPath: string): Project {
  return {
    id: 'project-1',
    name: 'Projeto',
    path: projectPath,
    type: 'node',
    source: 'workspace',
    workspaceId: 'workspace-1',
    enabled: true,
    capabilities: [],
  };
}

async function withProject(
  context: TestContext,
): Promise<{ path: string; project: Project }> {
  const projectPath = await mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-node-runtime-'),
  );
  context.after(() => rm(projectPath, { recursive: true, force: true }));
  return { path: projectPath, project: project(projectPath) };
}

function service(): NodeRuntimeDiscoveryService {
  return new NodeRuntimeDiscoveryService({ now: () => OBSERVED_AT });
}

test('Node runtime discovery consolida fontes versionadas consistentes', async (context) => {
  const fixture = await withProject(context);
  await Promise.all([
    writeFile(path.join(fixture.path, '.node-version'), '20.18.1\n'),
    writeFile(path.join(fixture.path, '.nvmrc'), 'v20.18.1\n'),
    writeFile(
      path.join(fixture.path, '.tool-versions'),
      'nodejs 20.18.1\nruby 3.3.5\n',
    ),
  ]);

  const result = await service().inspect(fixture.project);

  assert.equal(result.state, 'declared');
  assert.equal(result.version, '20.18.1');
  assert.equal(result.observedAt, OBSERVED_AT.toISOString());
  assert.deepEqual(
    result.declarations.map(({ source, version }) => ({ source, version })),
    [
      { source: '.node-version', version: '20.18.1' },
      { source: '.nvmrc', version: '20.18.1' },
      { source: '.tool-versions#nodejs', version: '20.18.1' },
    ],
  );
});

test('Node runtime discovery falha fechado quando fontes divergem', async (context) => {
  const fixture = await withProject(context);
  await Promise.all([
    writeFile(path.join(fixture.path, '.node-version'), '20.18.1\n'),
    writeFile(path.join(fixture.path, '.nvmrc'), '22.11.0\n'),
  ]);

  const result = await service().inspect(fixture.project);

  assert.equal(result.state, 'conflict');
  assert.equal(result.version, undefined);
  assert.match(result.diagnostic ?? '', /.node-version=20\.18\.1/u);
  assert.match(result.diagnostic ?? '', /.nvmrc=22\.11\.0/u);
});

test('Node runtime discovery não usa aliases nem o runtime da API como prova', async (context) => {
  const fixture = await withProject(context);
  await writeFile(path.join(fixture.path, '.nvmrc'), 'lts/*\n');

  const result = await service().inspect(fixture.project);

  assert.equal(result.state, 'invalid');
  assert.equal(result.version, undefined);
  assert.deepEqual(result.declarations, [{ source: '.nvmrc', raw: 'lts/*' }]);
});

test('Node runtime discovery explicita ausência de evidência versionada', async (context) => {
  const fixture = await withProject(context);

  const result = await service().inspect(fixture.project);

  assert.equal(result.state, 'missing');
  assert.equal(result.version, undefined);
  assert.deepEqual(result.declarations, []);
  assert.equal(result.observedAt, OBSERVED_AT.toISOString());
});
