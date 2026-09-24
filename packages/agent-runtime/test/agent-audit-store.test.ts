import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { AgentAuditStore } from '../src/agent-audit-store.js';

test('AgentAuditStore persiste autorização atual com audit trail bounded', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-audit-store-'));
  context.after(() => rm(root, { recursive: true, force: true }));

  let nextId = 0;
  const store = new AgentAuditStore({
    stateDirectory: root,
    maxEvents: 3,
    createEventId: () => `event-${++nextId}`,
  });

  await store.setAuthorization(
    'task-1',
    'workspace:write',
    true,
    '2026-09-23T11:00:00.000Z',
  );
  await store.setAuthorization(
    'task-1',
    'git:commit',
    true,
    '2026-09-23T11:01:00.000Z',
  );
  await store.setAuthorization(
    'task-1',
    'workspace:write',
    false,
    '2026-09-23T11:02:00.000Z',
  );
  await store.setAuthorization(
    'task-1',
    'git:push',
    true,
    '2026-09-23T11:03:00.000Z',
  );

  const snapshot = await store.snapshot('task-1');
  assert.deepEqual(snapshot.authorizations, [
    {
      taskId: 'task-1',
      capability: 'git:commit',
      granted: true,
      observedAt: '2026-09-23T11:01:00.000Z',
    },
    {
      taskId: 'task-1',
      capability: 'git:push',
      granted: true,
      observedAt: '2026-09-23T11:03:00.000Z',
    },
    {
      taskId: 'task-1',
      capability: 'workspace:write',
      granted: false,
      observedAt: '2026-09-23T11:02:00.000Z',
    },
  ]);
  assert.equal(snapshot.events.length, 3);
  assert.equal(snapshot.events[0]?.id, 'event-2');
  assert.equal(snapshot.events[2]?.id, 'event-4');

  const auditDir = path.join(root, 'audit');
  const [name] = await import('node:fs/promises').then((fs) =>
    fs.readdir(auditDir),
  );
  assert.ok(name);
  const mode = (await stat(path.join(auditDir, name!))).mode & 0o777;
  assert.equal(mode, 0o600);

  const serialized = await readFile(path.join(auditDir, name!), 'utf8');
  assert.doesNotMatch(serialized, /cwd|argv|secret/i);
});

test('AgentAuditStore persiste e resolve checkpoint explicitamente', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-audit-checkpoint-'));
  context.after(() => rm(root, { recursive: true, force: true }));

  let nextId = 0;
  const store = new AgentAuditStore({
    stateDirectory: root,
    createEventId: () => `event-${++nextId}`,
  });

  const created = await store.createCheckpoint({
    id: 'checkpoint-1',
    taskId: 'task-1',
    executionId: 'execution-1',
    status: 'pending',
    summary: 'Approval required.',
    requiredCapabilities: ['workspace:write', 'workspace:write'],
    createdAt: '2026-09-23T11:10:00.000Z',
  });

  assert.deepEqual(created.requiredCapabilities, ['workspace:write']);
  assert.equal((await store.snapshot('task-1')).checkpoints.length, 1);

  const resolved = await store.resolveCheckpoint(
    'task-1',
    'checkpoint-1',
    'approved',
    '2026-09-23T11:11:00.000Z',
    'Continue with the change.',
  );

  assert.equal(resolved.status, 'approved');
  assert.equal(resolved.continuationInstruction, 'Continue with the change.');
  assert.equal(
    (await store.latestApprovedCheckpoint('task-1'))?.id,
    'checkpoint-1',
  );

  await assert.rejects(
    store.resolveCheckpoint(
      'task-1',
      'checkpoint-1',
      'rejected',
      '2026-09-23T11:12:00.000Z',
    ),
    /not pending/,
  );
});

