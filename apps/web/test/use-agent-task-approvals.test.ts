import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ref } from 'vue';
import { test } from 'vitest';

import {
  type AgentActivity,
  type AgentAuthorization,
  type AgentCheckpoint,
  type AgentTaskRecord,
  type fetchAgentActivity,
  type resolveAgentCheckpoint,
  type setAgentAuthorization,
} from '../src/api/agent-runtime';
import {
  authorizationScopeLabel,
  useAgentTaskApprovals,
} from '../src/composables/useAgentTaskApprovals';

function checkpoint(
  id: string,
  taskId: string,
  status: AgentCheckpoint['status'] = 'pending',
): AgentCheckpoint {
  return {
    id,
    taskId,
    status,
    summary: 'Confirme antes de executar.',
    requiredCapabilities: ['git:push'],
    createdAt: '2026-10-23T12:00:00.000Z',
  };
}

function authorization(taskId: string, granted: boolean): AgentAuthorization {
  return {
    taskId,
    capability: 'git:push',
    granted,
    observedAt: '2026-10-23T12:00:00.000Z',
    scope: { kind: 'branch', projectId: 'project-a', branch: 'main' },
  };
}

function activityFor(
  checkpoints: AgentCheckpoint[] = [],
  authorizations: AgentAuthorization[] = [],
): AgentActivity {
  return { checkpoints, authorizations, evidence: [], events: [] };
}

function taskRecord(taskId: string): AgentTaskRecord {
  return { task: { id: taskId } } as AgentTaskRecord;
}

function harness() {
  const selected = {
    projectId: 'project-a',
    taskId: 'task-a',
    requestedCapabilities: ['git:push'] as Array<'git:push'>,
  };
  const activity = ref<AgentActivity | null>(
    activityFor(
      [checkpoint('cp-a', 'task-a')],
      [authorization('task-a', false)],
    ),
  );
  const mutating = ref(false);
  let ready = true;
  const errors: string[] = [];
  let clears = 0;
  const replaced: string[] = [];
  const reloads: string[] = [];
  const pendingAuthorizations: Array<{
    projectId: string;
    taskId: string;
    granted: boolean;
    capability: string;
    resolve: (result: AgentAuthorization) => void;
    reject: (error: Error) => void;
  }> = [];
  const pendingResolutions: Array<{
    projectId: string;
    taskId: string;
    checkpointId: string;
    decision: string;
    instruction: string | undefined;
    resolve: (result: {
      task: AgentTaskRecord;
      checkpoint: AgentCheckpoint;
    }) => void;
    reject: (error: Error) => void;
  }> = [];
  const pendingActivity: Array<{
    projectId: string;
    taskId: string;
    resolve: (result: AgentActivity) => void;
    reject: (error: Error) => void;
  }> = [];
  const authorize: typeof setAgentAuthorization = (
    projectId,
    taskId,
    capability,
    granted,
  ) =>
    new Promise((resolve, reject) => {
      pendingAuthorizations.push({
        projectId,
        taskId,
        capability,
        granted,
        resolve,
        reject,
      });
    });
  const resolveCheckpoint: typeof resolveAgentCheckpoint = (
    projectId,
    taskId,
    checkpointId,
    decision,
    instruction,
  ) =>
    new Promise((resolve, reject) => {
      pendingResolutions.push({
        projectId,
        taskId,
        checkpointId,
        decision,
        instruction,
        resolve,
        reject,
      });
    });
  const fetchActivity: typeof fetchAgentActivity = (projectId, taskId) =>
    new Promise((resolve, reject) => {
      pendingActivity.push({ projectId, taskId, resolve, reject });
    });
  const state = useAgentTaskApprovals(
    () => (ready ? selected : null),
    activity,
    mutating,
    (record) => replaced.push(record.task.id),
    async (target) => {
      reloads.push(target.taskId);
    },
    (message) => errors.push(message),
    () => {
      clears += 1;
    },
    { authorize, resolve: resolveCheckpoint, fetchActivity },
  );
  return {
    selected,
    activity,
    mutating,
    errors,
    replaced,
    reloads,
    state,
    pendingAuthorizations,
    pendingResolutions,
    pendingActivity,
    setReady: (value: boolean) => {
      ready = value;
    },
    clears: () => clears,
  };
}

