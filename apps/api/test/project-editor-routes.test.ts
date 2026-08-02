import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';
import { buildApp } from '../src/app.js';
import { createAppContext } from '../src/app-context.js';
import { ProjectEditorService } from '../src/services/project-editor-service.js';

const TOKEN = 'e'.repeat(64);

test('consulta o catálogo e abre somente o editor autorizado para o projeto', async (context) => {
  const launches: Array<{ command: string; projectPath: string }> = [];
  const appContext = createAppContext();
  appContext.projectEditorService = new ProjectEditorService({
    environment: { PATH: '/bin', DEV_EDITOR: 'code' },
    resolveExecutable: async (command) =>
      command === 'code' ? '/bin/code' : null,
    launch: async (command, projectPath) => {
      launches.push({ command, projectPath });
    },
  });
  const project: Project = {
    id: 'painel',
    workspaceId: 'workspace',
    name: 'Painel',
    path: '/projetos/painel',
    type: 'node',
    source: 'workspace',
    favorite: false,
    capabilities: [],
  };
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'workspace',
    workspacePath: '/projetos',
    projects: [project],
    warnings: [],
  });
  const app = await buildApp({ localToken: TOKEN, context: appContext });
  context.after(() => app.close());
  const headers = { 'x-dev-dashboard-token': TOKEN };

  const availability = await app.inject({
    method: 'GET',
    url: '/api/projects/painel/editors',
    headers,
  });
  assert.equal(availability.statusCode, 200);
  assert.deepEqual(availability.json(), {
    editors: [{ id: 'vscode', name: 'Visual Studio Code' }],
    preferredEditorId: 'vscode',
  });

  const opened = await app.inject({
    method: 'POST',
    url: '/api/projects/painel/editor',
    headers,
    payload: { editorId: 'vscode' },
  });
  assert.equal(opened.statusCode, 200);
  assert.deepEqual(opened.json(), {
    editor: { id: 'vscode', name: 'Visual Studio Code' },
    opened: true,
  });
  assert.deepEqual(launches, [{
    command: '/bin/code',
    projectPath: '/projetos/painel',
  }]);
});

test('não aceita projeto ausente nem identificador fora do catálogo', async (context) => {
  const app = await buildApp({ localToken: TOKEN });
  context.after(() => app.close());
  const headers = { 'x-dev-dashboard-token': TOKEN };

  const missing = await app.inject({
    method: 'GET',
    url: '/api/projects/inexistente/editors',
    headers,
  });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json().error, 'PROJECT_NOT_FOUND');

  const invalid = await app.inject({
    method: 'POST',
    url: '/api/projects/inexistente/editor',
    headers,
    payload: { editorId: 'bash' },
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.json().error, 'VALIDATION_ERROR');
});
