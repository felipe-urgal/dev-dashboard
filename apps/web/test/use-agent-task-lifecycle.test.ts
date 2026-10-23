import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ref } from 'vue';
import { test } from 'vitest';

import {
  type AgentExecutionResult,
  type AgentTaskRecord,
  type AgentTaskStatus,
  type executeAgentTask,
  type cancelAgentTask,
  type retryAgentTask,
  type recoverAgentTask,
} from '../src/api/agent-runtime';
import { useAgentTaskLifecycle } from '../src/composables/useAgentTaskLifecycle';

function record(taskId: string, projectId = 'project-a'): AgentTaskRecord {
  return {
    task: {
      id: taskId,
      projectId,
      state: 'review',
      summary: 'Disposable test task',
      requestedCapabilities: [],
      createdAt: '2026-10-23T10:00:00Z',
      updatedAt: '2026-10-23T10:00:00Z',
    },
    version: 1,
  };
}

function status(taskId: string): AgentTaskStatus {
  return { task: record(taskId), runtime: { state: 'idle' } } as AgentTaskStatus;
}

function harness() {
  const target = {
    projectId: 'project-a',
    taskId: 'task-a',
    state: 'queued' as 'queued' | 'failed' | 'blocked' | 'review',
    runtimeState: 'idle',
    activeExecution: false,
  };
  const mutating = ref(false);
  const replaced: string[] = [];
  const executionResults: string[] = [];
  const reloads: string[] = [];
  const errors: string[] = [];
  const requests: Array<{
    projectId: string;
    taskId: string;
    providerId: string;
    attachmentIds: string[];
    profileId: string | undefined;
    resolve: (value: AgentExecutionResult) => void;
    reject: (error: Error) => void;
  }> = [];
  const mutations: Array<{
    kind: 'cancel' | 'retry' | 'recover';
    projectId: string;
    taskId: string;
    resolve: (value: never) => void;
    reject: (error: Error) => void;
  }> = [];
  const execute: typeof executeAgentTask = (projectId, taskId, providerId, attachmentIds, profileId) =>
    new Promise((resolve, reject) => {
      requests.push({ projectId, taskId, providerId, attachmentIds, profileId, resolve, reject });
    });
  function mutation<T>(
    kind: 'cancel' | 'retry' | 'recover',
    projectId: string,
    taskId: string,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      mutations.push({
        kind,
        projectId,
        taskId,
        resolve: resolve as (value: never) => void,
        reject,
      });
    });
  }
  const cancel: typeof cancelAgentTask = (projectId, taskId) =>
    mutation('cancel', projectId, taskId);
  const retry: typeof retryAgentTask = (projectId, taskId) =>
    mutation('retry', projectId, taskId);
  const recover: typeof recoverAgentTask = (projectId, taskId) =>
    mutation('recover', projectId, taskId);
  let allowed = true;
  let cleared = 0;
  const state = useAgentTaskLifecycle(
    () => target,
    () => allowed,
    mutating,
    (result) => executionResults.push(result.task.task.id),
    (result) => replaced.push(result.task.id),
    async (selected) => { reloads.push(selected.taskId); },
    (message) => errors.push(message),
    () => { cleared += 1; },
    { execute, cancel, retry, recover },
  );
  return {
    state, target, mutating, requests, mutations, errors,
    replaced, executionResults, reloads,
    allow: (value: boolean) => { allowed = value; },
    cleared: () => cleared,
  };
}

const execution = (taskId: string, projectId = 'project-a') =>
  ({ task: record(taskId, projectId) }) as AgentExecutionResult;

test('execution captures provider and attachments exactly once, then reconciles', async () => {
  const h = harness();
  const ids = ['attachment-1'];
  const pending = h.state.executeCurrent({
    providerId: 'automatic',
    attachmentIds: ids,
    profileId: 'safe-profile',
  });
  ids.push('attachment-2');
  await h.state.executeCurrent({ providerId: 'codex', attachmentIds: ids });
  assert.equal(h.requests.length, 1);
  assert.deepEqual(
    [
      h.requests[0]!.projectId,
      h.requests[0]!.taskId,
      h.requests[0]!.providerId,
      h.requests[0]!.attachmentIds,
      h.requests[0]!.profileId,
    ],
    ['project-a', 'task-a', 'automatic', ['attachment-1'], 'safe-profile'],
  );
  assert.equal(h.state.executing.value, true);
  h.requests[0]!.resolve(execution('task-a'));
  await pending;
  assert.deepEqual(h.executionResults, ['task-a']);
  assert.deepEqual(h.replaced, ['task-a']);
  assert.deepEqual(h.reloads, ['task-a']);
  assert.equal(h.state.executing.value, false);
  assert.equal(h.cleared(), 1);
});

