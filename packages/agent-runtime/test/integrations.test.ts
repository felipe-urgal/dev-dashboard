import assert from 'node:assert/strict';
import test from 'node:test';

import {
  StaticAgentIntegrationCapabilityRegistry,
  createDefaultAgentIntegrationCapabilityRegistry,
} from '../src/index.js';

test('default integration capabilities keep providers explicit and conservative', () => {
  const registry = createDefaultAgentIntegrationCapabilityRegistry();

  assert.deepEqual(
    registry.list().map((provider) => provider.providerId),
    ['codex', 'claude-code', 'chatgpt-browser'],
  );

  const codex = registry.get('codex');
  assert.ok(codex);
  const codexMcp = codex.integrations.find(
    (item) => item.kind === 'mcp-server',
  );
  assert.equal(codexMcp?.availability, 'supported');
  assert.deepEqual(codexMcp?.operations, ['list', 'inspect', 'install']);
  assert.deepEqual(codexMcp?.scopes, ['user']);
  assert.equal(
    codex.integrations.find((item) => item.kind === 'plugin')?.availability,
    'unavailable',
  );

  const claude = registry.get('claude-code');
  assert.ok(claude);
  const claudePlugin = claude.integrations.find(
    (item) => item.kind === 'plugin',
  );
  assert.equal(claudePlugin?.availability, 'supported');
  assert.deepEqual(claudePlugin?.operations, ['list', 'enable', 'disable']);
  assert.deepEqual(claudePlugin?.scopes, [
    'user',
    'project',
    'local',
    'managed',
  ]);
  assert.match(claudePlugin?.reason ?? '', /managed plugins are listed read-only/i);
  assert.ok(
    claude.integrations
      .filter((item) => item.kind !== 'plugin')
      .every(
        (item) =>
          item.availability === 'unavailable' && item.operations.length === 0,
      ),
  );

  const browser = registry.get('chatgpt-browser');
  assert.ok(browser);
  assert.deepEqual(
    browser.integrations.find((item) => item.kind === 'browser-capability')
      ?.operations,
    ['list'],
  );
  assert.deepEqual(
    browser.integrations.find((item) => item.kind === 'plugin')?.operations,
    [],
  );
});

test('integration capability registry rejects duplicate providers', () => {
  assert.throws(
    () =>
      new StaticAgentIntegrationCapabilityRegistry([
        {
          providerId: 'codex',
          integrations: [],
        },
        {
          providerId: 'codex',
          integrations: [],
        },
      ]),
    /duplicate integration capability provider/,
  );
});

test('integration capability registry isolates returned arrays from mutation', () => {
  const registry = createDefaultAgentIntegrationCapabilityRegistry();
  const first = registry.list();
  first.pop();

  assert.equal(registry.list().length, 3);
  assert.equal(registry.get('claude-code')?.providerId, 'claude-code');
});
