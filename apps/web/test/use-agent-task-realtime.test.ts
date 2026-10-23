import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, test, vi } from 'vitest';

import type { AgentRealtimeSnapshot } from '../src/api/agent-runtime';
import {
  useAgentTaskRealtime,
  type AgentRealtimeTask,
} from '../src/composables/useAgentTaskRealtime';

class FakeWebSocket {
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  emit(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

function snapshot(projectId: string, taskId: string): AgentRealtimeSnapshot {
  return {
    status: {
      task: {
        task: {
          id: taskId,
          projectId,
          state: 'running',
          summary: 'conteúdo privado',
          requestedCapabilities: [],
          createdAt: '2026-10-01T10:00:00.000Z',
          updatedAt: '2026-10-01T11:00:00.000Z',
        },
        version: 1,
      },
      runtime: {
        taskId,
        projectId,
        canonicalVersion: 1,
        state: 'running',
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
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test('troca de task fecha socket anterior e descarta eventos antigos', () => {
  const selected: AgentRealtimeTask = {
    projectId: 'project-1',
    taskId: 'task-a',
  };
  const received: string[] = [];
  const realtime = useAgentTaskRealtime(
    () => selected,
    (value) => received.push(value.status.task.task.id),
    () => assert.fail('Não deveria emitir erro'),
  );

  realtime.connect('project-1', 'task-a');
  const first = FakeWebSocket.instances[0]!;
  first.open();
  assert.equal(realtime.socketState.value, 'connected');
  first.emit({ type: 'ready', snapshot: snapshot('project-1', 'task-a') });

  selected.taskId = 'task-b';
  realtime.closeSocket();
  assert.equal(first.readyState, FakeWebSocket.CLOSED);
  assert.equal(realtime.socketState.value, 'idle');
  first.emit({ type: 'update', snapshot: snapshot('project-1', 'task-a') });

  realtime.connect('project-1', 'task-b');
  const second = FakeWebSocket.instances[1]!;
  second.open();
  second.emit({ type: 'update', snapshot: snapshot('project-1', 'task-b') });
  first.emit({ type: 'update', snapshot: snapshot('project-1', 'task-a') });

  assert.deepEqual(received, ['task-a', 'task-b']);
  assert.equal(FakeWebSocket.instances.length, 2);
  assert.notEqual(first, second);
});

test('snapshots de outra task ou projeto são ignorados', () => {
  const selected: AgentRealtimeTask = {
    projectId: 'project-1',
    taskId: 'task-a',
  };
  const received: string[] = [];
  const errors: string[] = [];
  const realtime = useAgentTaskRealtime(
    () => selected,
    (value) => received.push(value.status.task.task.id),
    (message) => errors.push(message),
  );

  realtime.connect('project-1', 'task-a');
  const active = FakeWebSocket.instances[0]!;
  active.emit({ type: 'update', snapshot: snapshot('project-1', 'task-b') });
  active.emit({ type: 'update', snapshot: snapshot('project-2', 'task-a') });
  active.emit({ type: 'update', snapshot: {} });
  active.onmessage?.({ data: 'not-json' });

  selected.projectId = 'project-2';
  active.emit({ type: 'update', snapshot: snapshot('project-1', 'task-a') });
  active.emit({ type: 'error', message: 'erro antigo' });
  assert.deepEqual(received, []);
  assert.deepEqual(errors, []);

  selected.projectId = 'project-1';
  active.emit({ type: 'update', snapshot: snapshot('project-1', 'task-a') });
  active.emit({ type: 'error', message: 'erro atual' });
  assert.deepEqual(received, ['task-a']);
  assert.deepEqual(errors, ['erro atual']);
});

test('reconexão mantém um owner e ignora close tardio', () => {
  const target = { projectId: 'project-1', taskId: 'task-a' };
  const realtime = useAgentTaskRealtime(
    () => target,
    () => undefined,
    () => undefined,
  );

  realtime.connect('project-1', 'task-a');
  const old = FakeWebSocket.instances[0]!;
  realtime.connect('project-1', 'task-a');
  const current = FakeWebSocket.instances[1]!;
  assert.equal(old.readyState, FakeWebSocket.CLOSED);
  current.open();
  old.onclose?.();
  assert.equal(realtime.socketState.value, 'connected');

  realtime.closeSocket();
  assert.equal(current.readyState, FakeWebSocket.CLOSED);
  assert.equal(realtime.socketState.value, 'idle');
});

test('reconectar fecha socket antigo e mantém a task atual', () => {
  const selected = { projectId: 'project-1', taskId: 'task-a' };
  const received: string[] = [];
  const realtime = useAgentTaskRealtime(
    () => selected,
    (value) => received.push(value.status.task.task.id),
    () => undefined,
  );

  realtime.connect('project-1', 'task-a');
  const first = FakeWebSocket.instances[0]!;
  first.open();
  first.onerror?.();
  assert.equal(realtime.socketState.value, 'disconnected');
  assert.equal(first.readyState, 1, 'socket com erro ainda pode estar aberto');

  realtime.connect('project-1', 'task-a');
  const second = FakeWebSocket.instances[1]!;
  assert.equal(first.readyState, FakeWebSocket.CLOSED);
  assert.equal(realtime.socketState.value, 'connecting');
  first.emit({ type: 'update', snapshot: snapshot('project-1', 'task-a') });
  first.onclose?.();
  assert.equal(realtime.socketState.value, 'connecting');
  second.open();
  second.emit({ type: 'ready', snapshot: snapshot('project-1', 'task-a') });
  assert.deepEqual(received, ['task-a']);
  assert.equal(realtime.socketState.value, 'connected');
  assert.equal(FakeWebSocket.instances.length, 2);

  realtime.closeSocket();
  assert.equal(second.readyState, FakeWebSocket.CLOSED);
  assert.equal(realtime.socketState.value, 'idle');
});

test('reconectar exige snapshot da task selecionada', () => {
  const panel = readFileSync(
    resolve(import.meta.dirname, '../src/components/ProjectAgentPanel.vue'),
    'utf8',
  );
  const reconnect = panel.slice(
    panel.indexOf('function reconnectTaskRealtime(): void {'),
    panel.indexOf('async function selectTask('),
  );
  assert.match(reconnect, /socketState\.value !== 'disconnected'/);
  assert.match(reconnect, /task\?\.id !== taskId/);
  assert.match(reconnect, /task\.projectId !== props\.project\.id/);
  assert.match(reconnect, /connectTaskSocket\(props\.project\.id, taskId\)/);
  assert.doesNotMatch(
    reconnect,
    /executeCurrent|continueCurrentConversation|loadTask/,
  );
  assert.match(panel, /@click="reconnectTaskRealtime"/);
  assert.match(panel, /Reconectar realtime/);
  assert.match(panel, /socketState === 'disconnected'/);
});
