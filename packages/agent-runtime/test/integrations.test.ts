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
  assert.deepEqual(codexMcp?.operations, [
    'list',
    'inspect',
    'install',
    'uninstall',
    'authenticate',
  ]);
  assert.deepEqual(codexMcp?.scopes, ['user']);
  assert.match(codexMcp?.reason ?? '', /without inventing origin/i);
  assert.match(codexMcp?.reason ?? '', /interactive project terminal/i);
  assert.equal(
    codex.integrations.find((item) => item.kind === 'plugin')?.availability,
    'unavailable',
  );

  const claude = registry.get('claude-code');
  assert.ok(claude);
  const claudeMcp = claude.integrations.find(
    (item) => item.kind === 'mcp-server',
  );
  assert.equal(claudeMcp?.availability, 'supported');
  assert.deepEqual(claudeMcp?.operations, [
    'list',
    'install',
    'uninstall',
    'authenticate',
  ]);
  assert.deepEqual(claudeMcp?.scopes, ['local', 'project', 'user']);
  assert.match(claudeMcp?.reason ?? '', /scope precedence/i);
  assert.match(claudeMcp?.reason ?? '', /interactive terminal/i);

  const claudePlugin = claude.integrations.find(
    (item) => item.kind === 'plugin',
  );
  assert.equal(claudePlugin?.availability, 'supported');
  assert.deepEqual(claudePlugin?.operations, [
    'list',
    'install',
    'enable',
    'disable',
    'uninstall',
  ]);
  assert.deepEqual(claudePlugin?.scopes, [
    'user',
    'project',
    'local',
    'managed',
  ]);
  assert.match(claudePlugin?.reason ?? '', /structured JSON/i);
  assert.match(claudePlugin?.reason ?? '', /fails closed/i);
  const claudeMarketplace = claude.integrations.find(
    (item) => item.kind === 'marketplace',
  );
  assert.equal(claudeMarketplace?.availability, 'supported');
  assert.deepEqual(claudeMarketplace?.operations, ['list']);
  assert.deepEqual(claudeMarketplace?.scopes, ['user', 'project']);
  assert.match(claudeMarketplace?.reason ?? '', /sanitized source type/i);
  assert.ok(
    claude.integrations
      .filter((item) => item.kind === 'skill')
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
