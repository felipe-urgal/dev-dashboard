import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

const TOKEN = 'a'.repeat(64);

interface StatusResponse {
  available: boolean;
  models: Array<{ name: string; capabilities: string[] }>;
  message: string;
}

test('rotas do assistente de IA (status e chat em streaming)', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-ai-routes-'),
  );

  const { buildApp } = await import('../src/app.js');
  const { createAppContext } = await import('../src/app-context.js');
  const { AiAssistantService } =
    await import('../src/services/ai-assistant-service.js');
  const { ProjectFileService } =
    await import('../src/services/project-file-service.js');
  const { GitService } = await import('../src/services/git-service.js');

  const appContext = createAppContext();
  const project: Project = {
    id: 'p1',
    name: 'sample',
    path: fixtureRoot,
    type: 'node',
    source: 'workspace',
    workspaceId: 'w1',
    favorite: false,
    capabilities: [],
  };
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'w1',
    workspacePath: fixtureRoot,
    projects: [project],
    warnings: [],
  });

  appContext.aiAssistantService = new AiAssistantService(
    new ProjectFileService(),
    new GitService(),
    async (input) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [{ name: 'llama3.1' }] }));
      }
      if (url.endsWith('/api/show')) {
        return new Response(JSON.stringify({ capabilities: ['completion'] }));
      }
      if (url.endsWith('/api/chat')) {
        const body = [
          JSON.stringify({
            message: { role: 'assistant', content: 'Oi' },
            done: false,
          }),
          JSON.stringify({
            message: { role: 'assistant', content: '!' },
            done: true,
          }),
        ].join('\n');
        return new Response(body, { status: 200 });
      }
      if (url.endsWith('/api/generate')) {
        return new Response(JSON.stringify({ response: 'sum(a, b)' }), {
          status: 200,
        });
      }
      throw new Error(`chamada inesperada: ${url}`);
    },
  );

  const app = await buildApp({ localToken: TOKEN, context: appContext });
  context.after(async () => {
    await app.close();
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const headers = { 'x-dev-dashboard-token': TOKEN };

  await context.test('status retorna modelos instalados', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/p1/ai/status',
      headers,
    });
    assert.equal(response.statusCode, 200);
    const status = response.json<StatusResponse>();
    assert.equal(status.available, true);
    assert.deepEqual(status.models, [
      { name: 'llama3.1', capabilities: ['chat'] },
    ]);
  });

  await context.test('status de projeto inexistente retorna 404', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/does-not-exist/ai/status',
      headers,
    });
    assert.equal(response.statusCode, 404);
  });

  await context.test(
    'chat transmite eventos SSE com a resposta do modelo',
    async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects/p1/ai/chat',
        headers: { ...headers, 'content-type': 'application/json' },
        payload: {
          model: 'llama3.1',
          messages: [{ role: 'user', content: 'Oi' }],
        },
      });
      assert.equal(response.statusCode, 200);
      assert.match(response.body, /event: message-delta/);
      assert.match(response.body, /event: done/);
    },
  );

  await context.test('chat recusa corpo inválido pelo schema', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/p1/ai/chat',
      headers: { ...headers, 'content-type': 'application/json' },
      payload: { model: 'llama3.1', messages: [] },
    });
    assert.equal(response.statusCode, 400);
  });

  await context.test(
    'complete retorna o texto sugerido pelo modelo',
    async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects/p1/ai/complete',
        headers: { ...headers, 'content-type': 'application/json' },
        payload: {
          model: 'llama3.1',
          prefix: 'function sum(a, b) {\n  return ',
          suffix: '\n}',
        },
      });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), { text: 'sum(a, b)' });
    },
  );

  await context.test(
    'complete recusa prefixo acima do limite pelo schema',
    async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects/p1/ai/complete',
        headers: { ...headers, 'content-type': 'application/json' },
        payload: { model: 'llama3.1', prefix: 'a'.repeat(5_000) },
      });
      assert.equal(response.statusCode, 400);
    },
  );

  await context.test(
    'complete de projeto inexistente retorna 404',
    async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects/does-not-exist/ai/complete',
        headers: { ...headers, 'content-type': 'application/json' },
        payload: { model: 'llama3.1', prefix: 'const x = ' },
      });
      assert.equal(response.statusCode, 404);
    },
  );

  await context.test('rota exige autenticação', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/p1/ai/status',
    });
    assert.equal(response.statusCode, 401);
  });
});