test('AgentAuditStore reaplica resultado de execução de forma idempotente e permite enrichment', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-audit-idempotent-'));
  context.after(() => rm(root, { recursive: true, force: true }));

  let nextId = 0;
  const store = new AgentAuditStore({
    stateDirectory: root,
    createEventId: () => `event-${++nextId}`,
  });
  const firstEvidence = {
    id: 'evidence-1',
    taskId: 'task-1',
    executionId: 'execution-1',
    kind: 'test' as const,
    summary: 'Tests passed.',
    observedAt: '2026-09-23T11:04:00.000Z',
  };
  const contextEvidence = {
    id: 'evidence-2',
    taskId: 'task-1',
    executionId: 'execution-1',
    kind: 'readiness' as const,
    summary: 'Readiness passed.',
    observedAt: '2026-09-23T11:04:30.000Z',
  };

  await store.appendExecutionResult(
    'task-1',
    'execution-1',
    'codex',
    'Execution completed.',
    '2026-09-23T11:05:00.000Z',
    [firstEvidence],
  );
  await store.appendExecutionResult(
    'task-1',
    'execution-1',
    'codex',
    'Execution completed.',
    '2026-09-23T11:05:00.000Z',
    [firstEvidence, contextEvidence],
  );

  const snapshot = await store.snapshot('task-1');
  assert.equal(
    snapshot.events.filter((event) => event.type === 'execution-state').length,
    1,
  );
  assert.equal(
    snapshot.events.filter((event) => event.type === 'evidence').length,
    2,
  );
  assert.deepEqual(
    snapshot.evidence.map((item) => item.id),
    ['evidence-1', 'evidence-2'],
  );

  await assert.rejects(
    store.appendExecutionResult(
      'task-1',
      'execution-1',
      'codex',
      'Different summary.',
      '2026-09-23T11:05:00.000Z',
      [firstEvidence],
    ),
    /already exists with different data/,
  );
  await assert.rejects(
    store.appendExecutionResult(
      'task-1',
      'execution-1',
      'codex',
      'Execution completed.',
      '2026-09-23T11:05:00.000Z',
      [{ ...firstEvidence, summary: 'Changed evidence.' }],
    ),
    /already exists with different data/,
  );
});

test('AgentAuditStore persiste evidence bounded com ownership da execução', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-audit-evidence-'));
  context.after(() => rm(root, { recursive: true, force: true }));

  let nextId = 0;
  const store = new AgentAuditStore({
    stateDirectory: root,
    maxEvents: 10,
    maxEvidence: 2,
    createEventId: () => `event-${++nextId}`,
  });

  await store.appendExecutionResult(
    'task-1',
    'execution-1',
    'codex',
    'Execution completed.',
    '2026-09-23T11:05:00.000Z',
    [
      {
        id: 'evidence-1',
        taskId: 'task-1',
        executionId: 'execution-1',
        kind: 'diff',
        summary: 'Diff ready.',
        observedAt: '2026-09-23T11:04:00.000Z',
      },
      {
        id: 'evidence-2',
        taskId: 'task-1',
        executionId: 'execution-1',
        kind: 'test',
        summary: 'Tests passed.',
        observedAt: '2026-09-23T11:04:30.000Z',
      },
      {
        id: 'evidence-3',
        taskId: 'task-1',
        executionId: 'execution-1',
        kind: 'readiness',
        summary: 'Ready for review.',
        observedAt: '2026-09-23T11:04:45.000Z',
      },
    ],
  );

  const snapshot = await store.snapshot('task-1');
  assert.deepEqual(
    snapshot.evidence.map((item) => item.id),
    ['evidence-2', 'evidence-3'],
  );
  assert.equal(snapshot.events[0]?.type, 'execution-state');
  assert.equal(snapshot.events[0]?.providerId, 'codex');
  assert.equal(
    snapshot.events.filter((item) => item.type === 'evidence').length,
    3,
  );

  await assert.rejects(
    store.appendExecutionResult(
      'task-1',
      'execution-1',
      'codex',
      'x',
      '2026-09-23T11:06:00.000Z',
      [
        {
          id: 'wrong',
          taskId: 'task-2',
          executionId: 'execution-1',
          kind: 'log',
          summary: 'Wrong task.',
          observedAt: '2026-09-23T11:06:00.000Z',
        },
      ],
    ),
    /ownership is invalid/,
  );
});
