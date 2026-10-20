import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type {
  ConfirmedLifecycleRequest,
  ConfirmedLifecycleResult,
  ConfirmedLifecycleStep,
} from '@dev-dashboard/contracts';

import { ConfirmedLifecycleJobJournal } from '../src/services/confirmed-lifecycle-job-journal.js';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const REF = 'compose:loto:db';
const REQUEST: ConfirmedLifecycleRequest = {
  projectId: 'loto',
  environmentInstanceId: 'environment:primary:loto',
  action: 'start',
  expectedRevision: 'a'.repeat(64),
  expectedPlanHash: 'b'.repeat(64),
  acceptedObservedAt: NOW.toISOString(),
};
const step: ConfirmedLifecycleStep = {
  serviceRef: REF,
  action: 'start',
  state: 'completed',
  dispositionBefore: 'willStart',
  diagnostic: 'password=should-never-be-persisted',
};
const result: ConfirmedLifecycleResult = {
  projectId: REQUEST.projectId,
  environmentInstanceId: REQUEST.environmentInstanceId,
  action: 'start',
  status: 'completed',
  steps: [step],
};
const create = (root: string) =>
  new ConfirmedLifecycleJobJournal(root, { now: () => NOW });

test('persists intent before mutation, step outcomes and a completed result', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lifecycle-jobs-'));
  try {
    const journal = create(root);
    const id = journal.begin(REQUEST, [REF]);
    const initial = journal.get(id)!;
    assert.equal(initial.status, 'running');
    assert.equal(initial.stage, 'prepared');
    assert.equal(initial.steps.length, 0);
    assert.equal(initial.reconciliationRequired, false);

    journal.beforeStep(id, REF);
    assert.equal(journal.get(id)?.inFlightRef, REF);
    journal.step(id, step);
    assert.equal(journal.get(id)?.inFlightRef, undefined);
    assert.equal(journal.get(id)?.steps[0]?.state, 'completed');
    journal.finish(id, result);

    const reopened = create(root);
    const completed = reopened.get(id)!;
    assert.equal(completed.status, 'completed');
    assert.equal(completed.stage, 'finished');
    assert.equal(completed.reconciliationRequired, false);
    assert.deepEqual(reopened.activityJobs('loto'), []);
    const raw = readFileSync(path.join(root, 'confirmed-lifecycle-jobs-v1', id + '.json'), 'utf8');
    assert.doesNotMatch(raw, /password=should-never-be-persisted/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('restart with in-flight mutation never replays it and surfaces reconciliation', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lifecycle-jobs-'));
  try {
    const writer = create(root);
    const id = writer.begin(REQUEST, [REF]);
    writer.beforeStep(id, REF);
    const restarted = create(root);
    assert.equal(restarted.get(id)?.status, 'running');
    assert.equal(restarted.get(id)?.reconciliationRequired, true);
    assert.equal(restarted.get(id)?.inFlightRef, REF);
    const job = restarted.activityJobs('loto')[0]!;
    assert.equal(job.id, 'compose-confirmed:' + id);
    assert.equal(job.status, 'failed');
    assert.equal(job.stage, 'reconciliation-required');
    assert.equal(job.cancelSupported, false);
    assert.throws(() => restarted.begin(REQUEST, [REF]), /journal is unavailable/);
    assert.throws(() => restarted.step(id, step), /journal is unavailable/);
    assert.throws(() => restarted.finish(id, result), /journal is unavailable/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('partial failure is terminal for audit but indicates reconciliation needed', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lifecycle-jobs-'));
  try {
    const journal = create(root);
    const id = journal.begin(REQUEST, [REF]);
    journal.beforeStep(id, REF);
    const failedStep = { ...step, state: 'failed' as const };
    journal.step(id, failedStep);
    journal.finish(id, { ...result, status: 'partial', steps: [failedStep] });
    const persisted = create(root).get(id)!;
    assert.equal(persisted.status, 'partial');
    assert.equal(persisted.reconciliationRequired, true);
    assert.equal(persisted.steps[0]?.state, 'failed');
    assert.equal(journal.begin(REQUEST, [REF]) !== id, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('corrupted or future-version journal is fail-closed and left untouched', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lifecycle-jobs-'));
  try {
    const journal = create(root);
    const id = journal.begin(REQUEST, [REF]);
    const file = path.join(root, 'confirmed-lifecycle-jobs-v1', id + '.json');
    const corrupted = JSON.stringify({ version: 2, id, status: 'running' });
    writeFileSync(file, corrupted);
    const restarted = create(root);
    assert.throws(() => restarted.list(), /journal is unavailable/);
    assert.throws(() => restarted.begin(REQUEST, [REF]), /journal is unavailable/);
    assert.equal(readFileSync(file, 'utf8'), corrupted);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validates step order and refuses double-start when record remains running', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lifecycle-jobs-'));
  try {
    const journal = create(root);
    const id = journal.begin(REQUEST, [REF]);
    assert.throws(() => journal.step(id, step), /journal is unavailable/);
    assert.throws(() => journal.beforeStep(id, 'compose:loto:other'), /journal is unavailable/);
    journal.beforeStep(id, REF);
    assert.throws(() => journal.beforeStep(id, REF), /journal is unavailable/);
    assert.throws(() => journal.begin(REQUEST, [REF]), /journal is unavailable/);
    journal.step(id, step);
    assert.throws(() => journal.step(id, step), /journal is unavailable/);
    journal.finish(id, result);
    assert.throws(() => journal.finish(id, result), /journal is unavailable/);
    assert.deepEqual(readdirSync(path.join(root, 'confirmed-lifecycle-jobs-v1'))
      .filter((name) => name.endsWith('.tmp')), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('jobs are scoped by project and identities cannot traverse state root', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lifecycle-jobs-'));
  try {
    const journal = create(root);
    const id = journal.begin(REQUEST, [REF]);
    assert.equal(journal.list('loto').length, 1);
    assert.equal(journal.list('other').length, 0);
    assert.equal(journal.get('../../etc/passwd'), null);
    assert.equal(journal.get(id)?.id, id);
    assert.equal(journal.activityJobs('other').length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
