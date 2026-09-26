import assert from 'node:assert/strict';
import { beforeEach, test } from 'vitest';

import type { AgentRealtimeSnapshot } from '../src/api/agent-runtime';
import {
  AGENT_NOTIFICATION_PREFERENCES_KEY,
  AGENT_NOTIFICATION_SEEN_KEY,
  agentNotificationCandidates,
  hasSeenAgentNotification,
  markAgentNotificationSeen,
  readAgentNotificationPreferences,
  writeAgentNotificationPreferences,
} from '../src/stores/agent-notifications';

function snapshot(
  state: AgentRealtimeSnapshot['status']['task']['task']['state'],
): AgentRealtimeSnapshot {
  return {
    status: {
      task: {
        task: {
          id: 'task-1',
          projectId: 'project-1',
          state,
          summary: 'conteúdo sensível que não deve virar notificação',
          requestedCapabilities: ['workspace:write'],
          createdAt: '2026-09-26T18:00:00.000Z',
          updatedAt: '2026-09-26T19:00:00.000Z',
        },
        version: 2,
      },
      runtime: {
        taskId: 'task-1',
        projectId: 'project-1',
        canonicalVersion: 2,
        state: 'idle',
        attempts: 1,
        updatedAt: '2026-09-26T19:00:00.000Z',
      },
    },
    activity: {
      authorizations: [],
      checkpoints: [],
      events: [],
      evidence: [],
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

test('checkpoint pendente gera aviso único e autorização quando capability falta', () => {
  const value = snapshot('checkpoint');
  value.activity.checkpoints.push({
    id: 'checkpoint-1',
    taskId: 'task-1',
    status: 'pending',
    summary: 'prompt bruto não deve aparecer',
    requiredCapabilities: ['workspace:write'],
    createdAt: '2026-09-26T19:00:00.000Z',
  });

  const candidates = agentNotificationCandidates(value);

  assert.deepEqual(
    candidates.map(({ kind, label }) => ({ kind, label })),
    [
      { kind: 'checkpoint', label: 'Checkpoint aguardando decisão' },
      { kind: 'authorization', label: 'Autorização necessária' },
    ],
  );
  assert.equal(JSON.stringify(candidates).includes('prompt bruto'), false);
});

test('checkpoint resolvido não volta a gerar aviso', () => {
  const value = snapshot('review');
  value.activity.checkpoints.push({
    id: 'checkpoint-1',
    taskId: 'task-1',
    status: 'approved',
    summary: 'resolvido',
    requiredCapabilities: [],
    createdAt: '2026-09-26T19:00:00.000Z',
    resolvedAt: '2026-09-26T19:01:00.000Z',
  });

  assert.deepEqual(agentNotificationCandidates(value), []);
});

test('falha, conclusão e recovery usam somente labels sanitizados', () => {
  assert.deepEqual(
    agentNotificationCandidates(snapshot('failed')).map((item) => item.label),
    ['Task falhou'],
  );
  assert.deepEqual(
    agentNotificationCandidates(snapshot('completed')).map(
      (item) => item.label,
    ),
    ['Task concluída'],
  );

  const interrupted = snapshot('running');
  interrupted.status.runtime.state = 'interrupted';
  interrupted.status.runtime.lastReason = 'process-interrupted';
  assert.deepEqual(
    agentNotificationCandidates(interrupted).map((item) => item.label),
    ['Recovery necessário'],
  );
});

test('dedupe sobrevive a nova leitura do storage', () => {
  const key = 'agent:task-1:checkpoint:checkpoint-1';

  assert.equal(hasSeenAgentNotification(key), false);
  markAgentNotificationSeen(key);
  assert.equal(hasSeenAgentNotification(key), true);
  assert.match(
    window.localStorage.getItem(AGENT_NOTIFICATION_SEEN_KEY) ?? '',
    /checkpoint-1/,
  );
});

test('preferências básicas persistem e campos ausentes mantêm default seguro', () => {
  writeAgentNotificationPreferences({
    checkpoint: false,
    authorization: false,
    failed: true,
    completed: false,
    recovery: true,
  });

  assert.deepEqual(readAgentNotificationPreferences(), {
    checkpoint: false,
    authorization: false,
    failed: true,
    completed: false,
    recovery: true,
  });

  window.localStorage.setItem(
    AGENT_NOTIFICATION_PREFERENCES_KEY,
    JSON.stringify({ completed: false }),
  );
  assert.deepEqual(readAgentNotificationPreferences(), {
    checkpoint: true,
    authorization: true,
    failed: true,
    completed: false,
    recovery: true,
  });
});
