import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

import {
  type AgentConversationExecutionResult,
  type AgentConversationTurn,
  type executeAgentConversationTurn,
} from '../src/api/agent-runtime';
import { useAgentTaskConversation } from '../src/composables/useAgentTaskConversation';

function turns(
  id: string,
  taskId: string,
): [AgentConversationTurn, AgentConversationTurn] {
  return [
    {
      id,
      taskId,
      role: 'user',
      content: 'Continue',
      createdAt: '2026-10-23T12:00:00.000Z',
    },
    {
      id: id + '-agent',
      taskId,
      role: 'agent',
      content: 'Pronto',
      createdAt: '2026-10-23T12:01:00.000Z',
      executionId: 'execution-' + id,
      providerId: 'codex',
    },
  ];
}

function result(id: string, taskId: string): AgentConversationExecutionResult {
  const [userTurn, agentTurn] = turns(id, taskId);
  return { userTurn, agentTurn } as AgentConversationExecutionResult;
}

function conversationTurnIds(
  state: ReturnType<typeof useAgentTaskConversation>,
): string[] {
  return state.conversationTurns.value.map((turn) => turn.id);
}

function harness() {
  const target = { projectId: 'project-a', taskId: 'task-a' };
  const requests: Array<{
    projectId: string;
    taskId: string;
    payload: Parameters<typeof executeAgentConversationTurn>[2];
    resolve: (value: AgentConversationExecutionResult) => void;
    reject: (error: Error) => void;
  }> = [];
  const success: Array<{ projectId: string; taskId: string }> = [];
  const reloads: Array<{ projectId: string; taskId: string }> = [];
  const errors: string[] = [];
  let allowed = true;
  let clears = 0;
  let sequence = 0;
  let snapshotOnReload: AgentConversationTurn[] | null = null;

  const execute: typeof executeAgentConversationTurn = (
    projectId,
    taskId,
    payload,
  ) =>
    new Promise((resolve, reject) =>
      requests.push({ projectId, taskId, payload, resolve, reject }),
    );

  const state = useAgentTaskConversation(
    () => target,
    () => allowed,
    (_value, selected) => success.push({ ...selected }),
    async (selected) => {
      reloads.push({ ...selected });
      if (snapshotOnReload) {
        state.applyLoadedConversation(
          snapshotOnReload,
          selected,
          state.conversationRevision(),
        );
      }
    },
    (message) => errors.push(message),
    () => {
      clears += 1;
    },
    { execute, createId: () => 'turn-' + ++sequence },
  );
  return {
    target,
    requests,
    success,
    reloads,
    errors,
    state,
    allow: (value: boolean) => {
      allowed = value;
    },
    setReloadSnapshot: (value: AgentConversationTurn[]) => {
      snapshotOnReload = value;
    },
    clears: () => clears,
  };
}

test('envio gera um único ID e captura provider, profile, anexos e conteúdo', async () => {
  const h = harness();
  h.state.conversationInstruction.value = '  Continue  ';
  const attachmentIds = ['att-1'];
  const pending = h.state.continueCurrentConversation({
    providerId: 'codex',
    attachmentIds,
    profileId: 'safe',
  });
  attachmentIds.push('att-2');
  await h.state.continueCurrentConversation({
    providerId: 'automatic',
    attachmentIds,
  });
  assert.equal(h.requests.length, 1);
  assert.equal(h.clears(), 1);
  assert.deepEqual(h.requests[0]?.payload, {
    id: 'turn-1',
    content: 'Continue',
    providerId: 'codex',
    attachmentIds: ['att-1'],
    profileId: 'safe',
  });
  assert.equal(h.state.conversationSending.value, true);
  h.requests[0]!.resolve(result('turn-1', 'task-a'));
  await pending;
  assert.equal(h.state.conversationInstruction.value, '');
  assert.deepEqual(conversationTurnIds(h.state), ['turn-1', 'turn-1-agent']);
  assert.deepEqual(h.success, [{ projectId: 'project-a', taskId: 'task-a' }]);
  assert.deepEqual(h.reloads, [{ projectId: 'project-a', taskId: 'task-a' }]);
  assert.equal(h.state.conversationSending.value, false);
});

test('resposta da task A após A → B → A não altera a nova conversa nem libera outro envio', async () => {
  const h = harness();
  h.state.conversationInstruction.value = 'old';
  const old = h.state.continueCurrentConversation({
    providerId: 'codex',
    attachmentIds: [],
  });
  h.target.taskId = 'task-b';
  h.state.resetConversation();
  h.target.taskId = 'task-a';
  h.state.resetConversation();
  h.state.conversationInstruction.value = 'new';
  const current = h.state.continueCurrentConversation({
    providerId: 'automatic',
    attachmentIds: [],
  });
  h.requests[0]!.resolve(result('turn-1', 'task-a'));
  await old;
  assert.equal(h.state.conversationInstruction.value, 'new');
  assert.equal(h.state.conversationSending.value, true);
  assert.deepEqual(h.state.conversationTurns.value, []);
  assert.deepEqual(h.success, []);
  assert.deepEqual(h.reloads, []);

  h.requests[1]!.resolve(result('turn-2', 'task-a'));
  await current;
  assert.equal(h.state.conversationSending.value, false);
  assert.deepEqual(conversationTurnIds(h.state), ['turn-2', 'turn-2-agent']);
});

