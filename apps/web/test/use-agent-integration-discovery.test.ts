import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

import {
  type AgentConcreteProviderId,
  type AgentIntegrationListResult,
  type AgentIntegrationProviderCapabilities,
} from '../src/api/agent-runtime';
import { useAgentIntegrationDiscovery } from '../src/composables/useAgentIntegrationDiscovery';

function capabilities(
  providerId: AgentConcreteProviderId,
): AgentIntegrationProviderCapabilities[] {
  return [{ providerId, integrations: [] }];
}

function list(
  id: string,
  providerId: AgentConcreteProviderId,
): AgentIntegrationListResult {
  return {
    integrations: [{ id, providerId, kind: 'mcp-server', name: id }],
    issues: [{ code: 'source-unavailable', message: 'sanitized-' + id }],
  };
}

function integrationIds(
  state: ReturnType<typeof useAgentIntegrationDiscovery>,
): string[] {
  return state.integrations.value.map((item) => item.id);
}

function harness() {
  const target = {
    projectId: 'project-a',
    providerId: 'codex' as AgentConcreteProviderId,
    environmentInstanceId: 'env-a',
  };
  const capabilityRequests: Array<{
    resolve: (value: AgentIntegrationProviderCapabilities[]) => void;
    reject: (reason: Error) => void;
  }> = [];
  const listRequests: Array<{
    projectId: string;
    providerId: AgentConcreteProviderId;
    environmentInstanceId: string | undefined;
    resolve: (value: AgentIntegrationListResult) => void;
    reject: (reason: Error) => void;
  }> = [];
  const state = useAgentIntegrationDiscovery(() => target, {
    capabilities: () =>
      new Promise((resolve, reject) =>
        capabilityRequests.push({ resolve, reject }),
      ),
    integrations: (projectId, providerId, environmentInstanceId) =>
      new Promise((resolve, reject) =>
        listRequests.push({
          projectId,
          providerId,
          environmentInstanceId,
          resolve,
          reject,
        }),
      ),
  });
  return { state, target, capabilityRequests, listRequests };
}

test('loads capabilities and scoped integrations without exposing discovery issues as grants', async () => {
  const h = harness();
  const pending = h.state.load();
  assert.equal(h.state.loading.value, true);
  assert.equal(h.capabilityRequests.length, 1);
  h.capabilityRequests[0]!.resolve(capabilities('codex'));
  await Promise.resolve();
  assert.deepEqual(
    [
      h.listRequests[0]?.projectId,
      h.listRequests[0]?.providerId,
      h.listRequests[0]?.environmentInstanceId,
    ],
    ['project-a', 'codex', 'env-a'],
  );
  h.listRequests[0]!.resolve(list('a', 'codex'));
  await pending;
  assert.deepEqual(integrationIds(h.state), ['a']);
  assert.deepEqual(h.state.integrationIssues.value, ['sanitized-a']);
  assert.equal(h.state.errorMessage.value, '');
  assert.equal(h.state.loading.value, false);
});

test('project/provider A → B → A never applies an earlier capability response', async () => {
  const h = harness();
  const stale = h.state.load();
  h.target.providerId = 'claude-code';
  h.state.resetDiscovery();
  const middle = h.state.load();
  h.target.providerId = 'codex';
  h.state.resetDiscovery();
  const current = h.state.load();

  h.capabilityRequests[0]!.resolve(capabilities('codex'));
  h.capabilityRequests[1]!.reject(new Error('stale secret error'));
  await Promise.all([stale, middle]);
  assert.equal(h.listRequests.length, 0);
  assert.equal(h.state.loading.value, true);
  assert.equal(h.state.errorMessage.value, '');

  h.capabilityRequests[2]!.resolve(capabilities('codex'));
  await Promise.resolve();
  h.listRequests[0]!.resolve(list('current', 'codex'));
  await current;
  assert.deepEqual(integrationIds(h.state), ['current']);
  assert.equal(h.state.loading.value, false);
});