test('exibe apenas autorização e checkpoint da task selecionada sem derivar grants', () => {
  const h = harness();
  assert.equal(h.state.pendingCheckpoint.value?.id, 'cp-a');
  assert.equal(h.state.authorizationGranted('git:push'), false);
  assert.equal(
    authorizationScopeLabel(
      h.state.authorizationByCapability.value.get('git:push')?.scope,
    ),
    'Branch · main',
  );

  h.activity.value = activityFor(
    [
      checkpoint('old', 'task-a', 'approved'),
      checkpoint('foreign', 'task-b'),
      checkpoint('current', 'task-a'),
    ],
    [authorization('task-b', true), authorization('task-a', false)],
  );
  assert.equal(h.state.pendingCheckpoint.value?.id, 'current');
  assert.equal(h.state.authorizationGranted('git:push'), false);
  h.setReady(false);
  assert.equal(h.state.pendingCheckpoint.value, null);
  assert.equal(h.state.authorizationGranted('git:push'), false);
});

test('deny-list local impede mutações fora da task, capability ou lock permitido', async () => {
  const h = harness();
  h.setReady(false);
  await h.state.toggleAuthorization('git:push', true);
  await h.state.resolveCheckpoint('approved');
  h.setReady(true);
  await h.state.toggleAuthorization('github:merge', true);
  h.mutating.value = true;
  await h.state.toggleAuthorization('git:push', true);
  await h.state.resolveCheckpoint('approved');
  h.mutating.value = false;
  h.activity.value = activityFor([checkpoint('cp-a', 'task-a', 'approved')]);
  await h.state.resolveCheckpoint('approved');
  assert.equal(h.pendingAuthorizations.length, 0);
  assert.equal(h.pendingResolutions.length, 0);
  assert.deepEqual(h.errors, []);
});

test('autorização captura contexto, serializa mutações e mostra apenas grant canônico', async () => {
  const h = harness();
  const pending = h.state.toggleAuthorization('git:push', true);
  assert.equal(h.pendingAuthorizations.length, 1);
  assert.deepEqual(
    [
      h.pendingAuthorizations[0]?.projectId,
      h.pendingAuthorizations[0]?.taskId,
      h.pendingAuthorizations[0]?.capability,
      h.pendingAuthorizations[0]?.granted,
    ],
    ['project-a', 'task-a', 'git:push', true],
  );
  assert.equal(h.mutating.value, true);
  assert.equal(h.state.authorizationGranted('git:push'), false);
  await h.state.toggleAuthorization('git:push', false);
  await h.state.resolveCheckpoint('rejected');
  assert.equal(h.pendingAuthorizations.length, 1);
  assert.equal(h.pendingResolutions.length, 0);

  h.pendingAuthorizations[0]!.resolve(authorization('task-a', true));
  await Promise.resolve();
  assert.equal(h.pendingActivity.length, 1);
  assert.equal(h.state.authorizationGranted('git:push'), false);
  h.pendingActivity[0]!.resolve(
    activityFor(
      [checkpoint('cp-a', 'task-a')],
      [authorization('task-a', true)],
    ),
  );
  await pending;
  assert.equal(h.state.authorizationGranted('git:push'), true);
  assert.equal(h.mutating.value, false);
  assert.equal(h.clears(), 1);
});

test('autorização antiga A → B → A não polui novo snapshot nem reporta erro', async () => {
  const h = harness();
  const stale = h.state.toggleAuthorization('git:push', true);
  h.selected.taskId = 'task-b';
  h.state.resetApprovals();
  h.selected.taskId = 'task-a';
  h.state.resetApprovals();
  h.activity.value = activityFor([], [authorization('task-a', false)]);
  h.pendingAuthorizations[0]!.reject(new Error('stale private failure'));
  await stale;
  assert.equal(h.state.authorizationGranted('git:push'), false);
  assert.deepEqual(h.errors, []);
  assert.equal(h.pendingActivity.length, 0);
  assert.equal(h.mutating.value, false);
});

test('resposta tardia da leitura canônica nunca escreve na nova task', async () => {
  const h = harness();
  const pending = h.state.toggleAuthorization('git:push', true);
  h.pendingAuthorizations[0]!.resolve(authorization('task-a', true));
  await Promise.resolve();
  assert.equal(h.pendingActivity.length, 1);
  h.selected.projectId = 'project-b';
  h.state.resetApprovals();
  h.activity.value = activityFor();
  h.pendingActivity[0]!.resolve(
    activityFor([], [authorization('task-a', true)]),
  );
  await pending;
  assert.equal(h.activity.value?.authorizations.length, 0);
  assert.equal(h.mutating.value, false);
});

