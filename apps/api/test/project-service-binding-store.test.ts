import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ProjectServiceBindingStore,
  ProjectServiceBindingStoreError,
} from '../src/store/project-service-binding-store.js';

const NOW = new Date('2026-10-19T15:00:00.000Z');
const draft = {
  environmentInstanceId: 'environment:primary:loto',
  serviceRef: 'systemd:system:postgresql.service',
  relation: 'required' as const,
  enabled: true,
  requiredForStart: true,
  dependencies: [
    { serviceRef: 'systemd:system:redis.service', source: 'manual' as const },
  ],
};

test('persists bindings, reloads safely and checks revisions per project', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'project-bindings-'));
  try {
    const store = new ProjectServiceBindingStore({ stateDirectory: directory });
    const revision = store.revision('loto');
    const record = store.save('loto', draft, revision, NOW);
    assert.equal(record.projectId, 'loto');
    assert.equal(store.byResource(draft.serviceRef).length, 1);
    assert.notEqual(store.revision('loto'), revision);
    assert.equal(store.revision('other'), revision);

    const restarted = new ProjectServiceBindingStore({
      stateDirectory: directory,
    });
    assert.deepEqual(restarted.find(record.id), record);
    const current = restarted.revision('loto');
    const unchanged = restarted.save('loto', draft, current, NOW);
    assert.equal(unchanged.id, record.id);
    assert.equal(restarted.revision('loto'), current);

    const renamed = restarted.save(
      'loto',
      { ...draft, enabled: false },
      current,
      NOW,
      record.id,
    );
    assert.equal(renamed.enabled, false);
    assert.throws(
      () => restarted.delete('loto', record.id, current),
      (e) =>
        e instanceof ProjectServiceBindingStoreError && e.code === 'CONFLICT',
    );
    const before = restarted.revision('loto');
    restarted.delete('loto', record.id, before);
    assert.deepEqual(restarted.byProject('loto'), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects duplicate project/environment resource and cross-project delete', () => {
  const store = new ProjectServiceBindingStore();
  const first = store.save('loto', draft, store.revision('loto'), NOW);
  assert.throws(
    () =>
      store.save(
        'loto',
        { ...draft, relation: 'observed' },
        store.revision('loto'),
        NOW,
      ),
    (e) =>
      e instanceof ProjectServiceBindingStoreError && e.code === 'CONFLICT',
  );
  assert.throws(
    () => store.delete('other', first.id, store.revision('other')),
    (e) =>
      e instanceof ProjectServiceBindingStoreError && e.code === 'CONFLICT',
  );
  assert.equal(store.byProject('loto').length, 1);
});

test('fails closed on invalid/future persisted version, preserving bytes', () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'project-bindings-bad-'),
  );
  try {
    const file = path.join(directory, 'project-service-bindings.json');
    writeFileSync(file, JSON.stringify({ version: 2, bindings: [] }));
    const store = new ProjectServiceBindingStore({ stateDirectory: directory });
    assert.throws(
      () => store.save('loto', draft, store.revision('loto'), NOW),
      (e) =>
        e instanceof ProjectServiceBindingStoreError &&
        e.code === 'UNAVAILABLE',
    );
    assert.equal(store.list().length, 0);
    assert.equal(
      requireRaw(file),
      JSON.stringify({ version: 2, bindings: [] }),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function requireRaw(file: string): string {
  // Keep this helper small and synchronous like the store implementation.
  return readFileSync(file, 'utf8');
}
