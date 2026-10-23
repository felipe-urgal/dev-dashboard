import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

import type { AgentConcreteProviderId } from '../src/api/agent-runtime';
import { useAgentIntegrationMutations } from '../src/composables/useAgentIntegrationMutations';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function harness() {
  const target = {
    projectId: 'project-a',
    providerId: 'codex' as AgentConcreteProviderId,
    environmentInstanceId: 'environment-a',
  };
  const refreshRequests: Array<{ project: string; provider: string }> = [];
  const errors: string[] = [];
  const applied: string[] = [];
  const state = useAgentIntegrationMutations(
    () => target,
    async () => {
      refreshRequests.push({
        project: target.projectId,
        provider: target.providerId,
      });
    },
    (error) => errors.push(error),
  );
  return { target, refreshRequests, errors, applied, state };
}

test('captures exact project/provider/environment through a write and reconciles once', async () => {
  const h = harness();
  const request = deferred<string>();
  let submissions = 0;
  let submittedScope = '';
  const pending = h.state.mutate({
    kind: 'install-mcp',
    providerId: 'codex',
    fallback: 'Não foi possível instalar.',
    submit: async (scope) => {
      submissions += 1;
      submittedScope = [scope.projectId, scope.providerId, scope.environmentInstanceId].join('/');
      return request.promise;
    },
    apply: (value) => { h.applied.push(value); },
  });
  assert.equal(h.state.installing.value, true);
  assert.equal(h.state.mutationBusy.value, true);
  await h.state.mutate({
    kind: 'toggle',
    providerId: 'codex',
    fallback: 'Não foi possível alternar.',
    submit: async () => 'unexpected',
  });
  assert.equal(submissions, 1);
  request.resolve('installed');
  await pending;
  assert.equal(submittedScope, 'project-a/codex/environment-a');
  assert.deepEqual(h.applied, ['installed']);
  assert.deepEqual(h.refreshRequests, [{ project: 'project-a', provider: 'codex' }]);
  assert.equal(h.state.mutationBusy.value, false);
  assert.equal(h.state.installing.value, false);
});

test('confirmation resumed after a provider switch never dispatches a privileged write', async () => {
  const h = harness();
  const confirmation = deferred<boolean>();
  let submissions = 0;
  const pending = h.state.mutate({
    kind: 'uninstall',
    providerId: 'codex',
    integrationId: 'mcp-1',
    confirm: () => confirmation.promise,
    fallback: 'Falha ao remover.',
    submit: async () => { submissions += 1; return 'deleted'; },
  });
  assert.equal(h.state.uninstallingIntegrationId.value, 'mcp-1');
  h.target.providerId = 'claude-code';
  h.state.resetMutations();
  assert.equal(h.state.uninstallingIntegrationId.value, null);
  confirmation.resolve(true);
  await pending;
  assert.equal(submissions, 0);
  assert.deepEqual(h.refreshRequests, []);
  assert.equal(h.state.mutationBusy.value, false);
});

test('A → B → A ignores late success, and keeps the serialized lock until HTTP settles', async () => {
  const h = harness();
  const response = deferred<string>();
  const pending = h.state.mutate({
    kind: 'install-plugin',
    providerId: 'codex',
    integrationId: 'plugin-1',
    fallback: 'Falha ao instalar.',
    submit: () => response.promise,
    apply: (result) => { h.applied.push(result); },
  });
  h.target.projectId = 'project-b';
  h.state.resetMutations();
  h.target.projectId = 'project-a';
  h.state.resetMutations();
  assert.equal(h.state.installingIntegrationId.value, null);
  let duplicate = false;
  await h.state.mutate({
    kind: 'install-plugin',
    providerId: 'codex',
    fallback: 'duplicate',
    submit: async () => { duplicate = true; return 'dup'; },
  });
  assert.equal(duplicate, false);
  response.resolve('old');
  await pending;
  assert.deepEqual(h.applied, []);
  assert.deepEqual(h.refreshRequests, []);
  assert.deepEqual(h.errors, []);
  assert.equal(h.state.mutationBusy.value, false);
});

