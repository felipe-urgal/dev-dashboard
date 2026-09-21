import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentAuthorizationError,
  AgentSerializationError,
  AgentStateTransitionError,
  assertAgentCapabilitiesAuthorized,
  deserializeAgentTask,
  grantedAgentCapabilities,
  isTerminalAgentTaskState,
  serializeAgentTask,
  transitionAgentTask,
  type AgentAuthorization,
  type AgentExecution,
  type AgentTask,
} from '../src/index.js';

function task(state: AgentTask['state'] = 'queued'): AgentTask {
  return {
    id: 'task-1',
    projectId: 'project-1',
    environmentInstanceId: 'env-1',
    state,
    summary: 'Implement the requested change',
    requestedCapabilities: ['workspace:write', 'git:commit'],
    createdAt: '2026-09-21T21:00:00.000Z',
    updatedAt: '2026-09-21T21:00:00.000Z',
  };
}

test('valid task transitions preserve identity and update observed time', () => {
  const running = transitionAgentTask(
    task(),
    'running',
    '2026-09-21T21:01:00.000Z',
  );

  assert.equal(running.id, 'task-1');
  assert.equal(running.environmentInstanceId, 'env-1');
  assert.equal(running.state, 'running');
  assert.equal(running.updatedAt, '2026-09-21T21:01:00.000Z');
});

test('invalid transitions fail closed and terminal states stay terminal', () => {
  assert.throws(
    () =>
      transitionAgentTask(
        task('completed'),
        'running',
        '2026-09-21T21:01:00.000Z',
      ),
    AgentStateTransitionError,
  );

  assert.equal(isTerminalAgentTaskState('completed'), true);
  assert.equal(isTerminalAgentTaskState('cancelled'), true);
  assert.equal(isTerminalAgentTaskState('failed'), false);
});

test('provider-required capabilities cannot expand the granted authorization set', () => {
  const authorizations: AgentAuthorization[] = [
    {
      taskId: 'task-1',
      capability: 'workspace:write',
      granted: true,
      observedAt: '2026-09-21T21:00:00.000Z',
    },
    {
      taskId: 'task-1',
      capability: 'git:push',
      granted: false,
      observedAt: '2026-09-21T21:00:00.000Z',
    },
  ];

  const granted = grantedAgentCapabilities(authorizations);

  assert.deepEqual(granted, ['workspace:write']);
  assert.doesNotThrow(() =>
    assertAgentCapabilitiesAuthorized(['workspace:write'], granted),
  );
  assert.throws(
    () => assertAgentCapabilitiesAuthorized(['git:push'], granted),
    AgentAuthorizationError,
  );
});

test('task serialization is bounded to the public contract', () => {
  const serialized = serializeAgentTask(task());
  const roundTrip = deserializeAgentTask(serialized);

  assert.deepEqual(roundTrip, task());
  assert.equal(serialized.includes('argv'), false);
  assert.equal(serialized.includes('cwd'), false);
  assert.equal(serialized.includes('secret'), false);
});

test('deserialization rejects authority-bearing or unknown fields', () => {
  const unsafe = JSON.stringify({
    ...task(),
    cwd: '/tmp/repository',
  });

  assert.throws(() => deserializeAgentTask(unsafe), AgentSerializationError);
});

test('ambiguous execution failure is represented explicitly', () => {
  const execution: AgentExecution = {
    id: 'execution-1',
    taskId: 'task-1',
    projectId: 'project-1',
    environmentInstanceId: 'env-1',
    providerId: 'codex',
    state: 'unknown',
    failure: {
      kind: 'ambiguous',
      code: 'process-exit-unknown',
      message: 'Provider process ended without a terminal result',
    },
  };

  assert.equal(execution.failure?.kind, 'ambiguous');
  assert.equal(execution.state, 'unknown');
});

test('checkpoint requires an explicit valid transition before work resumes', () => {
  const checkpoint = transitionAgentTask(
    task('running'),
    'checkpoint',
    '2026-09-21T21:02:00.000Z',
  );

  assert.equal(checkpoint.state, 'checkpoint');
  assert.throws(
    () =>
      transitionAgentTask(
        checkpoint,
        'completed',
        '2026-09-21T21:03:00.000Z',
      ),
    AgentStateTransitionError,
  );

  const resumed = transitionAgentTask(
    checkpoint,
    'running',
    '2026-09-21T21:04:00.000Z',
  );
  assert.equal(resumed.state, 'running');
});

test('cancellation ownership carries project, environment, task and execution identity', () => {
  const cancellation = {
    ownership: {
      projectId: 'project-1',
      environmentInstanceId: 'env-1',
      taskId: 'task-1',
      executionId: 'execution-1',
    },
    requestedAt: '2026-09-21T21:05:00.000Z',
  } satisfies import('../src/index.js').AgentCancellationRequest;

  assert.deepEqual(cancellation.ownership, {
    projectId: 'project-1',
    environmentInstanceId: 'env-1',
    taskId: 'task-1',
    executionId: 'execution-1',
  });
});
