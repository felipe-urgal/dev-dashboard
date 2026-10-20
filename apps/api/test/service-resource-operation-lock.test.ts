import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ServiceResourceOperationLock } from '../src/services/service-resource-operation-lock.js';

test('locks shared physical resources atomically and releases them after success', async () => {
  const locks = new ServiceResourceOperationLock();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const first = locks.withResources(
    ['compose-project:loto', 'resource:compose:loto:app'],
    async () => {
      started();
      await held;
      return 'completed';
    },
  );
  await entered;
  await assert.rejects(
    locks.withResources(
      ['resource:compose:loto:database', 'compose-project:loto'],
      async () => 'should not execute',
    ),
    /already using one of these resources/,
  );
  // Independent resources are allowed while the first operation is active.
  assert.equal(
    await locks.withResources(['compose-project:other'], async () => 'other'),
    'other',
  );
  release();
  assert.equal(await first, 'completed');
  assert.equal(
    await locks.withResources(['compose-project:loto'], async () => 'retry'),
    'retry',
  );
});

test('releases all locks after thrown errors and rejects invalid keys', async () => {
  const locks = new ServiceResourceOperationLock();
  await assert.rejects(
    locks.withResources(['resource:db', 'resource:db'], async () => {
      throw new Error('step failed');
    }),
    /step failed/,
  );
  assert.equal(
    await locks.withResources(['resource:db'], async () => 'ok'),
    'ok',
  );
  await assert.rejects(
    locks.withResources([], async () => 'unreachable'),
    /Invalid resource lock set/,
  );
  await assert.rejects(
    locks.withResources([''], async () => 'unreachable'),
    /Invalid resource lock set/,
  );
});

test('two independent instances in the same state directory serialize shared resources', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'resource-leases-'));
  try {
    const firstLock = new ServiceResourceOperationLock({
      stateDirectory: directory,
    });
    const secondLock = new ServiceResourceOperationLock({
      stateDirectory: directory,
    });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const active = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const first = firstLock.withResources(
      ['resource:compose:loto:api'],
      async () => {
        entered();
        await held;
      },
    );
    await active;

    const root = path.join(directory, 'service-resource-leases-v1');
    const owned = readdirSync(root);
    assert.equal(owned.length, 1);
    const owner = JSON.parse(
      readFileSync(path.join(root, owned[0]!, 'owner.json'), 'utf8'),
    );
    assert.equal(owner.key, 'resource:compose:loto:api');
    assert.equal(owner.pid, process.pid);

    await assert.rejects(
      secondLock.withResources(['resource:compose:loto:api'], async () => {
        throw new Error('must not mutate concurrently');
      }),
      /already using one of these resources/,
    );
    assert.equal(
      await secondLock.withResources(
        ['resource:compose:other:api'],
        async () => 'independent',
      ),
      'independent',
    );
    release();
    await first;
    assert.deepEqual(readdirSync(root), []);
    assert.equal(
      await secondLock.withResources(
        ['resource:compose:loto:api'],
        async () => 'reacquired',
      ),
      'reacquired',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a collision after acquiring one key releases the partial lease set', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'resource-leases-'));
  try {
    const first = new ServiceResourceOperationLock({
      stateDirectory: directory,
    });
    const second = new ServiceResourceOperationLock({
      stateDirectory: directory,
    });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const active = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const lock = first.withResources(['resource:z'], async () => {
      entered();
      await held;
    });
    await active;

    // A second operation obtains resource:a, then hits resource:z and must
    // release a before returning a conflict (no partial-lock deadlock).
    await assert.rejects(
      second.withResources(['resource:a', 'resource:z'], async () => {
        throw new Error('must not execute');
      }),
      /already using one of these resources/,
    );

    const root = path.join(directory, 'service-resource-leases-v1');
    const activeZ = createHash('sha256').update('resource:z').digest('hex');
    assert.deepEqual(readdirSync(root), [activeZ]);
    release();
    await lock;
    assert.deepEqual(readdirSync(root), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('an orphaned lease is fail-closed, never stolen based on PID or age', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'resource-leases-'));
  try {
    const root = path.join(directory, 'service-resource-leases-v1');
    const lease = path.join(
      root,
      createHash('sha256').update('compose-project:loto').digest('hex'),
    );
    mkdirSync(lease, { recursive: true });
    const locks = new ServiceResourceOperationLock({
      stateDirectory: directory,
    });
    await assert.rejects(
      locks.withResources(['compose-project:loto'], async () => 'never run'),
      /already using one of these resources/,
    );
    assert.equal(existsSync(lease), true);
    // A different resource is still available.
    assert.equal(
      await locks.withResources(['compose-project:other'], async () => 'ok'),
      'ok',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('after a failing operation, durable leases are released and safely retried', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'resource-leases-'));
  try {
    const locks = new ServiceResourceOperationLock({
      stateDirectory: directory,
    });
    await assert.rejects(
      locks.withResources(['resource:db'], async () => {
        throw new Error('provider failed');
      }),
      /provider failed/,
    );
    const root = path.join(directory, 'service-resource-leases-v1');
    assert.deepEqual(readdirSync(root), []);
    assert.equal(
      await new ServiceResourceOperationLock({
        stateDirectory: directory,
      }).withResources(['resource:db'], async () => 'safe'),
      'safe',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('lease-root symlink and permission failures never allow mutation', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'resource-leases-'));
  try {
    const stateDirectory = path.join(directory, 'missing-root');
    const root = path.join(stateDirectory, 'service-resource-leases-v1');
    // A path occupied by a file cannot be used as a lease directory.
    mkdirSync(stateDirectory);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(root, 'not a directory');
    const locks = new ServiceResourceOperationLock({ stateDirectory });
    let mutated = false;
    await assert.rejects(
      locks.withResources(['resource:db'], async () => {
        mutated = true;
      }),
    );
    assert.equal(mutated, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
