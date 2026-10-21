import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Stack, StackCheck, StackStartResult, StackStopResult } from '@dev-dashboard/contracts';

import { StackOperationJournal } from '../src/services/stack-operation-journal.js';
import { stackRevision } from '../src/services/stack-revision.js';

const NOW = new Date('2026-10-21T12:00:00.000Z');
function stack(): Stack {
  return {
    id: 'two-projects',
    name: 'Local Stack',
    nodes: [
      {
        id: 'db',
        name: 'Postgres',
        target: {
          kind: 'compose-service',
          projectId: 'loto',
          environmentInstanceId: 'environment:primary:loto',
          service: 'database',
        },
      },
      {
        id: 'api',
        name: 'API',
        target: {
          kind: 'compose-service',
          projectId: 'finance',
          environmentInstanceId: 'environment:primary:finance',
          service: 'api',
        },
      },
    ],
    dependencies: [{ nodeId: 'api', dependsOnNodeId: 'db' }],
  };
}
const check = { stack: stack() } as StackCheck;
const create = (root: string) => new StackOperationJournal(root, { now: () => NOW });

test('persisted intent precedes any owner call and final steps survive restart without diagnostics', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stack-operation-jobs-'));
  try {
    const journal = create(root);
    const definition = stack();
    const id = journal.begin(definition, 'start', stackRevision(definition), ['db', 'api']);
    const running = journal.get(id)!;
    assert.equal(running.status, 'running');
    assert.deepEqual(running.steps, []);
    assert.deepEqual(running.projectIds, ['loto', 'finance']);
    assert.equal(journal.activityJobs('loto')[0]?.id, 'stack-operation:' + id);
    assert.equal(journal.activityJobs('finance')[0]?.status, 'running');
    assert.deepEqual(journal.activityJobs('other'), []);

    const response: StackStartResult = {
      stackId: definition.id,
      state: 'completed',
      steps: [
        { nodeId: 'db', state: 'started', diagnostic: 'PASSWORD=do-not-persist' },
        { nodeId: 'api', state: 'already-ready' },
      ],
      check,
    };
    journal.finish(id, response);
    const reopened = create(root);
    const completed = reopened.get(id)!;
    assert.equal(completed.status, 'completed');
    assert.equal(completed.reconciliationRequired, false);
    assert.deepEqual(completed.steps, [
      { nodeId: 'db', state: 'started' },
      { nodeId: 'api', state: 'already-ready' },
    ]);
    assert.deepEqual(reopened.activityJobs('loto'), []);
    const file = path.join(root, 'stack-operations-v1', 'jobs', id + '.json');
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.doesNotMatch(readFileSync(file, 'utf8'), /do-not-persist|PASSWORD=/);
    assert.equal(reopened.begin(definition, 'stop', stackRevision(definition), ['api', 'db']).length, 36);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a lost writer is visible as requiring review and never causes automatic replay', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stack-operation-jobs-'));
  try {
    const definition = stack();
    const owner = create(root);
    const id = owner.begin(definition, 'stop', stackRevision(definition), ['api', 'db']);
    const freshProcess = create(root);
    const orphan = freshProcess.get(id)!;
    assert.equal(orphan.status, 'running');
    assert.equal(orphan.reconciliationRequired, true);
    const activity = freshProcess.activityJobs('finance')[0]!;
    assert.equal(activity.status, 'failed');
    assert.equal(activity.stage, 'reconciliation-required');
    assert.equal(activity.cancelSupported, false);
    assert.throws(() => freshProcess.begin(definition, 'start', stackRevision(definition), ['db', 'api']), /requires reconciliation/);
    assert.throws(() => freshProcess.finish(id, {
      stackId: definition.id,
      state: 'completed',
      steps: [],
      check,
    }), /requires reconciliation/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('failed and blocked results retain the claim and record only explicitly returned nodes', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stack-operation-jobs-'));
  try {
    const definition = stack();
    const journal = create(root);
    const id = journal.begin(definition, 'stop', stackRevision(definition), ['api', 'db']);
    const result: StackStopResult = {
      stackId: definition.id,
      state: 'blocked',
      steps: [
        { nodeId: 'api', state: 'retained', diagnostic: 'secret=never-store' },
        { nodeId: 'db', state: 'blocked' },
      ],
      check,
    };
    journal.finish(id, result);
    const record = create(root).get(id)!;
    assert.equal(record.status, 'blocked');
    assert.equal(record.reconciliationRequired, true);
    assert.deepEqual(record.steps, [
      { nodeId: 'api', state: 'retained' },
      { nodeId: 'db', state: 'blocked' },
    ]);
    assert.throws(() => journal.begin(definition, 'stop', stackRevision(definition), ['api', 'db']), /requires reconciliation/);
    assert.doesNotMatch(JSON.stringify(record), /never-store/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('interrupted request and corrupted disk record fail closed', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stack-operation-jobs-'));
  try {
    const journal = create(root);
    const definition = stack();
    const revision = stackRevision(definition);
    assert.throws(() => journal.begin(definition, 'start', 'a'.repeat(64), ['db', 'api']), /requires reconciliation/);
    assert.deepEqual(readdirSync(root), []);
    const id = journal.begin(definition, 'start', revision, ['db', 'api']);
    journal.interrupted(id);
    assert.equal(journal.get(id)?.status, 'interrupted');
    assert.equal(journal.get(id)?.reconciliationRequired, true);
    journal.interrupted(id);
    const file = path.join(root, 'stack-operations-v1', 'jobs', id + '.json');
    const corrupted = '{"version":2,"id":"broken"}';
    writeFileSync(file, corrupted);
    assert.throws(() => create(root).list(), /requires reconciliation/);
    assert.equal(readFileSync(file, 'utf8'), corrupted);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects unexpected outcome order without unlocking the Stack', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stack-operation-jobs-'));
  try {
    const journal = create(root);
    const definition = stack();
    const id = journal.begin(definition, 'start', stackRevision(definition), ['db', 'api']);
    assert.throws(() => journal.finish(id, {
      stackId: definition.id,
      state: 'completed',
      steps: [
        { nodeId: 'api', state: 'started' },
        { nodeId: 'db', state: 'started' },
      ],
      check,
    }), /requires reconciliation/);
    assert.throws(() => journal.begin(definition, 'stop', stackRevision(definition), ['api', 'db']), /requires reconciliation/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
