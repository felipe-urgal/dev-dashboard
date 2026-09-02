import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { SelfUpdateHandoffStore } from './self-update-handoff.mjs';

const HANDOFF_ID = 'self-update-11111111-1111-4111-8111-111111111111';
const REVISION = 'a'.repeat(40);
const PLAN_HASH = 'b'.repeat(64);

test('handoff aceita id determinístico sem permitir sobrescrita', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'self-update-handoff-id-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new SelfUpdateHandoffStore(directory);

  const created = await store.prepare({
    handoffId: HANDOFF_ID,
    projectId: 'dev-dashboard',
    targetRevision: REVISION,
    planHash: PLAN_HASH,
  });
  assert.equal(created.id, HANDOFF_ID);

  await assert.rejects(
    () =>
      store.prepare({
        handoffId: HANDOFF_ID,
        projectId: 'dev-dashboard',
        targetRevision: REVISION,
        planHash: PLAN_HASH,
      }),
    /já existe um handoff/i,
  );
});