test('A → B → A invalidates a late execution without replay or corrupting selection', async () => {
  const h = harness();
  const old = h.state.executeCurrent({ providerId: 'codex', attachmentIds: [] });
  h.target.taskId = 'task-b';
  h.state.resetLifecycle();
  h.target.taskId = 'task-a';
  h.state.resetLifecycle();
  await h.state.executeCurrent({ providerId: 'codex', attachmentIds: [] });
  assert.equal(h.requests.length, 1, 'in-flight provider execution remains locked');
  h.requests[0]!.resolve(execution('task-a'));
  await old;
  assert.deepEqual(h.executionResults, []);
  assert.deepEqual(h.replaced, []);
  assert.deepEqual(h.reloads, []);
  assert.equal(h.state.executing.value, false);
});

test('stale execution error is ignored; ambiguous current error reloads without replay', async () => {
  const h = harness();
  const stale = h.state.executeCurrent({ providerId: 'codex', attachmentIds: [] });
  h.target.projectId = 'project-b';
  h.state.resetLifecycle();
  h.requests[0]!.reject(new Error('stale private error'));
  await stale;
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.reloads, []);
  const current = h.state.executeCurrent({ providerId: 'automatic', attachmentIds: [] });
  h.requests[1]!.reject(new Error('Connection closed'));
  await current;
  assert.deepEqual(h.errors, ['Connection closed']);
  assert.deepEqual(h.reloads, ['task-a']);
  assert.equal(h.requests.length, 2);
});

test('cancel uses canonical selected active execution and keeps shared mutation lock', async () => {
  const h = harness();
  await h.state.cancelCurrent();
  assert.equal(h.mutations.length, 0);
  h.target.activeExecution = true;
  const pending = h.state.cancelCurrent();
  assert.equal(h.mutating.value, true);
  h.target.taskId = 'task-b';
  h.state.resetLifecycle();
  await h.state.cancelCurrent();
  assert.equal(h.mutations.length, 1);
  h.mutations[0]!.resolve(status('task-a'));
  await pending;
  assert.deepEqual(h.replaced, []);
  assert.deepEqual(h.reloads, []);
  assert.equal(h.mutating.value, false);
});

test('retry requires failed state and recovery requires interrupted/blocked without replay', async () => {
  const h = harness();
  await h.state.retryCurrent();
  await h.state.recoverCurrent();
  assert.equal(h.mutations.length, 0);
  h.target.state = 'failed';
  const retry = h.state.retryCurrent();
  assert.equal(h.mutations[0]?.kind, 'retry');
  h.mutations[0]!.resolve(record('task-a'));
  await retry;
  assert.deepEqual(h.replaced, ['task-a']);
  assert.deepEqual(h.reloads, ['task-a']);

  h.target.state = 'review';
  h.target.runtimeState = 'interrupted';
  const recover = h.state.recoverCurrent();
  assert.equal(h.mutations[1]?.kind, 'recover');
  h.mutations[1]!.resolve(status('task-a'));
  await recover;
  assert.deepEqual(h.replaced, ['task-a', 'task-a']);
  assert.deepEqual(h.reloads, ['task-a', 'task-a']);
});

test('forged response task or project does not overwrite current state', async () => {
  const h = harness();
  const pending = h.state.executeCurrent({ providerId: 'codex', attachmentIds: [] });
  h.requests[0]!.resolve(execution('task-b'));
  await pending;
  assert.deepEqual(h.replaced, []);
  assert.deepEqual(h.executionResults, []);
  assert.match(h.errors[0] ?? '', /não corresponde/);
  assert.deepEqual(h.reloads, ['task-a']);
});

test('failed retry refreshes canonical state but does not issue another write', async () => {
  const h = harness();
  h.target.state = 'failed';
  const pending = h.state.retryCurrent();
  h.mutations[0]!.reject(new Error('Remote response lost'));
  await pending;
  assert.deepEqual(h.errors, ['Remote response lost']);
  assert.deepEqual(h.reloads, ['task-a']);
  assert.equal(h.mutations.length, 1);
  assert.equal(h.mutating.value, false);
});

test('guards reject stale/unauthorized execution without dispatching', async () => {
  const h = harness();
  h.allow(false);
  await h.state.executeCurrent({ providerId: 'automatic', attachmentIds: [] });
  h.allow(true);
  h.target.state = 'review';
  await h.state.executeCurrent({ providerId: 'automatic', attachmentIds: [] });
  h.target.state = 'queued';
  h.target.activeExecution = true;
  await h.state.executeCurrent({ providerId: 'automatic', attachmentIds: [] });
  h.target.activeExecution = false;
  h.mutating.value = true;
  await h.state.executeCurrent({ providerId: 'automatic', attachmentIds: [] });
  assert.equal(h.requests.length, 0);
});

test('cockpit delegates lifecycle and invalidates stale async operations', () => {
  const panel = readFileSync(
    resolve(import.meta.dirname, '../src/components/ProjectAgentPanel.vue'),
    'utf8',
  );
  assert.match(panel, /useAgentTaskLifecycle\(/);
  assert.match(panel, /resetLifecycle\(\)/);
  assert.match(panel, /submitExecution\(/);
  assert.doesNotMatch(panel, /async function cancelCurrent\(/);
  assert.doesNotMatch(panel, /async function retryCurrent\(/);
  assert.doesNotMatch(panel, /async function recoverCurrent\(/);
  assert.match(panel, /:disabled="!canExecute"/);
});