test('stale error cannot overwrite a new project's error and never reloads it', async () => {
  const h = harness();
  const response = deferred<void>();
  const pending = h.state.mutate({
    kind: 'toggle',
    providerId: 'codex',
    integrationId: 'plugin-x',
    fallback: 'Falha.',
    submit: () => response.promise,
  });
  h.target.projectId = 'project-b';
  h.state.resetMutations();
  response.reject(new Error('private error from old project'));
  await pending;
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.refreshRequests, []);
});

test('ambiguous HTTP failure re-reads canonical inventory without replaying the mutation', async () => {
  const h = harness();
  let writes = 0;
  await h.state.mutate({
    kind: 'uninstall',
    providerId: 'codex',
    integrationId: 'mcp-x',
    fallback: 'Falha.',
    submit: async () => {
      writes += 1;
      throw new Error('Lost response');
    },
  });
  assert.equal(writes, 1);
  assert.deepEqual(h.refreshRequests, [{ project: 'project-a', provider: 'codex' }]);
  assert.deepEqual(h.errors, ['Lost response']);
  assert.equal(h.state.mutationBusy.value, false);
});

test('failed canonical refresh preserves original mutation error and never retries', async () => {
  const target = { projectId: 'p', providerId: 'codex' as AgentConcreteProviderId };
  const errors: string[] = [];
  let refreshes = 0;
  let submissions = 0;
  const state = useAgentIntegrationMutations(
    () => target,
    async () => {
      refreshes += 1;
      throw new Error('Discovery failed');
    },
    (error) => errors.push(error),
  );
  await state.mutate({
    kind: 'install-mcp',
    providerId: 'codex',
    fallback: 'Falha.',
    submit: async () => {
      submissions += 1;
      throw new Error('Permission denied');
    },
  });
  assert.equal(submissions, 1);
  assert.equal(refreshes, 1);
  assert.deepEqual(errors, ['Permission denied']);
});

test('mismatched provider and rejected confirmation are fail-closed', async () => {
  const h = harness();
  let dispatched = false;
  await h.state.mutate({
    kind: 'authenticate',
    providerId: 'claude-code',
    refresh: false,
    fallback: 'Falha.',
    submit: async () => { dispatched = true; },
  });
  assert.equal(h.state.mutationBusy.value, false);
  await h.state.mutate({
    kind: 'uninstall',
    providerId: 'codex',
    confirm: async () => false,
    fallback: 'Falha.',
    submit: async () => { dispatched = true; },
  });
  assert.equal(dispatched, false);
  assert.deepEqual(h.refreshRequests, []);
});

test('authentication result applies only while current and does not refresh discovery', async () => {
  const h = harness();
  const response = deferred<string>();
  const pending = h.state.mutate({
    kind: 'authenticate',
    providerId: 'codex',
    integrationId: 'auth-1',
    fallback: 'Falha.',
    refresh: false,
    submit: () => response.promise,
    apply: (result) => { h.applied.push(result); },
  });
  assert.equal(h.state.authenticatingIntegrationId.value, 'auth-1');
  response.resolve('terminal handoff');
  await pending;
  assert.deepEqual(h.applied, ['terminal handoff']);
  assert.deepEqual(h.refreshRequests, []);
  assert.equal(h.state.authenticatingIntegrationId.value, null);
});

test('component routes all privileged integration actions through scoped mutations', () => {
  const panel = readFileSync(
    resolve(import.meta.dirname, '../src/components/ProjectAgentIntegrationsCard.vue'),
    'utf8',
  );
  assert.match(panel, /useAgentIntegrationMutations\(/);
  assert.match(panel, /resetMutations\(\)/);
  assert.match(panel, /onBeforeUnmount\(\(\) =>/);
  assert.match(panel, /async function installClaudePlugin\(/);
  assert.match(panel, /async function prepareAuthentication\(/);
  assert.match(panel, /async function toggleIntegration\(/);
  assert.match(panel, /async function uninstallIntegration\(/);
  assert.match(panel, /async function installMcp\(/);
  assert.equal((panel.match(/await mutate\(\{/g) ?? []).length, 5);
  assert.match(panel, /:disabled="mutationBusy"/);
  assert.doesNotMatch(panel, /await installAgentIntegration\(props\.project\.id/);
  assert.doesNotMatch(panel, /await uninstallAgentIntegration\(props\.project\.id/);
});
