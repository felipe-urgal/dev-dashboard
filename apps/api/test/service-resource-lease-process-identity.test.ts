import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ServiceResourceLeaseInspector } from '../src/services/service-resource-lease-inspector.js';
import { ServiceResourceOperationLock } from '../src/services/service-resource-operation-lock.js';
import { isLinuxProcessIdentity } from '../src/services/linux-process-identity.js';

const KEY = 'compose-project:loto';
const BOOT = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const SECOND_BOOT = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const IDENTITY = { bootId: BOOT, startTicks: '43210' };
function rootAndFile(root: string) {
  const folder = path.join(
    root,
    'service-resource-leases-v1',
    createHash('sha256').update(KEY).digest('hex'),
  );
  mkdirSync(folder, { recursive: true });
  return path.join(folder, 'owner.json');
}
function marker(identity: unknown = IDENTITY) {
  return {
    version: 1,
    key: KEY,
    holder: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    pid: 4321,
    acquiredAt: '2026-10-20T12:00:00.000Z',
    processIdentity: identity,
  };
}

test('matching PID+starttime+boot is an identity observation only, not clearance', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lease-incarnation-'));
  try {
    writeFileSync(rootAndFile(root), JSON.stringify(marker()));
    const observed = new ServiceResourceLeaseInspector(root, {
      processExists: () => 'alive',
      processIdentity: () => IDENTITY,
    }).inspect([KEY]);
    assert.equal(observed[0]?.status, 'present');
    assert.equal(observed[0]?.processIdentity, 'verified-same');
    assert.match(
      observed[0]?.diagnostic ?? '',
      /active mutation remains unproven/,
    );
    const differentTick = new ServiceResourceLeaseInspector(root, {
      processExists: () => 'alive',
      processIdentity: () => ({ ...IDENTITY, startTicks: '43211' }),
    }).inspect([KEY]);
    assert.equal(differentTick[0]?.processIdentity, 'different');
    const differentBoot = new ServiceResourceLeaseInspector(root, {
      processExists: () => 'alive',
      processIdentity: () => ({ ...IDENTITY, bootId: SECOND_BOOT }),
    }).inspect([KEY]);
    assert.equal(differentBoot[0]?.processIdentity, 'different');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('legacy owner and unavailable procfs remain unverifiable even with a live PID', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lease-incarnation-'));
  try {
    const file = rootAndFile(root);
    const old = marker();
    delete (old as { processIdentity?: unknown }).processIdentity;
    writeFileSync(file, JSON.stringify(old));
    const option = {
      processExists: () => 'alive' as const,
      processIdentity: () => IDENTITY,
    };
    assert.equal(
      new ServiceResourceLeaseInspector(root, option).inspect([KEY])[0]
        ?.processIdentity,
      'unverifiable',
    );
    writeFileSync(file, JSON.stringify(marker()));
    assert.equal(
      new ServiceResourceLeaseInspector(root, {
        ...option,
        processIdentity: () => null,
      }).inspect([KEY])[0]?.processIdentity,
      'unverifiable',
    );
    assert.equal(
      new ServiceResourceLeaseInspector(root, {
        ...option,
        processExists: () => 'not-observed',
      }).inspect([KEY])[0]?.processIdentity,
      'unverifiable',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('new resource lease records identity only when reliable and releases as before', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lease-incarnation-'));
  try {
    const lock = new ServiceResourceOperationLock({ stateDirectory: root });
    await lock.withResources([KEY], async () => {
      const owner = JSON.parse(readFileSync(rootAndFile(root), 'utf8')) as {
        processIdentity?: unknown;
        pid: number;
      };
      assert.equal(owner.pid, process.pid);
      assert.ok(
        owner.processIdentity === null ||
          isLinuxProcessIdentity(owner.processIdentity),
      );
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