test('an earlier integration response or error cannot overwrite newer provider list', async () => {
  const h = harness();
  const stale = h.state.load();
  h.capabilityRequests[0]!.resolve(capabilities('codex'));
  await Promise.resolve();
  assert.equal(h.listRequests.length, 1);

  h.target.projectId = 'project-b';
  h.target.environmentInstanceId = 'env-b';
  h.target.providerId = 'chatgpt-browser';
  h.state.resetDiscovery();
  const current = h.state.load();
  h.capabilityRequests[1]!.resolve(capabilities('chatgpt-browser'));
  await Promise.resolve();
  h.listRequests[1]!.resolve(list('new', 'chatgpt-browser'));
  await current;

  h.listRequests[0]!.reject(new Error('stale list failure'));
  await stale;
  assert.deepEqual(integrationIds(h.state), ['new']);
  assert.deepEqual(h.state.integrationIssues.value, ['sanitized-new']);
  assert.equal(h.state.errorMessage.value, '');
});

test('same-target overlapping refreshes apply only latest response', async () => {
  const h = harness();
  const old = h.state.load();
  const current = h.state.load();
  h.capabilityRequests[1]!.resolve(capabilities('codex'));
  await Promise.resolve();
  h.listRequests[0]!.resolve(list('latest', 'codex'));
  await current;
  h.capabilityRequests[0]!.resolve(capabilities('claude-code'));
  await old;
  assert.deepEqual(
    h.state.capabilities.value.map((item) => item.providerId),
    ['codex'],
  );
  assert.deepEqual(integrationIds(h.state), ['latest']);
  assert.equal(h.state.loading.value, false);
});

test('current discovery failure is retryable and stale errors after reset are suppressed', async () => {
  const h = harness();
  const fail = h.state.load();
  h.capabilityRequests[0]!.resolve(capabilities('codex'));
  await Promise.resolve();
  h.listRequests[0]!.reject(new Error('provider offline'));
  await fail;
  assert.equal(h.state.errorMessage.value, 'provider offline');
  assert.deepEqual(h.state.integrations.value, []);
  const retry = h.state.load();
  h.capabilityRequests[1]!.resolve(capabilities('codex'));
  await Promise.resolve();
  h.listRequests[1]!.resolve(list('recovered', 'codex'));
  await retry;
  assert.equal(h.state.errorMessage.value, '');
  assert.deepEqual(integrationIds(h.state), ['recovered']);
  h.state.resetDiscovery();
  assert.deepEqual(h.state.integrations.value, []);
  assert.equal(h.state.loading.value, false);
});

test('scope identity includes environment and invalidates unmounted inspection/read', async () => {
  const h = harness();
  const captured = h.state.captureScope();
  assert.equal(h.state.isCurrentScope(captured), true);
  h.target.environmentInstanceId = 'env-b';
  assert.equal(h.state.isCurrentScope(captured), false);
  h.target.environmentInstanceId = 'env-a';
  h.state.resetDiscovery();
  assert.equal(h.state.isCurrentScope(captured), false);
});

test('integration card invalidates scope synchronously on navigation and unmount', () => {
  const component = readFileSync(
    resolve(
      import.meta.dirname,
      '../src/components/ProjectAgentIntegrationsCard.vue',
    ),
    'utf8',
  );
  assert.match(component, /useAgentIntegrationDiscovery\(/);
  assert.match(component, /resetDiscovery\(\)/);
  assert.match(component, /flush: 'sync'/);
  assert.match(component, /onBeforeUnmount\\(\\(\\) => \\{\\s*resetDiscovery\\(\\)/);
  assert.match(component, /resetMutations\\(\\)/);
  assert.match(component, /isCurrentScope\(scope\)/);
  assert.doesNotMatch(component, /async function load\(\): Promise<void>/);
});
