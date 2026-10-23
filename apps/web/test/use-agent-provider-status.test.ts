import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ref } from 'vue';
import { test } from 'vitest';

import {
  type AgentProviderId,
  type AgentProviderStatus,
  type fetchAgentProviders,
} from '../src/api/agent-runtime';
import { useAgentProviderStatus } from '../src/composables/useAgentProviderStatus';

function provider(
  providerId: AgentProviderId,
  availability: AgentProviderStatus['availability'] = 'available',
): AgentProviderStatus {
  return { providerId, availability, observedAt: '2026-10-23T10:00:00.000Z' };
}

function harness() {
  const project = { id: 'project-a' };
  const selected = ref<AgentProviderId>('automatic');
  const errors: string[] = [];
  let clears = 0;
  const pending: Array<{
    resolve: (value: AgentProviderStatus[]) => void;
    reject: (reason: Error) => void;
  }> = [];
  const loader: typeof fetchAgentProviders = () =>
    new Promise((resolve, reject) => pending.push({ resolve, reject }));
  const state = useAgentProviderStatus(
    () => project.id,
    selected,
    (message) => errors.push(message),
    () => { clears += 1; },
    loader,
  );
  return { project, selected, errors, pending, state, clears: () => clears };
}

test('provider doctor conserva fallback e seleção apenas observacional', () => {
  const h = harness();
  assert.equal(h.state.providerOptions.value.length, 4);
  assert.equal(h.state.currentProvider.value?.availability, 'unavailable');
  assert.equal(h.state.currentProvider.value?.diagnostic?.code, 'automatic-unavailable');
  h.state.applyLoadedProviders([provider('codex')], 'project-a');
  assert.equal(h.state.availableProviderCount.value, 1);
  assert.equal(h.state.currentProvider.value?.availability, 'unavailable');
  h.selected.value = 'codex';
  assert.equal(h.state.currentProvider.value?.availability, 'available');
  h.state.applyLoadedProviders([provider('claude-code')], 'project-b');
  assert.equal(h.state.currentProvider.value?.providerId, 'codex');
});

test('refresh revalida sem duplicar requests e mantém providers até resposta', async () => {
  const h = harness();
  h.state.applyLoadedProviders([provider('automatic', 'degraded')], 'project-a');
  const request = h.state.refreshProviders();
  await h.state.refreshProviders();
  assert.equal(h.pending.length, 1);
  assert.equal(h.clears(), 1);
  assert.equal(h.state.providerRefreshing.value, true);
  assert.equal(h.state.currentProvider.value?.availability, 'degraded');
  h.pending[0]!.resolve([provider('automatic')]);
  await request;
  assert.equal(h.state.currentProvider.value?.availability, 'available');
  assert.equal(h.state.providerRefreshing.value, false);
});

test('troca A → B → A invalida refresh antigo e libera novo refresh', async () => {
  const h = harness();
  const stale = h.state.refreshProviders();
  h.project.id = 'project-b';
  h.state.resetProviders();
  h.state.applyLoadedProviders([provider('codex')], 'project-b');
  h.project.id = 'project-a';
  h.state.resetProviders();
  h.state.applyLoadedProviders([provider('claude-code')], 'project-a');

  const latest = h.state.refreshProviders();
  assert.equal(h.pending.length, 2);
  h.pending[0]!.resolve([provider('automatic')]);
  await stale;
  assert.equal(h.state.availableProviderCount.value, 1);
  assert.equal(h.state.providerOptions.value.find((p) => p.providerId === 'automatic')?.availability, 'unavailable');
  assert.equal(h.state.providerRefreshing.value, true);

  h.pending[1]!.resolve([provider('codex')]);
  await latest;
  assert.equal(h.state.providerOptions.value.find((p) => p.providerId === 'codex')?.availability, 'available');
  assert.equal(h.state.providerRefreshing.value, false);
});

test('load novo invalida refresh pendente mesmo no mesmo projeto', async () => {
  const h = harness();
  const stale = h.state.refreshProviders();
  h.state.applyLoadedProviders([provider('claude-code')], 'project-a');
  h.pending[0]!.resolve([provider('automatic')]);
  await stale;
  assert.equal(h.state.providerOptions.value.find((p) => p.providerId === 'claude-code')?.availability, 'available');
  assert.equal(h.state.providerRefreshing.value, false);
});

test('erro corrente é mostrado e erro após reset/unmount é descartado', async () => {
  const h = harness();
  const first = h.state.refreshProviders();
  h.pending[0]!.reject(new Error('provider offline'));
  await first;
  assert.deepEqual(h.errors, ['provider offline']);
  assert.equal(h.state.providerRefreshing.value, false);

  const stale = h.state.refreshProviders();
  h.state.resetProviders();
  h.pending[1]!.reject(new Error('old secret diagnostic'));
  await stale;
  assert.deepEqual(h.errors, ['provider offline']);
  assert.equal(h.state.providerRefreshing.value, false);
});

test('cockpit usa um owner de provider status e invalida ao trocar projeto', () => {
  const panel = readFileSync(
    resolve(import.meta.dirname, '../src/components/ProjectAgentPanel.vue'),
    'utf8',
  );
  assert.match(panel, /useAgentProviderStatus\(/);
  assert.match(panel, /applyLoadedProviders\(nextProviders, props\.project\.id\)/);
  assert.match(panel, /resetProviders\(\)/);
  assert.doesNotMatch(panel, /providers\.value\s*=/);
  assert.doesNotMatch(panel, /providerRefreshing\.value\s*=/);
});
