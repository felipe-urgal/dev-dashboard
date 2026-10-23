import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ref } from 'vue';
import { test } from 'vitest';

import type {
  AgentActivity,
  AgentRealtimeSnapshot,
  AgentTaskStatus,
} from '../src/api/agent-runtime';
import { useAgentTaskSnapshots } from '../src/composables/useAgentTaskSnapshots';

function snapshot(
  projectId: string,
  taskId: string,
  version: number,
  observedAt = '2026-10-23T14:00:00.000Z',
): AgentRealtimeSnapshot {
  return {
    status: {
      task: {
        task: {
          projectId,
          id: taskId,
          summary: 'Instrução confidencial',
          state: 'running',
          requestedCapabilities: [],
          createdAt: '2026-10-23T13:00:00.000Z',
          updatedAt: observedAt,
        },
        version,
      },
      runtime: {
        projectId,
        taskId,
        canonicalVersion: version,
        state: 'running',
        attempts: 1,
        updatedAt: observedAt,
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

function harness() {
  const selected = { projectId: 'project-a', taskId: 'task-a' };
  const status = ref<AgentTaskStatus | null>(null);
  const activity = ref<AgentActivity | null>(null);
  const recorded: number[] = [];
  const controller = useAgentTaskSnapshots(
    () => selected,
    status,
    activity,
    (value) => recorded.push(value.status.task.version),
  );
  return { selected, status, activity, recorded, controller };
}

test('aplica uma vez a resposta atual e propaga a versão canônica', () => {
  const h = harness();
  const first = snapshot('project-a', 'task-a', 2);
  assert.equal(h.controller.applySnapshot(first), 'applied');
  assert.equal(h.status.value?.task.version, 2);
  assert.equal(h.activity.value?.events.length, 0);
  assert.deepEqual(h.recorded, [2]);
});

test('snapshot realtime mais antigo não regride estado nem publica notificações', () => {
  const h = harness();
  const current = snapshot('project-a', 'task-a', 7);
  h.controller.applySnapshot(current);
  assert.equal(
    h.controller.applySnapshot(snapshot('project-a', 'task-a', 5)),
    'stale',
  );
  assert.equal(h.status.value?.task.version, 7);
  assert.deepEqual(h.recorded, [7]);
});

test('mesma revisão não aceita runtime mais antigo, mas aceita observação nova', () => {
  const h = harness();
  h.controller.applySnapshot(
    snapshot('project-a', 'task-a', 3, '2026-10-23T15:10:00.000Z'),
  );
  assert.equal(
    h.controller.applySnapshot(
      snapshot('project-a', 'task-a', 3, '2026-10-23T14:50:00.000Z'),
    ),
    'stale',
  );
  assert.equal(h.status.value?.runtime.updatedAt, '2026-10-23T15:10:00.000Z');
  assert.equal(
    h.controller.applySnapshot(
      snapshot('project-a', 'task-a', 3, '2026-10-23T15:11:00.000Z'),
    ),
    'applied',
  );
  assert.equal(h.status.value?.runtime.updatedAt, '2026-10-23T15:11:00.000Z');
  assert.deepEqual(h.recorded, [3, 3]);
});

test('versão maior prevalece mesmo quando observação runtime tem outro timestamp', () => {
  const h = harness();
  h.controller.applySnapshot(
    snapshot('project-a', 'task-a', 2, '2026-10-23T16:00:00.000Z'),
  );
  assert.equal(
    h.controller.applySnapshot(
      snapshot('project-a', 'task-a', 3, '2026-10-23T15:00:00.000Z'),
    ),
    'applied',
  );
  assert.equal(h.status.value?.task.version, 3);
});

test('task, runtime e execução ativa de outro alvo são rejeitados', () => {
  const h = harness();
  const foreignTask = snapshot('project-b', 'task-a', 1);
  const foreignRuntime = snapshot('project-a', 'task-a', 2);
  foreignRuntime.status.runtime.projectId = 'project-b';
  const foreignExecution = snapshot('project-a', 'task-a', 3);
  foreignExecution.status.activeExecution = {
    projectId: 'project-b',
    taskId: 'task-a',
    executionId: 'exec-1',
  };
  const wrongTask = snapshot('project-a', 'task-b', 4);

  for (const response of [
    foreignTask,
    foreignRuntime,
    foreignExecution,
    wrongTask,
  ]) {
    assert.equal(h.controller.applySnapshot(response), 'invalid');
  }
  assert.equal(h.status.value, null);
  assert.deepEqual(h.recorded, []);
});

test('versões inválidas, runtime sem data e activity incompleta falham fechado', () => {
  const h = harness();
  const invalidVersion = snapshot('project-a', 'task-a', -1);
  const invalidDate = snapshot('project-a', 'task-a', 1, 'invalid-date');
  const invalidActivity = snapshot('project-a', 'task-a', 1);
  invalidActivity.activity = { events: [] } as unknown as AgentActivity;
  for (const response of [
    invalidVersion,
    invalidDate,
    invalidActivity,
    {} as AgentRealtimeSnapshot,
  ]) {
    assert.equal(h.controller.applySnapshot(response), 'invalid');
  }
  assert.equal(h.status.value, null);
});

test('seleção de outro projeto e retorno A → B → A não contamina a task', () => {
  const h = harness();
  h.controller.applySnapshot(snapshot('project-a', 'task-a', 5));
  h.selected.projectId = 'project-b';
  h.selected.taskId = 'task-b';
  assert.equal(
    h.controller.applySnapshot(snapshot('project-a', 'task-a', 6)),
    'invalid',
  );
  h.selected.projectId = 'project-a';
  h.selected.taskId = 'task-a';
  assert.equal(
    h.controller.applySnapshot(snapshot('project-a', 'task-a', 4)),
    'stale',
  );
  assert.equal(h.status.value?.task.version, 5);
  assert.deepEqual(h.recorded, [5]);
});

function snapshotWithActivity(version: number): AgentRealtimeSnapshot {
  const result = snapshot('project-a', 'task-a', version);
  result.activity.authorizations = [
    {
      taskId: 'task-a',
      capability: 'workspace:write',
      granted: true,
      observedAt: '2026-10-23T14:01:00.000Z',
    },
  ];
  result.activity.checkpoints = [
    {
      id: 'checkpoint-1',
      taskId: 'task-a',
      status: 'pending',
      summary: 'Precisa de autorização',
      requiredCapabilities: [],
      createdAt: '2026-10-23T14:02:00.000Z',
    },
  ];
  result.activity.events = [
    {
      id: 'event-1',
      taskId: 'task-a',
      type: 'checkpoint',
      summary: 'Checkpoint criado',
      occurredAt: '2026-10-23T14:03:00.000Z',
    },
  ];
  result.activity.evidence = [
    {
      id: 'evidence-1',
      taskId: 'task-a',
      kind: 'test',
      summary: 'Teste concluído',
      observedAt: '2026-10-23T14:04:00.000Z',
    },
  ];
  return result;
}

test('activity integralmente vinculada à task selecionada é aplicada', () => {
  const h = harness();
  const current = snapshotWithActivity(5);
  assert.equal(h.controller.applySnapshot(current), 'applied');
  assert.equal(h.activity.value?.authorizations.length, 1);
  assert.equal(h.activity.value?.checkpoints.length, 1);
  assert.equal(h.activity.value?.events.length, 1);
  assert.equal(h.activity.value?.evidence.length, 1);
  assert.deepEqual(h.recorded, [5]);
});

test('Activity de outra task é rejeitada sem alterar estado ou notificar', () => {
  const corruptions: Array<{
    kind: string;
    apply: (value: AgentRealtimeSnapshot) => void;
  }> = [
    {
      kind: 'authorizations',
      apply: (value) => {
        value.activity.authorizations[0]!.taskId = 'task-b';
      },
    },
    {
      kind: 'checkpoints',
      apply: (value) => {
        value.activity.checkpoints[0]!.taskId = 'task-b';
      },
    },
    {
      kind: 'events',
      apply: (value) => {
        value.activity.events[0]!.taskId = 'task-b';
      },
    },
    {
      kind: 'evidence',
      apply: (value) => {
        value.activity.evidence[0]!.taskId = 'task-b';
      },
    },
  ];

  for (const { kind, apply } of corruptions) {
    const h = harness();
    assert.equal(h.controller.applySnapshot(snapshotWithActivity(5)), 'applied');
    const lastStatus = h.status.value;
    const lastActivity = h.activity.value;
    const wrong = snapshotWithActivity(6);
    apply(wrong);
    assert.equal(h.controller.applySnapshot(wrong), 'invalid', kind);
    assert.equal(h.status.value, lastStatus, kind);
    assert.equal(h.activity.value, lastActivity, kind);
    assert.deepEqual(h.recorded, [5], kind);

    // A malformed update cannot poison the owner for the next good version.
    assert.equal(h.controller.applySnapshot(snapshotWithActivity(7)), 'applied');
    assert.deepEqual(h.recorded, [5, 7], kind);
  }
});

test('itens nulos ou incompletos em Activity também falham fechado', () => {
  const h = harness();
  const invalid = snapshotWithActivity(1);
  invalid.activity.events.push(
    null as unknown as AgentRealtimeSnapshot['activity']['events'][number],
  );
  assert.equal(h.controller.applySnapshot(invalid), 'invalid');
  const missingTaskId = snapshotWithActivity(2);
  delete (missingTaskId.activity.evidence[0] as { taskId?: string }).taskId;
  assert.equal(h.controller.applySnapshot(missingTaskId), 'invalid');
  assert.equal(h.status.value, null);
  assert.deepEqual(h.recorded, []);
});

test('cockpit compartilha guard de snapshots entre REST e WebSocket', () => {
  const panel = readFileSync(
    resolve(import.meta.dirname, '../src/components/ProjectAgentPanel.vue'),
    'utf8',
  );
  assert.match(panel, /useAgentTaskSnapshots\(/);
  assert.match(panel, /useAgentTaskRealtime\([\s\S]*?applySnapshot,/);
  assert.match(panel, /const snapshotResult = applySnapshot\(/);
  assert.match(panel, /snapshotResult === 'invalid'/);
  assert.match(panel, /snapshotResult === 'stale'/);
  assert.doesNotMatch(panel, /function applySnapshot\(/);
  assert.match(panel, /publishAgentNotifications\(snapshot\)/);
});
