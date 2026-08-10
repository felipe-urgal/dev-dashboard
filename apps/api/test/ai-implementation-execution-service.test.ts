import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  AiChatMessage,
  AiChatStreamEvent,
  Project,
} from '@dev-dashboard/contracts';

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
      await gate.promise;
      handlers.send({ type: 'done' });
    },
  };
  const service = new AiImplementationExecutionService(assistant);

  const started = service.start(project, 'qwen2.5-coder:14b', 'Criar testes');
  assert.equal(started.status, 'running');
  assert.equal(receivedMessages.at(-1)?.content, 'Criar testes');

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
