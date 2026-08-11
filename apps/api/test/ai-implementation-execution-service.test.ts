import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  AiChatMessage,
  AiChatStreamEvent,
  Project,
} from '@dev-dashboard/contracts';

import type { AiAssistantService } from '../src/services/ai-assistant-service.js';
import { AiImplementationExecutionService } from '../src/services/ai-implementation-execution-service.js';

const project: Project = {
  id: 'painel',
  name: 'Painel',
  path: '/tmp/painel',
  type: 'node',
  source: 'workspace',
  workspaceId: 'workspace',
  favorite: false,
  enabled: true,
  capabilities: [],
};

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('mantém a execução ativa fora da conexão da interface', async () => {
  const gate = deferred<void>();
  let sent: ((event: AiChatStreamEvent) => void) | undefined;
  let receivedMessages: AiChatMessage[] = [];
  const assistant = {
    async chat(
      _project: Project,
      _model: string,
      messages: AiChatMessage[],
      handlers: {
        signal: AbortSignal;
        send: (event: AiChatStreamEvent) => void;
      },
    ): Promise<void> {
      receivedMessages = messages;
      sent = handlers.send;
      handlers.send({
        type: 'tool-call',
        tool: 'list_project_files',
        arguments: {},
      });
      handlers.send({
        type: 'tool-result',
        tool: 'list_project_files',
        ok: true,
        summary: 'Diretório listado.',
      });
      await gate.promise;
      handlers.send({ type: 'done' });
    },
  };
  const service = new AiImplementationExecutionService(assistant);

  const started = service.start(project, 'qwen2.5-coder:14b', 'Criar testes');
  assert.equal(started.status, 'running');
  assert.equal(started.provider, 'ollama');
  assert.equal(started.mode, 'fast');
  assert.equal(receivedMessages.at(-1)?.content, 'Criar testes');

  const systemPrompt = receivedMessages[0]?.content ?? '';
  assert.match(systemPrompt, /inspecione o projeto/i);
  assert.match(systemPrompt, /search_project_text/);
  assert.match(systemPrompt, /list_project_files/);
  assert.match(systemPrompt, /read_project_file/);
  assert.match(systemPrompt, /Nunca invente nomes ou caminhos de arquivos/);

  // A leitura posterior simula voltar à aba depois de navegar pelo projeto.
  const whileAway = service.find(project.id, started.id);
  assert.equal(whileAway?.status, 'running');
  assert.equal(whileAway?.events[0]?.type, 'tool-call');

  gate.resolve();
  await new Promise((resolve) => setImmediate(resolve));

  const finished = service.find(project.id, started.id);
  assert.equal(finished?.status, 'succeeded');
  assert.ok(sent);
});

test('congela provider e modo antes da resolução assíncrona', async () => {
  let selectedProvider: 'ollama' | 'openai' = 'openai';
  const resolvedProviders: string[] = [];
  let receivedMode = '';
  const openAiAssistant = {
    async chat(
      _project: Project,
      _model: string,
      _messages: AiChatMessage[],
      handlers: {
        signal: AbortSignal;
        send: (event: AiChatStreamEvent) => void;
      },
      mode?: 'fast' | 'complete',
    ): Promise<void> {
      receivedMode = mode ?? '';
      handlers.send({
        type: 'tool-call',
        tool: 'list_project_files',
        arguments: {},
      });
      handlers.send({
        type: 'tool-result',
        tool: 'list_project_files',
        ok: true,
        summary: 'Diretório listado.',
      });
      handlers.send({ type: 'done' });
    },
  };
  const resolver = {
    getSelection: () => ({
      provider: selectedProvider,
      mode: 'complete' as const,
    }),
    resolve: async (_projectId: string, provider: 'ollama' | 'openai') => {
      resolvedProviders.push(provider);
      return openAiAssistant as unknown as AiAssistantService;
    },
  };
  const service = new AiImplementationExecutionService(
    { chat: async () => undefined },
    undefined,
    resolver,
  );

  const started = service.start(project, 'gpt-5-mini', 'Criar testes');
  selectedProvider = 'ollama';

  assert.equal(started.provider, 'openai');
  assert.equal(started.mode, 'complete');

  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(resolvedProviders, ['openai']);
  assert.equal(receivedMode, 'complete');
  assert.equal(service.find(project.id, started.id)?.status, 'succeeded');
});

test('falha se o modelo responder sem inspecionar o projeto', async () => {
  const assistant = {
    async chat(
      _project: Project,
      _model: string,
      _messages: AiChatMessage[],
      handlers: {
        signal: AbortSignal;
        send: (event: AiChatStreamEvent) => void;
      },
    ): Promise<void> {
      handlers.send({
        type: 'message-delta',
        content: 'Troque a classe para três colunas.',
      });
      handlers.send({ type: 'done' });
    },
  };
  const service = new AiImplementationExecutionService(assistant);

  const started = service.start(
    project,
    'qwen2.5-coder:7b',
    'como que eu faço para a listagem de ferramentas ficar com 3 colunas?',
  );
  await new Promise((resolve) => setImmediate(resolve));

  const finished = service.find(project.id, started.id);
  assert.equal(finished?.status, 'failed');
  assert.equal(
    finished?.events.some((event) => event.type === 'message-delta'),
    false,
  );
  const error = finished?.events.find((event) => event.type === 'error');
  assert.equal(error?.type, 'error');
  if (error?.type === 'error') assert.match(error.message, /não inspecionou/i);
});

test('bloqueia propose_workspace_edit antes de inspeção bem-sucedida', async () => {
  const assistant = {
    async chat(
      _project: Project,
      _model: string,
      _messages: AiChatMessage[],
      handlers: {
        signal: AbortSignal;
        send: (event: AiChatStreamEvent) => void;
      },
    ): Promise<void> {
      handlers.send({
        type: 'tool-call',
        tool: 'propose_workspace_edit',
        arguments: { files: [] },
      });
    },
  };
  const service = new AiImplementationExecutionService(assistant);

  const started = service.start(
    project,
    'qwen2.5-coder:7b',
    'Ajustar a listagem de ferramentas.',
  );
  await new Promise((resolve) => setImmediate(resolve));

  const finished = service.find(project.id, started.id);
  assert.equal(finished?.status, 'failed');
  assert.equal(
    finished?.events.some(
      (event) =>
        event.type === 'tool-call' && event.tool === 'propose_workspace_edit',
    ),
    false,
  );
  const error = finished?.events.find((event) => event.type === 'error');
  assert.equal(error?.type, 'error');
  if (error?.type === 'error') assert.match(error.message, /Antes de propor/);
});

test('cancelamento é explícito e interrompe a execução em memória', async () => {
  let aborted = false;
  const assistant = {
    async chat(
      _project: Project,
      _model: string,
      _messages: AiChatMessage[],
      handlers: {
        signal: AbortSignal;
        send: (event: AiChatStreamEvent) => void;
      },
    ): Promise<void> {
      await new Promise<void>((resolve) => {
        handlers.signal.addEventListener('abort', () => {
          aborted = true;
          resolve();
        });
      });
    },
  };
  const service = new AiImplementationExecutionService(assistant);
  const started = service.start(project, 'qwen2.5-coder:14b', 'Cancelar');

  const cancelled = service.cancel(project.id, started.id);
  assert.equal(cancelled?.status, 'cancelled');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(aborted, true);
});
