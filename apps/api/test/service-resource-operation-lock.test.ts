import assert from 'node:assert/strict';
import test from 'node:test';

import { ServiceResourceOperationLock } from '../src/services/service-resource-operation-lock.js';

test('locks shared physical resources atomically and releases them after success', async () => {
  const locks = new ServiceResourceOperationLock();
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let started!: () => void;
  const entered = new Promise<void>((resolve) => { started = resolve; });
  const first = locks.withResources(['compose-project:loto', 'resource:compose:loto:app'], async () => {
    started();
    await held;
    return 'completed';
  });
  await entered;
  await assert.rejects(
    locks.withResources(['resource:compose:loto:database', 'compose-project:loto'],
      async () => 'should not execute'),
    /already using one of these resources/,
  );
  // Independent resources are allowed while the first operation is active.
  assert.equal(await locks.withResources(['compose-project:other'], async () => 'other'), 'other');
  release();
  assert.equal(await first, 'completed');
  assert.equal(await locks.withResources(['compose-project:loto'], async () => 'retry'), 'retry');
});

test('releases all locks after thrown errors and rejects invalid keys', async () => {
  const locks = new ServiceResourceOperationLock();
  await assert.rejects(
    locks.withResources(['resource:db', 'resource:db'], async () => {
      throw new Error('step failed');
    }), /step failed/,
  );
  assert.equal(await locks.withResources(['resource:db'], async () => 'ok'), 'ok');
  await assert.rejects(
    locks.withResources([], async () => 'unreachable'), /Invalid resource lock set/,
  );
  await assert.rejects(
    locks.withResources([''], async () => 'unreachable'), /Invalid resource lock set/,
  );
});
