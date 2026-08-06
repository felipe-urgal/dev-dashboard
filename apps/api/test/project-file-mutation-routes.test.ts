import assert from 'node:assert/strict';
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';
import { buildApp } from '../src/app.js';
import { createAppContext } from '../src/app-context.js';

const TOKEN = 'e'.repeat(64);

test('cria, revisa, renomeia e exclui itens do projeto autorizado', async (context) => {
  const projectPath = await mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-route-file-mutations-'),
  );
  context.after(() => rm(projectPath, { recursive: true, force: true }));
  await mkdir(path.join(projectPath, 'src'), { recursive: true });
  await writeFile(
    path.join(projectPath, 'src', 'index.ts'),
    'export const value = 1;\n',
  );

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

  const created = await app.inject({
    method: 'POST',
    url: '/api/projects/painel/files/entries',
    headers,
    payload: {
      path: 'src/generated.ts',
      kind: 'file',
      content: 'export {};\n',
    },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().path, 'src/generated.ts');

  const previewRename = await app.inject({
    method: 'POST',
    url: '/api/projects/painel/files/mutations/preview',
    headers,
    payload: {
      operation: 'rename',
      path: 'src/generated.ts',
      destinationPath: 'src/model.ts',
    },
  });
  assert.equal(previewRename.statusCode, 200);
  assert.equal(previewRename.json().affectedFiles, 1);

  const renamed = await app.inject({
    method: 'POST',
    url: '/api/projects/painel/files/mutations/apply',
    headers,
    payload: {
      confirmationToken: previewRename.json().confirmationToken,
    },
  });
  assert.equal(renamed.statusCode, 200);
  assert.equal(renamed.json().destinationPath, 'src/model.ts');
  assert.equal(
    await readFile(path.join(projectPath, 'src', 'model.ts'), 'utf8'),
    'export {};\n',
  );

  const createdDirectory = await app.inject({
    method: 'POST',
    url: '/api/projects/painel/files/entries',
    headers,
    payload: {
      path: 'src/nested',
      kind: 'directory',
    },
  });
  assert.equal(createdDirectory.statusCode, 201);
  await writeFile(
    path.join(projectPath, 'src', 'nested', 'child.txt'),
    'child\n',
  );

  const previewDelete = await app.inject({
    method: 'POST',
    url: '/api/projects/painel/files/mutations/preview',
    headers,
    payload: {
      operation: 'delete',
      path: 'src/nested',
    },
  });
  assert.equal(previewDelete.statusCode, 200);
  assert.equal(previewDelete.json().requiresPhrase, true);

  const rejectedDelete = await app.inject({
    method: 'POST',
    url: '/api/projects/painel/files/mutations/apply',
    headers,
    payload: {
      confirmationToken: previewDelete.json().confirmationToken,
      confirmationPhrase: 'nested',
    },
  });
  assert.equal(rejectedDelete.statusCode, 409);

  const secondPreview = await app.inject({
    method: 'POST',
    url: '/api/projects/painel/files/mutations/preview',
    headers,
    payload: {
      operation: 'delete',
      path: 'src/nested',
    },
  });
  const deleted = await app.inject({
    method: 'POST',
    url: '/api/projects/painel/files/mutations/apply',
    headers,
    payload: {
      confirmationToken: secondPreview.json().confirmationToken,
      confirmationPhrase: 'src/nested',
    },
  });
  assert.equal(deleted.statusCode, 200);
  await assert.rejects(access(path.join(projectPath, 'src', 'nested')));
});

test('recusa colisão e projeto inexistente', async (context) => {
  const app = await buildApp({ localToken: TOKEN });
  context.after(() => app.close());
  const headers = { 'x-dev-dashboard-token': TOKEN };

  const missing = await app.inject({
    method: 'POST',
    url: '/api/projects/ausente/files/entries',
    headers,
    payload: { path: 'src/new.ts', kind: 'file' },
  });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json().error, 'PROJECT_NOT_FOUND');
});
