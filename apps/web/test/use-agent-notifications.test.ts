import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';

import type { AgentRealtimeSnapshot } from '../src/api/agent-runtime';
import { useAgentNotifications } from '../src/composables/useAgentNotifications';
import {
  AGENT_NOTIFICATION_SEEN_KEY,
  readAgentNotificationPreferences,
} from '../src/stores/agent-notifications';
import { noticeCenterStore } from '../src/stores/notice-center';

function completedSnapshot(projectId = 'project-1'): AgentRealtimeSnapshot {
  return {
    status: {
      task: {
        task: {
          id: 'task-1',
          projectId,
          state: 'completed',
          summary: 'prompt sensível não deve virar aviso',
          requestedCapabilities: [],
          createdAt: '2026-10-01T10:00:00.000Z',
          updatedAt: '2026-10-01T11:00:00.000Z',
        },
        version: 1,
      },
      runtime: {
        taskId: 'task-1',
        projectId,
        canonicalVersion: 1,
        state: 'idle',
        attempts: 1,
        updatedAt: '2026-10-01T11:00:00.000Z',
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

test('preferências persistem; evento desativado não gera aviso', () => {
  const publish = vi
    .spyOn(noticeCenterStore, 'publishTerminalNotice')
    .mockImplementation(() => undefined);
  const notifications = useAgentNotifications(() => ({
    id: 'project-1',
    name: 'Projeto 1',
  }));

  notifications.toggleAgentNotificationGroup(['completed', 'failed'], {
    target: { checked: false },
  } as unknown as Event);
  assert.equal(readAgentNotificationPreferences().completed, false);
  assert.equal(readAgentNotificationPreferences().failed, false);
  notifications.publishAgentNotifications(completedSnapshot());
  assert.equal(publish.mock.calls.length, 0);

  notifications.toggleAgentNotificationGroup(['completed'], {
    target: { checked: true },
  } as unknown as Event);
  notifications.publishAgentNotifications(completedSnapshot());
  assert.equal(publish.mock.calls.length, 1);
  assert.equal(publish.mock.calls[0]?.[0].label, 'Task concluída');
  assert.equal(
    JSON.stringify(publish.mock.calls).includes('prompt sensível'),
    false,
  );
});

test('snapshot repetido não publica duas vezes após remount', () => {
  const publish = vi
    .spyOn(noticeCenterStore, 'publishTerminalNotice')
    .mockImplementation(() => undefined);
  const project = () => ({ id: 'project-1', name: 'Projeto 1' });

  const first = useAgentNotifications(project);
  first.publishAgentNotifications(completedSnapshot());
  const second = useAgentNotifications(project);
  second.publishAgentNotifications(completedSnapshot());

  assert.equal(publish.mock.calls.length, 1);
  assert.match(
    window.localStorage.getItem(AGENT_NOTIFICATION_SEEN_KEY) ?? '',
    /agent:task-1:completed:/,
  );
});

test('snapshot tardio de outro projeto não publica nem consome chave', () => {
  const publish = vi
    .spyOn(noticeCenterStore, 'publishTerminalNotice')
    .mockImplementation(() => undefined);
  const project = { id: 'project-2', name: 'Projeto 2' };
  const notifications = useAgentNotifications(() => project);

  notifications.publishAgentNotifications(completedSnapshot('project-1'));
  assert.equal(publish.mock.calls.length, 0);
  assert.equal(window.localStorage.getItem(AGENT_NOTIFICATION_SEEN_KEY), null);

  project.id = 'project-1';
  project.name = 'Projeto 1';
  notifications.publishAgentNotifications(completedSnapshot('project-1'));
  assert.equal(publish.mock.calls.length, 1);
  assert.equal(publish.mock.calls[0]?.[0].projectId, 'project-1');
  assert.deepEqual(publish.mock.calls[0]?.[0].routeTo, {
    name: 'project-agent',
    params: { projectId: 'project-1' },
    query: { taskId: 'task-1' },
  });
});
