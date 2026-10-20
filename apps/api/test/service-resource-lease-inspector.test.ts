import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ServiceResourceLeaseInspector } from '../src/services/service-resource-lease-inspector.js';

const KEY = 'compose-project:loto';
function lease(root: string, key = KEY) {
  const folder = path.join(
    root,
    'service-resource-leases-v1',
    createHash('sha256').update(key).digest('hex'),
  );
  mkdirSync(folder, { recursive: true });
  return folder;
}
function owner(key = KEY, pid = 12345) {
  return JSON.stringify({
    version: 1,
    key,
    holder: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    pid,
    acquiredAt: '2026-10-20T12:00:00.000Z',
  });
}

test('reports present owner without claiming its process owns the active mutation', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lease-evidence-'));
  try {
    const dir = lease(root);
    writeFileSync(path.join(dir, 'owner.json'), owner());
    const alive = new ServiceResourceLeaseInspector(root, {
      processExists: () => 'alive',
    }).inspect([KEY, KEY]);
    assert.equal(alive.length, 1);
    assert.equal(alive[0]?.status, 'present');
    assert.equal(alive[0]?.ownerProcess, 'alive');

    const missing = new ServiceResourceLeaseInspector(root, {
      processExists: () => 'not-observed',
    }).inspect([KEY]);
    assert.equal(missing[0]?.status, 'present');
    assert.equal(missing[0]?.ownerProcess, 'not-observed');
    assert.match(missing[0]?.diagnostic ?? '', /verification/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('missing local lease is only local absence evidence', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lease-evidence-'));
  try {
    let result = new ServiceResourceLeaseInspector(root).inspect([KEY]);
    assert.equal(result[0]?.status, 'absent');
    assert.equal(result[0]?.ownerProcess, 'unknown');
    mkdirSync(path.join(root, 'service-resource-leases-v1'));
    result = new ServiceResourceLeaseInspector(root).inspect([KEY]);
    assert.equal(result[0]?.status, 'absent');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('corrupt owner metadata or untrusted symlinks are inconclusive', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lease-evidence-'));
  try {
    const dir = lease(root);
    const file = path.join(dir, 'owner.json');
    writeFileSync(file, JSON.stringify({ version: 1, key: 'other', pid: 1 }));
    let result = new ServiceResourceLeaseInspector(root).inspect([KEY]);
    assert.equal(result[0]?.status, 'unverifiable');
    rmSync(file);
    symlinkSync('/etc/passwd', file);
    result = new ServiceResourceLeaseInspector(root).inspect([KEY]);
    assert.equal(result[0]?.status, 'unverifiable');
    assert.equal(result[0]?.ownerProcess, 'unknown');
    assert.doesNotMatch(JSON.stringify(result), /\/etc\/passwd/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('lease with inaccessible root never yields implicit clearance', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lease-evidence-'));
  try {
    symlinkSync('/tmp', path.join(root, 'service-resource-leases-v1'));
    const result = new ServiceResourceLeaseInspector(root).inspect([KEY]);
    assert.equal(result[0]?.status, 'unverifiable');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