test('falha ambígua de autorização preserva erro e reconsulta estado sem grant otimista', async () => {
  const h = harness();
  const failing = h.state.toggleAuthorization('git:push', true);
  h.pendingAuthorizations[0]!.reject(new Error('API unavailable'));
  await Promise.resolve();
  assert.deepEqual(h.errors, ['API unavailable']);
  assert.equal(h.pendingActivity.length, 1);
  h.pendingActivity[0]!.reject(new Error('activity unavailable'));
  await failing;
  assert.equal(h.state.authorizationGranted('git:push'), false);
  assert.equal(h.mutating.value, false);
});

test('aprovação captura checkpoint e instrução; decisão não é reenviada', async () => {
  const h = harness();
  h.state.checkpointInstruction.value = '  Verifique o diff primeiro.  ';
  const pending = h.state.resolveCheckpoint('approved');
  assert.deepEqual(
    h.pendingResolutions.map(
      ({ projectId, taskId, checkpointId, decision, instruction }) => ({
        projectId,
        taskId,
        checkpointId,
        decision,
        instruction,
      }),
    ),
    [
      {
        projectId: 'project-a',
        taskId: 'task-a',
        checkpointId: 'cp-a',
        decision: 'approved',
        instruction: '  Verifique o diff primeiro.  ',
      },
    ],
  );
  await h.state.resolveCheckpoint('rejected');
  assert.equal(h.pendingResolutions.length, 1);
  h.pendingResolutions[0]!.resolve({
    task: taskRecord('task-a'),
    checkpoint: checkpoint('cp-a', 'task-a', 'approved'),
  });
  await pending;
  assert.deepEqual(h.replaced, ['task-a']);
  assert.deepEqual(h.reloads, ['task-a']);
  assert.equal(h.state.checkpointInstruction.value, '');
  assert.equal(h.mutating.value, false);
});

test('checkpoint de A não executa callbacks em B nem após retorno A → B → A', async () => {
  const h = harness();
  h.state.checkpointInstruction.value = 'Draft original';
  const old = h.state.resolveCheckpoint('rejected');
  h.selected.taskId = 'task-b';
  h.state.resetApprovals();
  h.selected.taskId = 'task-a';
  h.state.resetApprovals();
  h.state.checkpointInstruction.value = 'Novo draft';
  h.pendingResolutions[0]!.resolve({
    task: taskRecord('task-a'),
    checkpoint: checkpoint('cp-a', 'task-a', 'rejected'),
  });
  await old;
  assert.deepEqual(h.replaced, []);
  assert.deepEqual(h.reloads, []);
  assert.deepEqual(h.errors, []);
  assert.equal(h.state.checkpointInstruction.value, 'Novo draft');
  assert.equal(h.mutating.value, false);
});

test('erro após resolução ambígua força reload, sem aprovar automaticamente', async () => {
  const h = harness();
  h.state.checkpointInstruction.value = 'Não descartar';
  const pending = h.state.resolveCheckpoint('approved');
  h.pendingResolutions[0]!.reject(new Error('Lost response'));
  await pending;
  assert.deepEqual(h.errors, ['Lost response']);
  assert.deepEqual(h.reloads, ['task-a']);
  assert.deepEqual(h.replaced, []);
  assert.equal(h.state.checkpointInstruction.value, 'Não descartar');
  assert.equal(h.pendingResolutions.length, 1);
  assert.equal(h.mutating.value, false);
});

test('checkpoint com resposta de task divergente falha fechado', async () => {
  const h = harness();
  const pending = h.state.resolveCheckpoint('approved');
  h.pendingResolutions[0]!.resolve({
    task: taskRecord('task-b'),
    checkpoint: checkpoint('cp-a', 'task-a', 'approved'),
  });
  await pending;
  assert.deepEqual(h.replaced, []);
  assert.deepEqual(h.reloads, ['task-a']);
  assert.match(h.errors[0] ?? '', /não corresponde à task/);
});

test('painel possui único owner para checkpoint/grants e invalida ao trocar contexto', () => {
  const panel = readFileSync(
    resolve(import.meta.dirname, '../src/components/ProjectAgentPanel.vue'),
    'utf8',
  );
  assert.match(panel, /useAgentTaskApprovals\(/);
  assert.match(panel, /resetApprovals\(\)/);
  assert.doesNotMatch(panel, /async function toggleAuthorization\(/);
  assert.doesNotMatch(panel, /async function resolveCheckpoint\(/);
  assert.match(panel, /:disabled="mutating"\s+rows="3"/);
});
