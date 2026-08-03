import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';
import { buildApp } from '../src/app.js';
import { createAppContext } from '../src/app-context.js';

const TOKEN = 'f'.repeat(64);

async function fixture(context: test.TestContext) {
  const projectPath = await mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-workspace-routes-'),
  );
  context.after(() => rm(projectPath, { recursive: true, force: true }));
  await mkdir(path.join(projectPath, 'src'));
  await writeFile(path.join(projectPath, 'src', 'one.ts'), 'const one = 1;\n');
  await writeFile(path.join(projectPath, 'src', 'two.ts'), 'const two = 2;\n');

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
  return {
    app,
    projectPath,
    headers: { 'x-dev-dashboard-token': TOKEN },
  };
}

test('monitora arquivo aberto e aplica WorkspaceEdit após preview', async (context) => {
  const { app, projectPath, headers } = await fixture(context);

  const one = await app.inject({
    method: 'GET',
    url: '/api/projects/painel/files/content?path=src%2Fone.ts',
    headers,
  });
  const two = await app.inject({
    method: 'GET',
    url: '/api/projects/painel/files/content?path=src%2Ftwo.ts',
    headers,
  });
  assert.equal(one.statusCode, 200);
  assert.equal(two.statusCode, 200);

  const unchanged = await app.inject({
    method: 'POST',
    url: '/api/projects/painel/files/watch',
    headers,
    payload: {
      files: [{ path: 'src/one.ts', version: one.json().version }],
    },
  });
  assert.equal(unchanged.statusCode, 200);
  assert.equal(unchanged.json().items[0].state, 'unchanged');

  await writeFile(path.join(projectPath, 'src', 'one.ts'), 'const one = 10;\n');
  const changed = await app.inject({
    method: 'POST',
    url: '/api/projects/painel/files/watch',
    headers,
    payload: {
      files: [{ path: 'src/one.ts', version: one.json().version }],
    },
  });
  assert.equal(changed.statusCode, 200);
  assert.equal(changed.json().items[0].state, 'changed');
  assert.equal(changed.json().items[0].file.content, 'const one = 10;\n');

  const currentOne = changed.json().items[0].file;
  const preview = await app.inject({
    method: 'POST',
    url: '/api/projects/painel/files/workspace-edits/preview',
    headers,
    payload: {
      files: [
        {
          path: 'src/one.ts',
          expectedVersion: currentOne.version,
          edits: [{
            range: {
              start: { line: 1, column: 13 },
              end: { line: 1, column: 15 },
            },
            newText: '100',
          }],
        },
        {
          path: 'src/two.ts',
          expectedVersion: two.json().version,
          edits: [{
            range: {
              start: { line: 1, column: 13 },
              end: { line: 1, column: 14 },
            },
            newText: '20',
          }],
        },
      ],
    },
  });
  assert.equal(preview.statusCode, 200);
  assert.equal(preview.json().files[0].afterContent, 'const one = 100;\n');
  assert.equal(preview.json().files[1].afterContent, 'const two = 20;\n');

  const applied = await app.inject({
    method: 'POST',
    url: '/api/projects/painel/files/workspace-edits/apply',
    headers,
    payload: { confirmationToken: preview.json().confirmationToken },
  });
  assert.equal(applied.statusCode, 200);
  assert.equal(applied.json().files.length, 2);
  assert.equal(
    await readFile(path.join(projectPath, 'src', 'one.ts'), 'utf8'),
    'const one = 100;\n',
  );
  assert.equal(
    await readFile(path.join(projectPath, 'src', 'two.ts'), 'utf8'),
    'const two = 20;\n',
  );
});

test('recusa preview obsoleto e token reutilizado', async (context) => {
  const { app, projectPath, headers } = await fixture(context);
  const content = await app.inject({
    method: 'GET',
    url: '/api/projects/painel/files/content?path=src%2Fone.ts',
    headers,
  });

  const preview = await app.inject({
    method: 'POST',
    url: '/api/projects/painel/files/workspace-edits/preview',
    headers,
    payload: {
      files: [{
        path: 'src/one.ts',
        expectedVersion: content.json().version,
        edits: [{
          range: {
            start: { line: 1, column: 13 },
            end: { line: 1, column: 14 },
          },
          newText: '10',
        }],
      }],
    },
  });
  assert.equal(preview.statusCode, 200);

  await writeFile(path.join(projectPath, 'src', 'one.ts'), 'const external = true;\n');
  const changed = await app.inject({
    method: 'POST',
    url: '/api/projects/painel/files/workspace-edits/apply',
    headers,
    payload: { confirmationToken: preview.json().confirmationToken },
  });
  assert.equal(changed.statusCode, 409);
  assert.equal(changed.json().error, 'WORKSPACE_EDIT_CHANGED_EXTERNALLY');

  const reused = await app.inject({
    method: 'POST',
    url: '/api/projects/painel/files/workspace-edits/apply',
    headers,
    payload: { confirmationToken: preview.json().confirmationToken },
  });
  assert.equal(reused.statusCode, 409);
  assert.equal(reused.json().error, 'WORKSPACE_EDIT_CONFIRMATION_REQUIRED');
});
