import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  type AgentAttachment,
  type AgentConversationTurn,
  type fetchAgentAttachments,
  type fetchAgentConversation,
} from '../src/api/agent-runtime';
import { useAgentTaskDetailReads } from '../src/composables/useAgentTaskDetailReads';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const turn = (taskId: string): AgentConversationTurn => ({
  id: 'turn-1',
  taskId,
  role: 'user',
  content: 'continuar',
  createdAt: '2026-10-23T12:00:00.000Z',
});

const attachment = (taskId: string): AgentAttachment => ({
  id: 'attachment-1',
  taskId,
  filename: 'context.md',
  mediaType: 'text/markdown',
  byteSize: 4,
  sha256: 'abcd',
  source: 'user-upload',
  createdAt: '2026-10-23T12:00:00.000Z',
});

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

function harness() {
  const selected = { projectId: 'project-a', taskId: 'task-a' };
  let conversationRevision = 1;
  let attachmentsRevision = 1;
  const conversationRequests: Array<{
    projectId: string;
    taskId: string;
    request: ReturnType<typeof deferred<AgentConversationTurn[]>>;
  }> = [];
  const attachmentRequests: Array<{
    projectId: string;
    taskId: string;
    request: ReturnType<typeof deferred<AgentAttachment[]>>;
  }> = [];
  const appliedConversation: string[] = [];
  const appliedAttachments: string[] = [];

  const conversation: typeof fetchAgentConversation = (projectId, taskId) => {
    const request = deferred<AgentConversationTurn[]>();
    conversationRequests.push({ projectId, taskId, request });
    return request.promise;
  };
  const attachments: typeof fetchAgentAttachments = (projectId, taskId) => {
    const request = deferred<AgentAttachment[]>();
    attachmentRequests.push({ projectId, taskId, request });
    return request.promise;
  };

  const state = useAgentTaskDetailReads(
    () => selected,
    () => conversationRevision,
    () => attachmentsRevision,
    (turns) => appliedConversation.push(...turns.map((item) => item.taskId)),
    (records) => {
      appliedAttachments.push(...records.map((item) => item.taskId));
    },
    { conversation, attachments },
  );
  return {
    selected,
    conversationRequests,
    attachmentRequests,
    appliedConversation,
    appliedAttachments,
    state,
    changeConversation: () => {
      conversationRevision += 1;
    },
    changeAttachments: () => {
      attachmentsRevision += 1;
    },
  };
}

test('leitura pendente não bloqueia a outra fonte', async () => {
  const h = harness();
  h.state.loadTaskDetails();
  await flush();
  assert.equal(h.conversationRequests.length, 1);
  assert.equal(h.attachmentRequests.length, 1);
  h.attachmentRequests[0]!.request.resolve([attachment('task-a')]);
  await flush();
  assert.deepEqual(h.appliedAttachments, ['task-a']);
  assert.deepEqual(h.appliedConversation, []);

  h.conversationRequests[0]!.request.reject(
    new Error('token secreto do provider'),
  );
  await flush();
  assert.deepEqual(h.state.failedDetailSources.value, ['conversation']);
  assert.match(h.state.detailWarning.value, /conversa persistida/);
  assert.doesNotMatch(h.state.detailWarning.value, /token secreto/);

  h.state.loadTaskDetails();
  await flush();
  assert.equal(h.state.detailWarning.value, '');
  h.conversationRequests[1]!.request.resolve([turn('task-a')]);
  h.attachmentRequests[1]!.request.resolve([]);
  await flush();
  assert.deepEqual(h.appliedConversation, ['task-a']);
  assert.deepEqual(h.state.failedDetailSources.value, []);
});

test('A → B → A descarta dados e erros antigos', async () => {
  const h = harness();
  h.state.loadTaskDetails();
  await flush();

  h.selected.taskId = 'task-b';
  h.state.resetTaskDetails();
  h.state.loadTaskDetails();
  await flush();

  h.selected.taskId = 'task-a';
  h.state.resetTaskDetails();
  h.state.loadTaskDetails();
  await flush();

  h.conversationRequests[2]!.request.resolve([turn('task-a')]);
  h.attachmentRequests[2]!.request.resolve([attachment('task-a')]);
  await flush();

  h.conversationRequests[0]!.request.reject(new Error('old secret'));
  h.attachmentRequests[0]!.request.resolve([attachment('task-a')]);
  h.conversationRequests[1]!.request.resolve([turn('task-b')]);
  h.attachmentRequests[1]!.request.reject(new Error('old secret'));
  await flush();

  assert.deepEqual(h.appliedConversation, ['task-a']);
  assert.deepEqual(h.appliedAttachments, ['task-a']);
  assert.equal(h.state.detailWarning.value, '');
});

test('mutação local descarta snapshot auxiliar antigo', async () => {
  const h = harness();
  h.state.loadTaskDetails();
  await flush();
  h.changeConversation();
  h.changeAttachments();
  h.conversationRequests[0]!.request.resolve([turn('task-a')]);
  h.attachmentRequests[0]!.request.resolve([attachment('task-a')]);
  await flush();
  assert.deepEqual(h.appliedConversation, []);
  assert.deepEqual(h.appliedAttachments, []);
  assert.equal(h.state.detailWarning.value, '');
});

test('dados auxiliares inválidos são rejeitados por fonte', async () => {
  const h = harness();
  h.state.loadTaskDetails();
  await flush();
  h.conversationRequests[0]!.request.resolve([turn('task-b')]);
  h.attachmentRequests[0]!.request.resolve([
    null as unknown as AgentAttachment,
  ]);
  await flush();
  assert.deepEqual(h.appliedConversation, []);
  assert.deepEqual(h.appliedAttachments, []);
  assert.deepEqual(h.state.failedDetailSources.value.sort(), [
    'attachments',
    'conversation',
  ]);
  assert.match(h.state.detailWarning.value, /Conversa e anexos/);
});
