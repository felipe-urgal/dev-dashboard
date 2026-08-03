import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';
import { buildApp } from '../src/app.js';
import { createAppContext } from '../src/app-context.js';

const TOKEN = 'f'.repeat(64);

test('lista, lê e busca arquivos do projeto autorizado', async (context) => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'dev-dashboard-route-files-'));
  context.after(() => rm(projectPath, { recursive: true, force: true }));
  await mkdir(path.join(projectPath, 'src'), { recursive: true });
  await writeFile(path.join(projectPath, 'src', 'index.ts'), 'export const value = 1;\n');

  const appContext = createAppContext();
  const project: Project = {
    id: 'painel',
    workspaceId: 'workspace',
    name: 'Painel',
    path: projectPath,
    type: 'node',
    source: 'workspace',
    favorite: false,
    capabilities: [],
  };
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'workspace',
    workspacePath: path.dirname(projectPath),
    projects: [project],
    warnings: [],
  });

  const app = await buildApp({ localToken: TOKEN, context: appContext });
  context.after(() => app.close());
  const headers = { 'x-dev-dashboard-token': TOKEN };

  const listing = await app.inject({
    method: 'GET',
    url: '/api/projects/painel/files',
    headers,
  });
  assert.equal(listing.statusCode, 200);
  assert.deepEqual(listing.json().entries, [
    { path: 'src', name: 'src', kind: 'directory' },
  ]);

  const content = await app.inject({
    method: 'GET',
    url: '/api/projects/painel/files/content?path=src%2Findex.ts',
    headers,
  });
  assert.equal(content.statusCode, 200);
  assert.equal(content.json().content, 'export const value = 1;\n');
  assert.equal(content.json().writable, false);

  const search = await app.inject({
    method: 'GET',
    url: '/api/projects/painel/files/search?query=value',
    headers,
  });
  assert.equal(search.statusCode, 200);
  assert.deepEqual(search.json().items.map((item: { path: string }) => item.path), [
    'src/index.ts',
  ]);
});

test('recusa projeto ausente, traversal e query inválida', async (context) => {
  const app = await buildApp({ localToken: TOKEN });
  context.after(() => app.close());
  const headers = { 'x-dev-dashboard-token': TOKEN };

  const missing = await app.inject({
    method: 'GET',
    url: '/api/projects/ausente/files',
    headers,
  });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json().error, 'PROJECT_NOT_FOUND');

  const invalidSearch = await app.inject({
    method: 'GET',
    url: '/api/projects/ausente/files/search?query=x',
    headers,
  });
  assert.equal(invalidSearch.statusCode, 400);
  assert.equal(invalidSearch.json().error, 'VALIDATION_ERROR');
});
