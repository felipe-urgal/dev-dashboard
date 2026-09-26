import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  AgentExecutionProfileStore,
  AgentExecutionProfileStoreError,
} from '../src/index.js';

test('AgentExecutionProfileStore persiste perfis por projeto e default', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-profiles-'));
  context.after(() => rm(root, { recursive: true, force: true }));

  const store = new AgentExecutionProfileStore({ stateDirectory: root });
  const saved = await store.set({
    projectId: 'project-1',
    defaultProfileId: 'normal',
    profiles: [
      {
        id: 'normal',
        label: 'Normal',
        providerId: 'automatic',
        fallbackOrder: ['codex', 'claude-code'],
        timeoutMs: 120_000,
        budget: {
          maxTotalTokens: 100_000,
          mode: 'soft',
        },
        requestedCapabilities: ['workspace:write', 'git:commit'],
      },
    ],
    updatedAt: '2026-09-26T20:00:00.000Z',
  });

  assert.equal(saved.defaultProfileId, 'normal');
  const restarted = new AgentExecutionProfileStore({ stateDirectory: root });
  assert.deepEqual(await restarted.get('project-1'), saved);
});

test('AgentExecutionProfileStore rejeita default ausente e fallback em provider concreto', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-profiles-invalid-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new AgentExecutionProfileStore({ stateDirectory: root });

  await assert.rejects(
    store.set({
      projectId: 'project-1',
      defaultProfileId: 'missing',
      profiles: [],
      updatedAt: '2026-09-26T20:00:00.000Z',
    }),
    AgentExecutionProfileStoreError,
  );

  await assert.rejects(
    store.set({
      projectId: 'project-1',
      profiles: [
        {
          id: 'careful',
          label: 'Careful',
          providerId: 'codex',
          fallbackOrder: ['claude-code'],
          requestedCapabilities: ['workspace:write'],
        },
      ],
      updatedAt: '2026-09-26T20:00:00.000Z',
    }),
    AgentExecutionProfileStoreError,
  );
});
