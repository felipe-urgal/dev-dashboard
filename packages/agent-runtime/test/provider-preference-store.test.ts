import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  AgentProviderPreferenceStore,
  AgentProviderPreferenceStoreError,
} from '../src/index.js';

test('provider preference persists by project and can be cleared', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-provider-pref-'));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const store = new AgentProviderPreferenceStore({ stateDirectory: root });
  const saved = await store.set({
    projectId: 'project-1',
    preferredProviderId: 'claude-code',
    fallbackOrder: ['codex'],
    updatedAt: '2026-09-24T13:40:00.000Z',
  });

  assert.deepEqual(await store.get('project-1'), saved);

  const restarted = new AgentProviderPreferenceStore({ stateDirectory: root });
  assert.deepEqual(await restarted.get('project-1'), saved);

  await restarted.clear('project-1');
  assert.equal(await restarted.get('project-1'), null);
});

test('provider preference rejects invalid providers and corrupt state', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-provider-pref-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const store = new AgentProviderPreferenceStore({ stateDirectory: root });

  await assert.rejects(
    () =>
      store.set({
        projectId: 'project-1',
        preferredProviderId: 'chatgpt-browser' as never,
        fallbackOrder: ['codex'],
        updatedAt: '2026-09-24T13:40:00.000Z',
      }),
    (error: unknown) =>
      error instanceof AgentProviderPreferenceStoreError &&
      error.code === 'AGENT_PROVIDER_PREFERENCE_INVALID',
  );

  await writeFile(
    path.join(root, 'provider-preferences.json'),
    JSON.stringify({ version: 1, preferences: [{ projectId: 'project-1' }] }),
    'utf8',
  );

  await assert.rejects(
    () => store.get('project-1'),
    (error: unknown) =>
      error instanceof AgentProviderPreferenceStoreError &&
      error.code === 'AGENT_PROVIDER_PREFERENCE_CORRUPT',
  );
});
