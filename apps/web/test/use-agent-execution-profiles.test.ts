import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ref } from 'vue';
import { test } from 'vitest';

import {
  type AgentExecutionProfileConfiguration,
  type AgentProviderId,
  type AgentCapability,
  type setAgentExecutionProfiles,
} from '../src/api/agent-runtime';
import { useAgentExecutionProfiles } from '../src/composables/useAgentExecutionProfiles';

function configuration(
  projectId: string,
  profiles: AgentExecutionProfileConfiguration['profiles'] = [],
  defaultProfileId?: string,
): AgentExecutionProfileConfiguration {
  return {
    projectId,
    profiles,
    ...(defaultProfileId ? { defaultProfileId } : {}),
    updatedAt: '2026-10-23T10:00:00.000Z',
  };
}

function pendingSaver() {
  const requests: Array<{
    projectId: string;
    input: Parameters<typeof setAgentExecutionProfiles>[1];
    resolve: (configuration: AgentExecutionProfileConfiguration) => void;
    reject: (error: Error) => void;
  }> = [];
  const save: typeof setAgentExecutionProfiles = (projectId, input) =>
    new Promise((resolve, reject) => {
      requests.push({ projectId, input, resolve, reject });
    });
  return { save, requests };
}

function harness() {
  const current = { projectId: 'project-a' };
  const provider = ref<AgentProviderId>('automatic');
  const capabilities = ref<AgentCapability[]>(['workspace:write']);
  const messages: string[] = [];
  const { save, requests } = pendingSaver();
  const state = useAgentExecutionProfiles(
    () => current.projectId,
    provider,
    capabilities,
    (id) => id,
    (message) => messages.push(message),
    { save },
  );
  return { current, provider, capabilities, messages, requests, state };
}

test('perfil default seleciona provider e capabilities com cópia independente', () => {
  const h = harness();
  const profile = {
    id: 'secure',
    label: 'Seguro',
    providerId: 'codex' as const,
    requestedCapabilities: ['git:commit' as const],
  };
  h.state.setLoadedExecutionProfiles(configuration('project-a', [profile], 'secure'), 'project-a');
  assert.equal(h.state.selectedProfileId.value, 'secure');
  assert.equal(h.provider.value, 'codex');
  assert.deepEqual(h.capabilities.value, ['git:commit']);
  assert.equal(h.state.effectiveProfileSummary.value.includes('Seguro'), true);
  h.capabilities.value.push('workspace:write');
  assert.deepEqual(profile.requestedCapabilities, ['git:commit']);
});

test('save usa snapshot dos drafts, sem dupla mutation e sem alterar grants', async () => {
  const h = harness();
  h.state.profileIdDraft.value = 'NORMAL';
  h.state.profileLabelDraft.value = 'Normal';
  h.state.profileTimeoutSeconds.value = '60';
  h.state.profileMaxTokens.value = '1000';
  h.state.profileBudgetMode.value = 'hard';
  const pending = h.state.saveCurrentExecutionProfile();
  assert.equal(h.state.profileSaving.value, true);
  await h.state.saveCurrentExecutionProfile();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0]!.projectId, 'project-a');
  assert.equal(h.requests[0]!.input.profiles[0]?.id, 'normal');
  assert.equal(h.requests[0]!.input.profiles[0]?.timeoutMs, 60000);
  assert.deepEqual(h.requests[0]!.input.profiles[0]?.budget, {
    maxTotalTokens: 1000,
    mode: 'hard',
  });
  assert.deepEqual(h.requests[0]!.input.profiles[0]?.fallbackOrder, ['codex', 'claude-code']);
  h.provider.value = 'codex';
  h.requests[0]!.resolve(configuration('project-a', h.requests[0]!.input.profiles, 'normal'));
  await pending;
  assert.equal(h.state.selectedProfileId.value, 'normal');
  assert.equal(h.state.profileSaving.value, false);
  assert.equal(h.provider.value, 'automatic');
  assert.deepEqual(h.capabilities.value, ['workspace:write']);
});

test('projeto A → B → A descarta resposta e erro antigos do save', async () => {
  const h = harness();
  h.state.profileIdDraft.value = 'a';
  h.state.profileLabelDraft.value = 'A';
  const stale = h.state.saveCurrentExecutionProfile();
  h.current.projectId = 'project-b';
  h.state.resetExecutionProfiles();
  h.state.setLoadedExecutionProfiles(configuration('project-b'), 'project-b');
  h.current.projectId = 'project-a';
  h.state.resetExecutionProfiles();
  h.state.setLoadedExecutionProfiles(configuration('project-a'), 'project-a');

  h.requests[0]!.resolve(configuration('project-a', h.requests[0]!.input.profiles, 'a'));
  await stale;
  assert.equal(h.state.selectedProfileId.value, '');
  assert.deepEqual(h.state.executionProfiles.value?.profiles, []);
  assert.equal(h.state.profileSaving.value, false);

  h.state.profileIdDraft.value = 'b';
  h.state.profileLabelDraft.value = 'B';
  const failing = h.state.saveCurrentExecutionProfile();
  h.current.projectId = 'project-b';
  h.state.resetExecutionProfiles();
  h.requests[1]!.reject(new Error('stale failure'));
  await assert.doesNotReject(failing);
  assert.deepEqual(h.messages, []);
  assert.equal(h.state.executionProfiles.value, null);
});

test('remove conserva outros perfis, rejeita request duplicado e reporta falha atual', async () => {
  const h = harness();
  const a = {
    id: 'a',
    label: 'A',
    providerId: 'codex' as const,
    requestedCapabilities: ['workspace:write' as const],
  };
  const b = {
    id: 'b',
    label: 'B',
    providerId: 'automatic' as const,
    requestedCapabilities: [],
  };
  h.state.setLoadedExecutionProfiles(configuration('project-a', [a, b], 'a'), 'project-a');
  const pending = h.state.removeSelectedExecutionProfile();
  await h.state.removeSelectedExecutionProfile();
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.requests[0]!.input.profiles.map((profile) => profile.id), ['b']);
  assert.equal(h.requests[0]!.input.defaultProfileId, 'b');
  h.requests[0]!.reject(new Error('API profile failure'));
  await assert.rejects(pending, /API profile failure/);
  assert.equal(h.state.profileSaving.value, false);
  assert.equal(h.state.selectedProfileId.value, 'a');
});

test('config de outro projeto e id inválido não alteram perfil atual', async () => {
  const h = harness();
  h.state.setLoadedExecutionProfiles(configuration('project-b'), 'project-b');
  assert.equal(h.state.executionProfiles.value, null);
  h.state.profileIdDraft.value = '../invalid';
  h.state.profileLabelDraft.value = 'Invalid';
  await h.state.saveCurrentExecutionProfile();
  assert.equal(h.requests.length, 0);
  assert.match(h.messages[0] ?? '', /id simples/);
});

test('cockpit delega estado de perfis para um owner e reseta na troca de projeto', () => {
  const panel = readFileSync(
    resolve(import.meta.dirname, '../src/components/ProjectAgentPanel.vue'),
    'utf8',
  );
  assert.match(panel, /useAgentExecutionProfiles\(/);
  assert.match(panel, /resetExecutionProfiles\(\)/);
  assert.match(panel, /setLoadedExecutionProfiles\(nextExecutionProfiles/);
  assert.doesNotMatch(panel, /setAgentExecutionProfiles\(/);
  assert.doesNotMatch(panel, /executionProfiles\.value\s*=/);
});
