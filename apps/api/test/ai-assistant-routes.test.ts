import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import type { AiAssistantService as AiAssistantServiceType } from '../src/services/ai-assistant-service.js';
import type { AiProviderResolver as AiProviderResolverType } from '../src/services/ai-provider-resolver.js';

const TOKEN = 'a'.repeat(64);

interface StatusResponse {
  available: boolean;
  models: Array<{ name: string; capabilities: string[] }>;
  message: string;
}

test('rotas do assistente de IA resolvem o provider do projeto', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-ai-routes-'),
  );

  const { buildApp } = await import('../src/app.js');
  const { createAppContext } = await import('../src/app-context.js');
  const { AiAssistantService } =
    await import('../src/services/ai-assistant-service.js');
  const { AiImplementationExecutionService } =
    await import('../src/services/ai-implementation-execution-service.js');
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
    enabled: true,
    capabilities: [],
  };
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'w1',
    workspacePath: fixtureRoot,
    projects: [project],
    warnings: [],
  });

  let localChatCalls = 0;
  let localCompleteCalls = 0;
  let localPullCalls = 0;
  const localAssistant = new AiAssistantService({
    projectFileService: new ProjectFileService(),
    gitService: new GitService(),
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [{ name: 'llama3.1' }] }));
      }
      if (url.endsWith('/api/show')) {
        return new Response(JSON.stringify({ capabilities: ['completion'] }));
      }
      if (url.endsWith('/api/chat')) {
        localChatCalls += 1;
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
        localCompleteCalls += 1;
        return new Response(JSON.stringify({ response: 'sum(a, b)' }), {
          status: 200,
        });
      }
      if (url.endsWith('/api/pull')) {
        localPullCalls += 1;
        return new Response(
          `${JSON.stringify({ status: 'success', completed: 1, total: 1 })}\n`,
          { status: 200 },
        );
      }
      throw new Error(`chamada inesperada: ${url}`);
    },
  });

  let cloudChatCalls = 0;
  let cloudCompleteCalls = 0;
  let cloudPullCalls = 0;
  const cloudAssistant = {
    status: async () => ({
      available: true,
      message: 'OpenAI disponível.',
      models: [{ name: 'gpt-5', capabilities: ['chat', 'tools'] }],
    }),
    chat: async (
      _project: Project,
      _model: string,
      _messages: unknown[],
      handlers: {
        send: (event: unknown) => void;
        signal: AbortSignal;
      },
      mode?: 'fast' | 'complete',
    ) => {
      cloudChatCalls += 1;
      assert.equal(mode, 'complete');
      handlers.send({ type: 'message-delta', content: 'Resposta OpenAI.' });
      handlers.send({ type: 'done' });
    },
    complete: async () => {
      cloudCompleteCalls += 1;
      return { text: 'cloud(a, b)' };
    },
    pullRecommendedModel: async () => {
      cloudPullCalls += 1;
      throw new Error(
        'O provider de IA atual não permite instalar modelos pelo dashboard.',
      );
    },
  } as unknown as AiAssistantServiceType;

  let selectedProvider: 'ollama' | 'openai' = 'ollama';
  let selectedMode: 'fast' | 'complete' = 'fast';
  const providerResolver = {
    getSelection: () => ({ provider: selectedProvider, mode: selectedMode }),
    status: async () => {
      const localStatus = await localAssistant.status();
      const cloudStatus = await cloudAssistant.status();
      return {
        selectedProvider,
        selectedMode,
        providers: [
          {
            ...localStatus,
            id: 'ollama' as const,
            label: 'Local',
            kind: 'local' as const,
            consentRequired: false,
            consentGranted: true,
          },
          {
            ...cloudStatus,
            id: 'openai' as const,
            label: 'OpenAI',
            kind: 'cloud' as const,
            consentRequired: true,
            consentGranted: true,
          },
        ],
      };
    },
    resolveSelected: async () => ({
      assistantService:
        selectedProvider === 'openai' ? cloudAssistant : localAssistant,
      provider: selectedProvider,
      mode: selectedMode,
    }),
    resolve: async (_projectId: string, provider: 'ollama' | 'openai') =>
      provider === 'openai' ? cloudAssistant : localAssistant,
    setSelection: async (
      _projectId: string,
      provider: 'ollama' | 'openai',
      mode: 'fast' | 'complete',
    ) => {
      selectedProvider = provider;
      selectedMode = mode;
    },
    setCloudConsent: async () => undefined,
  } as unknown as AiProviderResolverType;

  appContext.aiAssistantService = localAssistant;
  appContext.aiProviderResolver = providerResolver;
  appContext.aiImplementationExecutionService =
    new AiImplementationExecutionService(
      localAssistant,
      undefined,
      providerResolver,
    );

  const app = await buildApp({ localToken: TOKEN, context: appContext });
  context.after(async () => {
    await app.close();
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const headers = { 'x-dev-dashboard-token': TOKEN };

  await context.test('status retorna o provider selecionado', async () => {
    selectedProvider = 'ollama';
    selectedMode = 'fast';
    const localResponse = await app.inject({
      method: 'GET',
      url: '/api/projects/p1/ai/status',
      headers,
    });
    assert.equal(localResponse.statusCode, 200);
    assert.deepEqual(localResponse.json<StatusResponse>().models, [
      { name: 'llama3.1', capabilities: ['chat'] },
    ]);

    selectedProvider = 'openai';
    selectedMode = 'complete';
    const cloudResponse = await app.inject({
      method: 'GET',
      url: '/api/projects/p1/ai/status',
      headers,
    });
    assert.equal(cloudResponse.statusCode, 200);
    assert.deepEqual(cloudResponse.json<StatusResponse>().models, [
      { name: 'gpt-5', capabilities: ['chat', 'tools'] },
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
    'chat transmite eventos SSE com o provider local selecionado',
    async () => {
      selectedProvider = 'ollama';
      selectedMode = 'fast';
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
      assert.equal(localChatCalls, 1);
    },
  );

  await context.test(
    'chat usa OpenAI quando esse é o provider selecionado',
    async () => {
      selectedProvider = 'openai';
      selectedMode = 'complete';
      const localCallsBefore = localChatCalls;
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects/p1/ai/chat',
        headers: { ...headers, 'content-type': 'application/json' },
        payload: {
          model: 'gpt-5',
          messages: [{ role: 'user', content: 'Oi cloud' }],
        },
      });
      assert.equal(response.statusCode, 200);
      assert.match(response.body, /Resposta OpenAI/);
      assert.equal(cloudChatCalls, 1);
      assert.equal(localChatCalls, localCallsBefore);
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
    'implementação continua disponível para consulta depois de iniciada',
    async () => {
      selectedProvider = 'ollama';
      selectedMode = 'fast';
      const started = await app.inject({
        method: 'POST',
        url: '/api/projects/p1/ai/implementations',
        headers: { ...headers, 'content-type': 'application/json' },
        payload: { model: 'llama3.1', prompt: 'Adicionar um teste simples' },
      });
      assert.equal(started.statusCode, 201);
      const execution = started.json<{ execution: { id: string } }>().execution;
      assert.ok(execution.id);

      const listed = await app.inject({
        method: 'GET',
        url: '/api/projects/p1/ai/implementations',
        headers,
      });
      assert.equal(listed.statusCode, 200);
      assert.equal(
        listed.json<{ execution: { id: string } | null }>().execution?.id,
        execution.id,
      );
    },
  );

  await context.test(
    'implementação valida prompt antes de iniciar',
    async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects/p1/ai/implementations',
        headers: { ...headers, 'content-type': 'application/json' },
        payload: { model: 'llama3.1', prompt: 'x' },
      });
      assert.equal(response.statusCode, 400);
    },
  );

  await context.test(
    'complete retorna o texto sugerido pelo provider local selecionado',
    async () => {
      selectedProvider = 'ollama';
      selectedMode = 'fast';
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
      assert.equal(localCompleteCalls, 1);
    },
  );

  await context.test(
    'complete usa OpenAI sem cair silenciosamente no Ollama',
    async () => {
      selectedProvider = 'openai';
      selectedMode = 'complete';
      const localCallsBefore = localCompleteCalls;
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects/p1/ai/complete',
        headers: { ...headers, 'content-type': 'application/json' },
        payload: {
          model: 'gpt-5',
          prefix: 'function cloud(a, b) {\n  return ',
          suffix: '\n}',
        },
      });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), { text: 'cloud(a, b)' });
      assert.equal(cloudCompleteCalls, 1);
      assert.equal(localCompleteCalls, localCallsBefore);
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

  await context.test(
    'pull de modelo respeita a capability do provider selecionado',
    async () => {
      selectedProvider = 'openai';
      selectedMode = 'complete';
      const localPullCallsBefore = localPullCalls;
      const cloudResponse = await app.inject({
        method: 'POST',
        url: '/api/projects/p1/ai/models/pull',
        headers: { ...headers, 'content-type': 'application/json' },
        payload: { model: 'qwen2.5-coder:7b' },
      });
      assert.equal(cloudResponse.statusCode, 200);
      assert.match(cloudResponse.body, /event: error/);
      assert.match(cloudResponse.body, /não permite instalar modelos/i);
      assert.equal(cloudPullCalls, 1);
      assert.equal(localPullCalls, localPullCallsBefore);

      selectedProvider = 'ollama';
      selectedMode = 'fast';
      const localResponse = await app.inject({
        method: 'POST',
        url: '/api/projects/p1/ai/models/pull',
        headers: { ...headers, 'content-type': 'application/json' },
        payload: { model: 'qwen2.5-coder:7b' },
      });
      assert.equal(localResponse.statusCode, 200);
      assert.match(localResponse.body, /event: done/);
      assert.equal(localPullCalls, localPullCallsBefore + 1);
      assert.equal(cloudPullCalls, 1);
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
