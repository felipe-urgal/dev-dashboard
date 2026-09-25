import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  AgentConversationStore,
  AgentConversationStoreError,
} from '../src/conversation-store.js';

function conversationPath(root: string, taskId: string): string {
  const key = createHash('sha256').update(taskId).digest('hex');
  return path.join(root, 'conversations', `${key}.json`);
}

test('AgentConversationStore persiste turnos em ordem e sobrevive a restart', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-conversation-store-'));
  context.after(() => rm(root, { recursive: true, force: true }));

  const store = new AgentConversationStore({ stateDirectory: root });
  await store.append({
    id: 'turn-user-1',
    taskId: 'task-1',
    role: 'user',
    content: 'Pode seguir com a implementação.',
    createdAt: '2026-09-25T14:00:00.000Z',
  });
  await store.append({
    id: 'turn-agent-1',
    taskId: 'task-1',
    role: 'agent',
    content: 'Implementação concluída.',
    createdAt: '2026-09-25T14:01:00.000Z',
    executionId: 'execution-1',
    providerId: 'codex',
  });

  const restarted = new AgentConversationStore({ stateDirectory: root });
  assert.deepEqual(await restarted.list('task-1'), [
    {
      id: 'turn-user-1',
      taskId: 'task-1',
      role: 'user',
      content: 'Pode seguir com a implementação.',
      createdAt: '2026-09-25T14:00:00.000Z',
    },
    {
      id: 'turn-agent-1',
      taskId: 'task-1',
      role: 'agent',
      content: 'Implementação concluída.',
      createdAt: '2026-09-25T14:01:00.000Z',
      executionId: 'execution-1',
      providerId: 'codex',
    },
  ]);

  const filePath = conversationPath(root, 'task-1');
  assert.equal((await stat(filePath)).mode & 0o777, 0o600);
  const serialized = await readFile(filePath, 'utf8');
  assert.doesNotMatch(serialized, /cwd|argv/i);
});

test('AgentConversationStore reaplica o mesmo turnId de forma idempotente', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'agent-conversation-idempotent-'),
  );
  context.after(() => rm(root, { recursive: true, force: true }));

  const store = new AgentConversationStore({ stateDirectory: root });
  const turn = {
    id: 'turn-1',
    taskId: 'task-1',
    role: 'user' as const,
    content: 'Rode os testes novamente.',
    createdAt: '2026-09-25T14:02:00.000Z',
  };

  assert.deepEqual(await store.append(turn), turn);
  assert.deepEqual(await store.append(turn), turn);
  assert.equal((await store.list('task-1')).length, 1);

  await assert.rejects(
    store.append({ ...turn, content: 'Conteúdo divergente.' }),
    (error: unknown) =>
      error instanceof AgentConversationStoreError &&
      error.code === 'AGENT_CONVERSATION_CONFLICT',
  );
});

test('AgentConversationStore serializa appends concorrentes por task', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'agent-conversation-concurrent-'),
  );
  context.after(() => rm(root, { recursive: true, force: true }));

  const store = new AgentConversationStore({ stateDirectory: root });
  await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      store.append({
        id: `turn-${index}`,
        taskId: 'task-1',
        role: 'user',
        content: `Mensagem ${index}`,
        createdAt: new Date(
          Date.UTC(2026, 8, 25, 14, 3, index),
        ).toISOString(),
      }),
    ),
  );

  assert.equal((await store.list('task-1')).length, 8);
});

test('AgentConversationStore mantém metadata de provider fora de turnos do usuário', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-conversation-provider-'));
  context.after(() => rm(root, { recursive: true, force: true }));

  const store = new AgentConversationStore({ stateDirectory: root });
  await assert.rejects(
    store.append({
      id: 'turn-1',
      taskId: 'task-1',
      role: 'user',
      content: 'Mensagem.',
      createdAt: '2026-09-25T14:03:00.000Z',
      executionId: 'execution-1',
      providerId: 'codex',
    }),
    (error: unknown) =>
      error instanceof AgentConversationStoreError &&
      error.code === 'AGENT_CONVERSATION_INVALID',
  );

  await assert.rejects(
    store.append({
      id: 'turn-2',
      taskId: 'task-1',
      role: 'agent',
      content: 'Resposta.',
      createdAt: '2026-09-25T14:04:00.000Z',
      executionId: 'execution-1',
    }),
    (error: unknown) =>
      error instanceof AgentConversationStoreError &&
      error.code === 'AGENT_CONVERSATION_INVALID',
  );
});

test('AgentConversationStore falha fechado para estado corrompido', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-conversation-corrupt-'));
  context.after(() => rm(root, { recursive: true, force: true }));

  const filePath = conversationPath(root, 'task-1');
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    JSON.stringify({
      version: 1,
      taskId: 'task-1',
      turns: [
        {
          id: 'turn-1',
          taskId: 'task-other',
          role: 'user',
          content: 'Mensagem.',
          createdAt: '2026-09-25T14:05:00.000Z',
        },
      ],
    }),
  );

  const store = new AgentConversationStore({ stateDirectory: root });
  await assert.rejects(
    store.list('task-1'),
    (error: unknown) =>
      error instanceof AgentConversationStoreError &&
      error.code === 'AGENT_CONVERSATION_CORRUPT',
  );
});

test('AgentConversationStore aplica limite explícito sem descartar histórico', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-conversation-limit-'));
  context.after(() => rm(root, { recursive: true, force: true }));

  const store = new AgentConversationStore({
    stateDirectory: root,
    maxTurns: 1,
  });
  await store.append({
    id: 'turn-1',
    taskId: 'task-1',
    role: 'user',
    content: 'Primeira mensagem.',
    createdAt: '2026-09-25T14:06:00.000Z',
  });

  await assert.rejects(
    store.append({
      id: 'turn-2',
      taskId: 'task-1',
      role: 'user',
      content: 'Segunda mensagem.',
      createdAt: '2026-09-25T14:07:00.000Z',
    }),
    (error: unknown) =>
      error instanceof AgentConversationStoreError &&
      error.code === 'AGENT_CONVERSATION_LIMIT',
  );
  assert.equal((await store.list('task-1')).length, 1);
});