test('erro antigo não sobrescreve novo projeto e erro atual revalida sem replay automático', async () => {
  const h = harness();
  h.state.conversationInstruction.value = 'old';
  const stale = h.state.continueCurrentConversation({
    providerId: 'codex',
    attachmentIds: [],
  });
  h.target.projectId = 'project-b';
  h.state.resetConversation();
  h.requests[0]!.reject(new Error('stale internal error'));
  await stale;
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.reloads, []);

  h.state.conversationInstruction.value = 'retry me';
  const failing = h.state.continueCurrentConversation({
    providerId: 'codex',
    attachmentIds: [],
  });
  h.requests[1]!.reject(new Error('API unavailable'));
  await failing;
  assert.deepEqual(h.errors, ['API unavailable']);
  assert.deepEqual(h.reloads, [{ projectId: 'project-b', taskId: 'task-a' }]);
  assert.equal(h.state.conversationInstruction.value, 'retry me');
  assert.equal(h.requests.length, 2);
  assert.equal(h.state.conversationSending.value, false);
});

test('após resposta ambígua com turno já persistido, draft é limpo sem reenviar automaticamente', async () => {
  const h = harness();
  h.state.conversationInstruction.value = 'Continue';
  h.setReloadSnapshot([turns('turn-1', 'task-a')[0]]);
  const pending = h.state.continueCurrentConversation({
    providerId: 'codex',
    attachmentIds: [],
  });
  h.requests[0]!.reject(new Error('Resposta HTTP indisponível'));
  await pending;
  assert.equal(h.state.conversationInstruction.value, '');
  assert.deepEqual(conversationTurnIds(h.state), ['turn-1']);
  assert.equal(h.requests.length, 1);
});

test('snapshots anteriores ao envio são descartados; snapshot canônico posterior substitui a lista', async () => {
  const h = harness();
  const oldRevision = h.state.conversationRevision();
  h.state.conversationInstruction.value = 'Continue';
  const pending = h.state.continueCurrentConversation({
    providerId: 'codex',
    attachmentIds: [],
  });
  h.state.applyLoadedConversation(
    [turns('prior', 'task-a')[0]],
    { ...h.target },
    oldRevision,
  );
  assert.deepEqual(h.state.conversationTurns.value, []);
  h.requests[0]!.resolve(result('turn-1', 'task-a'));
  await pending;
  const currentRevision = h.state.conversationRevision();
  h.state.applyLoadedConversation(
    [turns('canonical', 'task-a')[0]],
    { ...h.target },
    currentRevision,
  );
  assert.deepEqual(conversationTurnIds(h.state), ['canonical']);
  h.state.applyLoadedConversation(
    [turns('wrong', 'task-b')[0]],
    { projectId: 'project-a', taskId: 'task-b' },
    currentRevision,
  );
  assert.deepEqual(conversationTurnIds(h.state), ['canonical']);
});

test('snapshot pré-existente com turno retornado não produz duplicados', async () => {
  const h = harness();
  h.state.conversationInstruction.value = 'Continue';
  const pending = h.state.continueCurrentConversation({
    providerId: 'codex',
    attachmentIds: [],
  });
  const [userTurn] = turns('turn-1', 'task-a');
  h.state.applyLoadedConversation(
    [userTurn],
    { ...h.target },
    h.state.conversationRevision(),
  );
  h.requests[0]!.resolve(result('turn-1', 'task-a'));
  await pending;
  assert.deepEqual(conversationTurnIds(h.state), ['turn-1', 'turn-1-agent']);
});

test('pré-condições impedem envio vazio, não autorizado ou duplicado', async () => {
  const h = harness();
  h.state.conversationInstruction.value = '   ';
  await h.state.continueCurrentConversation({
    providerId: 'codex',
    attachmentIds: [],
  });
  h.state.conversationInstruction.value = 'Continue';
  h.allow(false);
  await h.state.continueCurrentConversation({
    providerId: 'codex',
    attachmentIds: [],
  });
  assert.equal(h.requests.length, 0);
  h.allow(true);
  const pending = h.state.continueCurrentConversation({
    providerId: 'codex',
    attachmentIds: [],
  });
  await h.state.continueCurrentConversation({
    providerId: 'codex',
    attachmentIds: [],
  });
  assert.equal(h.requests.length, 1);
  h.requests[0]!.resolve(result('turn-1', 'task-a'));
  await pending;
});

test('cockpit delega conversa e invalida estado na seleção, carga e unmount', () => {
  const panel = readFileSync(
    resolve(import.meta.dirname, '../src/components/ProjectAgentPanel.vue'),
    'utf8',
  );
  assert.match(panel, /useAgentTaskConversation\(/);
  assert.match(panel, /useAgentTaskDetailReads\(/);
  assert.match(
    panel,
    /applyLoadedConversation\(nextConversation, target, revision\)/,
  );
  assert.match(panel, /conversationRevision,/);
  assert.match(panel, /resetConversation\(\)/);
  assert.doesNotMatch(panel, /conversationTurns\.value\s*=/);
  assert.doesNotMatch(panel, /executeAgentConversationTurn\(/);
  assert.match(panel, /@click="continueCurrentConversation"/);
});
