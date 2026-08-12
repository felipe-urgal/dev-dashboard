import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

const TOKEN = 't'.repeat(64);

interface StatusResponse {
  kind: string;
  supported: boolean;
  activeSessions: number;
  message: string;
}
interface ConfirmationResponse {
  confirmation: { token: string; expiresAt: string };
}
interface ErrorResponse {
  error?: string;
}

test('rotas de terminal/console do projeto', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-terminal-routes-'),
  );
  const projectPath = path.join(fixtureRoot, 'sample');
  await mkdir(projectPath, { recursive: true });

  const { buildApp } = await import('../src/app.js');
  const { createAppContext } = await import('../src/app-context.js');

  const appContext = createAppContext();
  const railsProject: Project = {
    id: 'rails-project',
    name: 'sample',
    path: projectPath,
    type: 'rails',
    source: 'workspace',
    workspaceId: 'w1',
    enabled: true,
    capabilities: [],
  };
  const nodeProject: Project = {
    ...railsProject,
    id: 'node-project',
    type: 'node',
  };
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'w1',
    workspacePath: fixtureRoot,
    projects: [railsProject, nodeProject],
    warnings: [],
  });

  const app = await buildApp({ localToken: TOKEN, context: appContext });
  context.after(async () => {
    await app.close();
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const headers = {
    'x-dev-dashboard-token': TOKEN,
    'content-type': 'application/json',
  };

  await context.test(
    'status shell disponível para qualquer projeto',
    async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/projects/node-project/terminal/shell',
        headers,
      });
      assert.equal(response.statusCode, 200);
      const status = response.json<StatusResponse>();
      assert.equal(status.kind, 'shell');
      assert.equal(status.supported, true);
      assert.equal(status.activeSessions, 0);
    },
  );

  await context.test(
    'status rails-console indisponível para projeto Node',
    async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/projects/node-project/terminal/rails-console',
        headers,
      });
      assert.equal(response.statusCode, 200);
      assert.equal(response.json<StatusResponse>().supported, false);
    },
  );

  await context.test(
    'status rails-console disponível para projeto Rails',
    async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/projects/rails-project/terminal/rails-console',
        headers,
      });
      assert.equal(response.statusCode, 200);
      assert.equal(response.json<StatusResponse>().supported, true);
    },
  );

  await context.test('kind inválido é rejeitado pelo schema', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/rails-project/terminal/bash',
      headers,
    });
    assert.equal(response.statusCode, 400);
  });

  await context.test('projeto inexistente retorna 404', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/does-not-exist/terminal/shell',
      headers,
    });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json<ErrorResponse>().error, 'PROJECT_NOT_FOUND');
  });

  await context.test('prepara confirmação para abrir uma sessão', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/rails-project/terminal/shell/confirmations',
      headers,
      payload: {},
    });
    assert.equal(response.statusCode, 201);
    const { confirmation } = response.json<ConfirmationResponse>();
    assert.equal(confirmation.token.length, 64);
  });

  await context.test('rota de status exige autenticação', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/rails-project/terminal/shell',
    });
    assert.equal(response.statusCode, 401);
  });

  await context.test('rota de confirmação exige autenticação', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/rails-project/terminal/shell/confirmations',
      payload: {},
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(response.statusCode, 401);
  });
});
