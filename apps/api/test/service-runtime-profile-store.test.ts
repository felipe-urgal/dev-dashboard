import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ServiceRuntimeProfileStore,
  ServiceRuntimeProfileStoreError,
} from '../src/store/service-runtime-profile-store.js';

const NOW = new Date('2026-10-20T18:00:00.000Z');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const env = 'environment:primary:gastos';

test('separate runtime profiles persist, rehydrate and enforce project-scoped revisions', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'runtime-profile-'));
  try {
    const store = new ServiceRuntimeProfileStore({ stateDirectory: directory });
    const initial = store.revision('gastos');
    const dev = store.save('gastos', { environmentInstanceId: env, kind: 'dev', bindingIds: [B, A] }, initial, NOW);
    assert.deepEqual(dev.bindingIds, [A, B]);
    assert.notEqual(store.revision('gastos'), initial);
    assert.equal(store.revision('other'), initial);
    const testProfile = store.save(
      'gastos', { environmentInstanceId: env, kind: 'test', bindingIds: [A] },
      store.revision('gastos'), NOW,
    );
    const restarted = new ServiceRuntimeProfileStore({ stateDirectory: directory });
    assert.deepEqual(restarted.find(dev.id), dev);
    assert.equal(restarted.byProject('gastos').length, 2);
    assert.deepEqual(restarted.byBinding(A).map((item) => item.kind).sort(), ['dev', 'test']);
    const before = restarted.revision('gastos');
    assert.deepEqual(restarted.save('gastos', {
      environmentInstanceId: env, kind: 'dev', bindingIds: [B, A],
    }, before, NOW, dev.id), dev);
    assert.equal(restarted.revision('gastos'), before);
    assert.throws(
      () => restarted.delete('gastos', dev.id, initial),
      (error) => error instanceof ServiceRuntimeProfileStoreError && error.code === 'CONFLICT',
    );
    assert.throws(
      () => restarted.delete('other', dev.id, restarted.revision('other')),
      (error) => error instanceof ServiceRuntimeProfileStoreError && error.code === 'CONFLICT',
    );
    restarted.delete('gastos', testProfile.id, before);
    assert.equal(restarted.byProject('gastos').length, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('profile identity is unique per project/environment/kind', () => {
  const store = new ServiceRuntimeProfileStore();
  store.save('gastos', { environmentInstanceId: env, kind: 'test', bindingIds: [] }, store.revision('gastos'), NOW);
  assert.throws(
    () => store.save('gastos', { environmentInstanceId: env, kind: 'test', bindingIds: [] }, store.revision('gastos'), NOW),
    (error) => error instanceof ServiceRuntimeProfileStoreError && error.code === 'CONFLICT',
  );
  const differentEnv = store.save('gastos', { environmentInstanceId: 'environment:worktree:gastos:one', kind: 'test', bindingIds: [] }, store.revision('gastos'), NOW);
  assert.equal(differentEnv.kind, 'test');
});

test('corrupt and future-version persisted profiles fail closed and preserve bytes', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'runtime-profile-corrupt-'));
  try {
    const file = path.join(directory, 'service-runtime-profiles.json');
    const original = JSON.stringify({ version: 2, profiles: [] });
    writeFileSync(file, original);
    const store = new ServiceRuntimeProfileStore({ stateDirectory: directory });
    assert.throws(
      () => store.save('gastos', { environmentInstanceId: env, kind: 'test', bindingIds: [] }, store.revision('gastos'), NOW),
      (error) => error instanceof ServiceRuntimeProfileStoreError && error.code === 'UNAVAILABLE',
    );
    assert.equal(readFileSync(file, 'utf8'), original);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
