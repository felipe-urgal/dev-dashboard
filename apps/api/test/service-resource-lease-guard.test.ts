import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ServiceResourceOperationLock } from '../src/services/service-resource-operation-lock.js';
import type { ServiceResourceLeaseGuard } from '../src/services/service-resource-operation-lock.js';

const REF = 'compose-project:loto';
function marker(root: string, key = REF) {
  return path.join(root, 'service-resource-leases-v1',
    createHash('sha256').update(key).digest('hex'), 'owner.json');
}

test('durable guard verifies the original owner and rejects calls after release', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'service-guard-'));
  try {
    const locks = new ServiceResourceOperationLock({ stateDirectory: root });
    let oldGuard!: ServiceResourceLeaseGuard;
    const result = await locks.withResources([REF], async (guard) => {
      oldGuard = guard;
      await guard.assertOwned();
      await guard.assertOwned();
      return 'done';
    });
    assert.equal(result, 'done');
    await assert.rejects(oldGuard.assertOwned(), /no longer owned/);
    assert.deepEqual(readdirSync(path.join(root, 'service-resource-leases-v1')), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('stolen marker during preflight prevents a second provider dispatch', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'service-guard-'));
  try {
    const locks = new ServiceResourceOperationLock({ stateDirectory: root });
    let commands = 0;
    const lease = marker(root);
    const started = locks.withResources([REF], async (guard) => {
      await guard.assertOwned();
      const owner = JSON.parse(readFileSync(lease, 'utf8'));
      writeFileSync(lease, JSON.stringify({
        ...owner, holder: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
      }));
      await guard.assertOwned();
      commands += 1;
    });
    await assert.rejects(started, /lease could not be released|ownership cannot be verified/);
    assert.equal(commands, 0);
    assert.equal(JSON.parse(readFileSync(lease, 'utf8')).holder,
      'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
    // Even a process whose old holder was replaced must not delete the new
    // marker. The resulting lock is left for manual recovery.
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('partial acquisition never calls provider callback or exposes a usable guard', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'service-guard-'));
  try {
    const first = new ServiceResourceOperationLock({ stateDirectory: root });
    const second = new ServiceResourceOperationLock({ stateDirectory: root });
    let release!: () => void;
    let signal!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    const entered = new Promise<void>((r) => { signal = r; });
    const active = first.withResources(['resource:z'], async () => {
      signal();
      await held;
    });
    await entered;
    let invoked = false;
    await assert.rejects(
      second.withResources(['resource:a', 'resource:z'], async () => {
        invoked = true;
      }),
      /already using one of these resources/,
    );
    assert.equal(invoked, false);
    release();
    await active;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('in-memory guard keeps the old API compatible, but never proves cross-process ownership', async () => {
  const lock = new ServiceResourceOperationLock();
  await lock.withResources(['resource:test'], async (guard) => {
    await guard.assertOwned();
  });
  assert.equal(await lock.withResources(['resource:test'], async () => 'ok'), 'ok');
});
