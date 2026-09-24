import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentIntegrationDiscoveryError,
  BrowserCapabilityIntegrationProvider,
  ClaudePluginIntegrationProvider,
  CodexMcpIntegrationProvider,
  StaticAgentIntegrationProviderRegistry,
  type AgentCliProcessRequest,
  type AgentCliProcessResult,
  type AgentCliProcessRunner,
} from '../src/index.js';

function result(
  overrides: Partial<AgentCliProcessResult> = {},
): AgentCliProcessResult {
  return {
    exitCode: 0,
    signal: null,
    stdout: '[]',
    stderr: '',
    startedAt: '2026-09-23T20:00:00.000Z',
    finishedAt: '2026-09-23T20:00:00.000Z',
    ...overrides,
  };
}

test('Codex MCP discovery returns only safe metadata', async () => {
  const calls: AgentCliProcessRequest[] = [];
  const runner: AgentCliProcessRunner = async (request) => {
    calls.push(request);
    return result({
      stdout: JSON.stringify([
        {
          name: 'github',
          enabled: true,
          auth_status: 'authenticated',
          transport: {
            type: 'stdio',
            command: 'npx',
            args: ['secret-arg'],
            env: { TOKEN: 'SECRET_SHOULD_NOT_LEAK' },
          },
        },
      ]),
    });
  };

  const provider = new CodexMcpIntegrationProvider({
    command: 'codex-test',
    runProcess: runner,
  });
  const discovery = await provider.list({ cwd: '/workspace/project' });

  assert.deepEqual(calls[0]?.args, ['mcp', 'list', '--json']);
  assert.equal(calls[0]?.cwd, '/workspace/project');
  assert.deepEqual(discovery.integrations, [
    {
      id: 'codex:mcp-server:github',
      providerId: 'codex',
      kind: 'mcp-server',
      name: 'github',
      enabled: true,
      authStatus: 'authenticated',
    },
  ]);
  assert.deepEqual(discovery.issues, []);
  assert.equal(
    JSON.stringify(discovery).includes('SECRET_SHOULD_NOT_LEAK'),
    false,
  );
  assert.equal(JSON.stringify(discovery).includes('secret-arg'), false);
});

test('Codex MCP discovery fails closed on malformed output', async () => {
  const provider = new CodexMcpIntegrationProvider({
    runProcess: async () => result({ stdout: '{invalid' }),
  });

  await assert.rejects(
    () => provider.list({ cwd: '/workspace/project' }),
    (error: unknown) =>
      error instanceof AgentIntegrationDiscoveryError &&
      error.code === 'invalid-response',
  );
});

test('integration provider registry rejects duplicate providers', () => {
  const provider = new CodexMcpIntegrationProvider({
    runProcess: async () => result(),
  });

  assert.throws(
    () => new StaticAgentIntegrationProviderRegistry([provider, provider]),
    /duplicate integration provider/,
  );
});

test('Codex MCP install uses fixed structured args and requires confirmation', async () => {
  const calls: AgentCliProcessRequest[] = [];
  const provider = new CodexMcpIntegrationProvider({
    runProcess: async (request) => {
      calls.push(request);
      return result();
    },
  });

  await assert.rejects(
    () =>
      provider.install!({
        cwd: '/workspace/project',
        kind: 'mcp-server',
        name: 'docs',
        scope: 'user',
        confirmed: false,
        url: 'https://example.com/mcp',
      }),
    /explicit confirmation/,
  );

  const integration = await provider.install!({
    cwd: '/workspace/project',
    kind: 'mcp-server',
    name: 'docs',
    scope: 'user',
    confirmed: true,
    url: 'https://example.com/mcp',
  });

  assert.deepEqual(calls[0]?.args, [
    'mcp',
    'add',
    'docs',
    '--url',
    'https://example.com/mcp',
  ]);
  assert.deepEqual(integration, {
    id: 'codex:mcp-server:docs',
    providerId: 'codex',
    kind: 'mcp-server',
    name: 'docs',
    scope: 'user',
    origin: 'codex-global-config',
    enabled: true,
    authStatus: 'unknown',
  });
});

test('Codex MCP install rejects unsafe names, non-HTTPS URLs and project scope', async () => {
  const provider = new CodexMcpIntegrationProvider({
    runProcess: async () => result(),
  });

  await assert.rejects(
    () =>
      provider.install!({
        cwd: '/workspace/project',
        kind: 'mcp-server',
        name: 'bad name',
        scope: 'user',
        confirmed: true,
        url: 'https://example.com/mcp',
      }),
    /name is invalid/,
  );
  await assert.rejects(
    () =>
      provider.install!({
        cwd: '/workspace/project',
        kind: 'mcp-server',
        name: 'docs',
        scope: 'user',
        confirmed: true,
        url: 'http://example.com/mcp',
      }),
    /must use HTTPS/,
  );
  await assert.rejects(
    () =>
      provider.install!({
        cwd: '/workspace/project',
        kind: 'mcp-server',
        name: 'docs',
        scope: 'project',
        confirmed: true,
        url: 'https://example.com/mcp',
      }),
    /only explicit user scope/,
  );
});

test('Codex MCP removal targets only global user config and verifies effective disappearance', async () => {
  const calls: AgentCliProcessRequest[] = [];
  const provider = new CodexMcpIntegrationProvider({
    runProcess: async (request) => {
      calls.push(request);
      if (request.args[1] === 'remove') return result({ stdout: '' });
      return result({ stdout: '[]' });
    },
  });

  await assert.rejects(
    () =>
      provider.uninstall!({
        cwd: '/workspace/project',
        kind: 'mcp-server',
        name: 'docs',
        scope: 'user',
        confirmed: false,
      }),
    /explicit confirmation/,
  );

  const removed = await provider.uninstall!({
    cwd: '/workspace/project',
    kind: 'mcp-server',
    name: 'docs',
    scope: 'user',
    confirmed: true,
  });

  assert.deepEqual(
    calls.map((call) => call.args),
    [
      ['mcp', 'remove', 'docs'],
      ['mcp', 'list', '--json'],
    ],
  );
  assert.deepEqual(removed, {
    providerId: 'codex',
    kind: 'mcp-server',
    name: 'docs',
    scope: 'user',
    dataPreserved: true,
  });
});

test('Codex MCP removal fails closed when effective config still contains the server', async () => {
  const provider = new CodexMcpIntegrationProvider({
    runProcess: async (request) => {
      if (request.args[1] === 'remove') return result({ stdout: '' });
      return result({
        stdout: JSON.stringify([
          { name: 'docs', enabled: true, auth_status: 'unsupported' },
        ]),
      });
    },
  });

  await assert.rejects(
    () =>
      provider.uninstall!({
        cwd: '/workspace/project',
        kind: 'mcp-server',
        name: 'docs',
        scope: 'user',
        confirmed: true,
      }),
    (error: unknown) =>
      error instanceof AgentIntegrationDiscoveryError &&
      error.code === 'invalid-request' &&
      /effective project context/.test(error.message),
  );
});

test('Codex MCP removal rejects non-user scope and unsafe server names', async () => {
  const provider = new CodexMcpIntegrationProvider({
    runProcess: async () => result(),
  });

  await assert.rejects(
    () =>
      provider.uninstall!({
        cwd: '/workspace/project',
        kind: 'mcp-server',
        name: 'docs',
        scope: 'project',
        confirmed: true,
      }),
    /only explicit user scope/,
  );

  await assert.rejects(
    () =>
      provider.uninstall!({
        cwd: '/workspace/project',
        kind: 'mcp-server',
        name: 'bad name',
        scope: 'user',
        confirmed: true,
      }),
    /name is invalid/,
  );
});

test('Browser integration discovery mirrors the local tool allowlist', async () => {
  const provider = new BrowserCapabilityIntegrationProvider();
  const discovery = await provider.list({ cwd: '/workspace/project' });

  assert.deepEqual(
    discovery.integrations.map((integration) => integration.name),
    [
      'list_files',
      'read_file',
      'search_text',
      'git_status',
      'git_diff',
      'git_log',
      'git_branch',
      'apply_patch',
      'run_process',
    ],
  );
  assert.ok(
    discovery.integrations.every(
      (integration) =>
        integration.providerId === 'chatgpt-browser' &&
        integration.kind === 'browser-capability' &&
        integration.scope === 'session' &&
        integration.origin === 'browser-local-allowlist' &&
        integration.enabled === true &&
        integration.authStatus === 'unsupported',
    ),
  );
  assert.deepEqual(discovery.issues, []);
});

test('Codex MCP discovery isolates malformed entries without hiding degradation', async () => {
  const provider = new CodexMcpIntegrationProvider({
    runProcess: async () =>
      result({
        stdout: JSON.stringify([
          { name: 'docs', enabled: true, auth_status: 'authenticated' },
          { name: '' },
          null,
          { name: 'github', enabled: false, auth_status: 'unsupported' },
        ]),
      }),
  });

  const discovery = await provider.list({ cwd: '/workspace/project' });

  assert.deepEqual(
    discovery.integrations.map((integration) => integration.name),
    ['docs', 'github'],
  );
  assert.deepEqual(discovery.issues, [
    {
      code: 'invalid-entry',
      index: 1,
      message: 'Codex MCP discovery ignored an invalid server entry.',
    },
    {
      code: 'invalid-entry',
      index: 2,
      message: 'Codex MCP discovery ignored an invalid server entry.',
    },
  ]);
});

test('Codex MCP inspection returns only sanitized structured details', async () => {
  const calls: AgentCliProcessRequest[] = [];
  const provider = new CodexMcpIntegrationProvider({
    runProcess: async (request) => {
      calls.push(request);
      return result({
        stdout: JSON.stringify({
          name: 'docs',
          enabled: true,
          enabled_tools: ['search'],
          disabled_tools: ['write'],
          startup_timeout_sec: 5,
          tool_timeout_sec: 30,
          transport: {
            type: 'streamable_http',
            url: 'https://secret.example.com/mcp',
            bearer_token_env_var: 'SECRET_TOKEN',
            http_headers: { Authorization: 'Bearer secret' },
          },
        }),
      });
    },
  });

  const details = await provider.inspect!({
    cwd: '/workspace/project',
    kind: 'mcp-server',
    name: 'docs',
  });

  assert.deepEqual(calls[0]?.args, ['mcp', 'get', 'docs', '--json']);
  assert.deepEqual(details, {
    id: 'codex:mcp-server:docs',
    providerId: 'codex',
    kind: 'mcp-server',
    name: 'docs',
    enabled: true,
    transportType: 'streamable-http',
    enabledTools: ['search'],
    disabledTools: ['write'],
    startupTimeoutSec: 5,
    toolTimeoutSec: 30,
  });
  assert.equal(JSON.stringify(details).includes('secret.example.com'), false);
  assert.equal(JSON.stringify(details).includes('SECRET_TOKEN'), false);
  assert.equal(JSON.stringify(details).includes('Bearer secret'), false);
});

test('Codex MCP inspection fails closed on mismatched or malformed metadata', async () => {
  const provider = new CodexMcpIntegrationProvider({
    runProcess: async () =>
      result({
        stdout: JSON.stringify({
          name: 'other',
          enabled: true,
          transport: { type: 'stdio', command: 'secret-command' },
        }),
      }),
  });

  await assert.rejects(
    () =>
      provider.inspect!({
        cwd: '/workspace/project',
        kind: 'mcp-server',
        name: 'docs',
      }),
    (error: unknown) =>
      error instanceof AgentIntegrationDiscoveryError &&
      error.code === 'invalid-response',
  );
});

test('Claude plugin discovery returns sanitized installed plugin metadata', async () => {
  const calls: AgentCliProcessRequest[] = [];
  const provider = new ClaudePluginIntegrationProvider({
    command: 'claude-test',
    runProcess: async (request) => {
      calls.push(request);
      if (request.args[1] === 'marketplace') {
        return result({ stdout: '[]' });
      }
      if (request.args.includes('--available')) {
        return result({
          stdout: JSON.stringify({ installed: [], available: [] }),
        });
      }
      return result({
        stdout: JSON.stringify([
          {
            id: 'code-review@company-tools',
            version: '1.2.3',
            scope: 'project',
            enabled: true,
            installPath: '/secret/plugin/path',
            errors: ['token=SECRET_SHOULD_NOT_LEAK'],
            errorDetails: [{ type: 'load', file: '/secret/file' }],
          },
          {
            id: 'synced-skill',
            version: '2.0.0',
            scope: 'managed',
            enabled: false,
            notes: ['SECRET_NOTE'],
          },
        ]),
      });
    },
  });

  const discovery = await provider.list({ cwd: '/workspace/project' });

  assert.deepEqual(calls[0]?.args, ['plugin', 'list', '--json']);
  assert.deepEqual(calls[1]?.args, ['plugin', 'marketplace', 'list', '--json']);
  assert.deepEqual(calls[2]?.args, ['plugin', 'list', '--json', '--available']);
  assert.equal(calls[0]?.cwd, '/workspace/project');
  assert.equal(calls[1]?.cwd, '/workspace/project');
  assert.equal(calls[2]?.cwd, '/workspace/project');
  assert.deepEqual(discovery.integrations, [
    {
      id: 'claude-code:plugin:code-review@company-tools',
      providerId: 'claude-code',
      kind: 'plugin',
      name: 'code-review',
      scope: 'project',
      origin: 'claude-plugin-inventory',
      version: '1.2.3',
      marketplace: 'company-tools',
      enabled: true,
      authStatus: 'unsupported',
    },
    {
      id: 'claude-code:plugin:synced-skill',
      providerId: 'claude-code',
      kind: 'plugin',
      name: 'synced-skill',
      scope: 'managed',
      origin: 'claude-plugin-inventory',
      version: '2.0.0',
      enabled: false,
      authStatus: 'unsupported',
    },
  ]);
  assert.deepEqual(discovery.issues, []);
  assert.equal(
    JSON.stringify(discovery).includes('SECRET_SHOULD_NOT_LEAK'),
    false,
  );
  assert.equal(
    JSON.stringify(discovery).includes('/secret/plugin/path'),
    false,
  );
  assert.equal(JSON.stringify(discovery).includes('SECRET_NOTE'), false);
});

test('Claude plugin discovery isolates invalid rows and fails closed on invalid JSON', async () => {
  const provider = new ClaudePluginIntegrationProvider({
    runProcess: async (request) => {
      if (request.args[1] === 'marketplace') {
        return result({ stdout: '[]' });
      }
      if (request.args.includes('--available')) {
        return result({
          stdout: JSON.stringify({ installed: [], available: [] }),
        });
      }
      return result({
        stdout: JSON.stringify([
          { id: 'valid@market', scope: 'user', enabled: true },
          { id: '', scope: 'user', enabled: true },
          { id: 'bad-scope', scope: 'session', enabled: true },
          null,
        ]),
      });
    },
  });

  const discovery = await provider.list({ cwd: '/workspace/project' });
  assert.deepEqual(
    discovery.integrations.map((integration) => integration.name),
    ['valid'],
  );
  assert.equal(discovery.issues.length, 3);

  const malformed = new ClaudePluginIntegrationProvider({
    runProcess: async () => result({ stdout: '{invalid' }),
  });
  await assert.rejects(
    () => malformed.list({ cwd: '/workspace/project' }),
    (error: unknown) =>
      error instanceof AgentIntegrationDiscoveryError &&
      error.code === 'invalid-response',
  );
});

test('Claude marketplace discovery exposes only safe source metadata', async () => {
  const provider = new ClaudePluginIntegrationProvider({
    runProcess: async (request) => {
      if (request.args.includes('--available')) {
        return result({
          stdout: JSON.stringify({ installed: [], available: [] }),
        });
      }
      if (request.args[1] !== 'marketplace') {
        return result({ stdout: '[]' });
      }
      return result({
        stdout: JSON.stringify([
          {
            name: 'company-tools',
            source: 'github',
            repo: 'private-org/private-marketplace',
            installLocation: '/secret/local/cache',
            url: 'https://user:SECRET@example.com/marketplace.git',
          },
          {
            name: 'claudeai-library',
            marketplaceId: 'marketplace-secret-id',
            organizationUuid: 'organization-secret-id',
          },
        ]),
      });
    },
  });

  const discovery = await provider.list({ cwd: '/workspace/project' });
  const marketplaces = discovery.integrations.filter(
    (integration) => integration.kind === 'marketplace',
  );

  assert.deepEqual(marketplaces, [
    {
      id: 'claude-code:marketplace:company-tools',
      providerId: 'claude-code',
      kind: 'marketplace',
      name: 'company-tools',
      origin: 'claude-marketplace-inventory',
      marketplaceSource: 'github',
      authStatus: 'unsupported',
    },
    {
      id: 'claude-code:marketplace:claudeai-library',
      providerId: 'claude-code',
      kind: 'marketplace',
      name: 'claudeai-library',
      origin: 'claude-marketplace-inventory',
      marketplaceSource: 'claude-ai',
      authStatus: 'unsupported',
    },
  ]);
  assert.equal(
    JSON.stringify(discovery).includes('/secret/local/cache'),
    false,
  );
  assert.equal(JSON.stringify(discovery).includes('SECRET'), false);
  assert.equal(
    JSON.stringify(discovery).includes('marketplace-secret-id'),
    false,
  );
  assert.equal(
    JSON.stringify(discovery).includes('organization-secret-id'),
    false,
  );
});

test('Claude marketplace discovery failure does not hide installed plugins', async () => {
  const provider = new ClaudePluginIntegrationProvider({
    runProcess: async (request) => {
      if (request.args[1] === 'marketplace') {
        return result({ exitCode: 1, stderr: 'SECRET_MARKETPLACE_ERROR' });
      }
      if (request.args.includes('--available')) {
        return result({
          stdout: JSON.stringify({ installed: [], available: [] }),
        });
      }
      return result({
        stdout: JSON.stringify([
          {
            id: 'review@company-tools',
            scope: 'user',
            enabled: true,
          },
        ]),
      });
    },
  });

  const discovery = await provider.list({ cwd: '/workspace/project' });

  assert.deepEqual(
    discovery.integrations.map((integration) => integration.name),
    ['review'],
  );
  assert.deepEqual(discovery.issues, [
    {
      code: 'source-unavailable',
      source: 'marketplace',
      message: 'Claude marketplace discovery returned a non-zero result.',
    },
  ]);
  assert.equal(
    JSON.stringify(discovery).includes('SECRET_MARKETPLACE_ERROR'),
    false,
  );
});

test('Claude plugin catalog returns sanitized available plugins and skips installed duplicates', async () => {
  const calls: AgentCliProcessRequest[] = [];
  const provider = new ClaudePluginIntegrationProvider({
    runProcess: async (request) => {
      calls.push(request);
      if (request.args[1] === 'marketplace') {
        return result({ stdout: '[]' });
      }
      if (request.args.includes('--available')) {
        return result({
          stdout: JSON.stringify({
            installed: [{ pluginId: 'review@company-tools' }],
            available: [
              {
                pluginId: 'review@company-tools',
                name: 'review',
                marketplaceName: 'company-tools',
                version: '1.2.3',
                description: 'SECRET_DESCRIPTION',
                source: {
                  source: 'github',
                  repo: 'private-org/private-marketplace',
                },
              },
              {
                pluginId: 'security@official',
                name: 'security',
                marketplaceName: 'official',
                version: '2.4.0',
                description: 'Should not cross the boundary',
                source: {
                  source: 'url',
                  url: 'https://token:SECRET@example.com/plugin',
                },
              },
            ],
          }),
        });
      }
      return result({
        stdout: JSON.stringify([
          {
            id: 'review@company-tools',
            version: '1.2.3',
            scope: 'user',
            enabled: true,
          },
        ]),
      });
    },
  });

  const discovery = await provider.list({ cwd: '/workspace/project' });
  const catalog = discovery.integrations.filter(
    (integration) => integration.origin === 'claude-plugin-catalog',
  );

  assert.deepEqual(calls[2]?.args, ['plugin', 'list', '--json', '--available']);
  assert.deepEqual(catalog, [
    {
      id: 'claude-code:plugin-catalog:security@official',
      providerId: 'claude-code',
      kind: 'plugin',
      name: 'security',
      origin: 'claude-plugin-catalog',
      marketplace: 'official',
      version: '2.4.0',
      authStatus: 'unsupported',
    },
  ]);
  assert.equal(JSON.stringify(discovery).includes('SECRET_DESCRIPTION'), false);
  assert.equal(JSON.stringify(discovery).includes('private-org'), false);
  assert.equal(JSON.stringify(discovery).includes('token:SECRET'), false);
});

test('Claude plugin catalog failure is isolated from installed plugins and marketplaces', async () => {
  const provider = new ClaudePluginIntegrationProvider({
    runProcess: async (request) => {
      if (request.args[1] === 'marketplace') {
        return result({
          stdout: JSON.stringify([{ name: 'company-tools', source: 'github' }]),
        });
      }
      if (request.args.includes('--available')) {
        return result({ exitCode: 1, stderr: 'SECRET_CATALOG_ERROR' });
      }
      return result({
        stdout: JSON.stringify([
          {
            id: 'review@company-tools',
            scope: 'project',
            enabled: true,
          },
        ]),
      });
    },
  });

  const discovery = await provider.list({ cwd: '/workspace/project' });

  assert.deepEqual(
    discovery.integrations.map((integration) => integration.name),
    ['review', 'company-tools'],
  );
  assert.deepEqual(discovery.issues, [
    {
      code: 'source-unavailable',
      source: 'plugin',
      message: 'Claude plugin catalog discovery returned a non-zero result.',
    },
  ]);
  assert.equal(
    JSON.stringify(discovery).includes('SECRET_CATALOG_ERROR'),
    false,
  );
});

test('Claude plugin catalog ignores malformed entries without exposing free text', async () => {
  const provider = new ClaudePluginIntegrationProvider({
    runProcess: async (request) => {
      if (request.args[1] === 'marketplace') {
        return result({ stdout: '[]' });
      }
      if (request.args.includes('--available')) {
        return result({
          stdout: JSON.stringify({
            installed: [],
            available: [
              null,
              {
                pluginId: 'mismatch@market',
                name: 'other',
                marketplaceName: 'market',
                description: 'SECRET_INVALID_DESCRIPTION',
              },
              {
                pluginId: 'valid@market',
                name: 'valid',
                marketplaceName: 'market',
              },
            ],
          }),
        });
      }
      return result({ stdout: '[]' });
    },
  });

  const discovery = await provider.list({ cwd: '/workspace/project' });

  assert.deepEqual(
    discovery.integrations.map((integration) => integration.name),
    ['valid'],
  );
  assert.equal(
    discovery.issues.filter(
      (issue) => issue.code === 'invalid-entry' && issue.source === 'plugin',
    ).length,
    2,
  );
  assert.equal(
    JSON.stringify(discovery).includes('SECRET_INVALID_DESCRIPTION'),
    false,
  );
});

test('Claude plugin toggle uses qualified identity, explicit scope and JSON result', async () => {
  const calls: AgentCliProcessRequest[] = [];
  const provider = new ClaudePluginIntegrationProvider({
    runProcess: async (request) => {
      calls.push(request);
      const command = request.args[1];
      return result({
        stdout:
          'informational line\n' +
          JSON.stringify({
            command,
            outcome: 'ok',
            pluginId: 'review@company-tools',
            scope: 'project',
          }),
      });
    },
  });

  const disabled = await provider.setEnabled!({
    cwd: '/workspace/project',
    kind: 'plugin',
    name: 'review',
    marketplace: 'company-tools',
    scope: 'project',
    enabled: false,
  });
  assert.deepEqual(calls[0]?.args, [
    'plugin',
    'disable',
    'review@company-tools',
    '--scope',
    'project',
    '--json',
  ]);
  assert.equal(disabled.enabled, false);

  const enabled = await provider.setEnabled!({
    cwd: '/workspace/project',
    kind: 'plugin',
    name: 'review',
    marketplace: 'company-tools',
    scope: 'project',
    enabled: true,
  });
  assert.deepEqual(calls[1]?.args, [
    'plugin',
    'enable',
    'review@company-tools',
    '--scope',
    'project',
    '--json',
  ]);
  assert.equal(enabled.enabled, true);
});

test('Claude plugin toggle rejects managed scope and mismatched JSON confirmation', async () => {
  const provider = new ClaudePluginIntegrationProvider({
    runProcess: async () =>
      result({
        stdout: JSON.stringify({
          command: 'disable',
          outcome: 'ok',
          pluginId: 'other@company-tools',
          scope: 'project',
        }),
      }),
  });

  await assert.rejects(
    () =>
      provider.setEnabled!({
        cwd: '/workspace/project',
        kind: 'plugin',
        name: 'review',
        marketplace: 'company-tools',
        scope: 'managed',
        enabled: false,
      }),
    /managed plugins cannot be changed/,
  );

  await assert.rejects(
    () =>
      provider.setEnabled!({
        cwd: '/workspace/project',
        kind: 'plugin',
        name: 'review',
        marketplace: 'company-tools',
        scope: 'project',
        enabled: false,
      }),
    (error: unknown) =>
      error instanceof AgentIntegrationDiscoveryError &&
      error.code === 'invalid-response',
  );
});

test('Claude plugin uninstall requires confirmation and preserves plugin data', async () => {
  const calls: AgentCliProcessRequest[] = [];
  const provider = new ClaudePluginIntegrationProvider({
    runProcess: async (request) => {
      calls.push(request);
      return result({
        stdout:
          'informational line\n' +
          JSON.stringify({
            command: 'uninstall',
            outcome: 'ok',
            pluginId: 'review@company-tools',
            scope: 'project',
          }),
      });
    },
  });

  await assert.rejects(
    () =>
      provider.uninstall!({
        cwd: '/workspace/project',
        kind: 'plugin',
        name: 'review',
        marketplace: 'company-tools',
        scope: 'project',
        confirmed: false,
      }),
    /requires explicit confirmation/,
  );

  const removed = await provider.uninstall!({
    cwd: '/workspace/project',
    kind: 'plugin',
    name: 'review',
    marketplace: 'company-tools',
    scope: 'project',
    confirmed: true,
  });

  assert.deepEqual(calls[0]?.args, [
    'plugin',
    'uninstall',
    'review@company-tools',
    '--scope',
    'project',
    '--keep-data',
    '--json',
  ]);
  assert.deepEqual(removed, {
    providerId: 'claude-code',
    kind: 'plugin',
    name: 'review',
    scope: 'project',
    marketplace: 'company-tools',
    dataPreserved: true,
  });
});

test('Claude plugin uninstall rejects managed scope and mismatched JSON confirmation', async () => {
  const provider = new ClaudePluginIntegrationProvider({
    runProcess: async () =>
      result({
        stdout: JSON.stringify({
          command: 'uninstall',
          outcome: 'ok',
          pluginId: 'other@company-tools',
          scope: 'project',
        }),
      }),
  });

  await assert.rejects(
    () =>
      provider.uninstall!({
        cwd: '/workspace/project',
        kind: 'plugin',
        name: 'review',
        marketplace: 'company-tools',
        scope: 'managed',
        confirmed: true,
      }),
    /managed plugins cannot be uninstalled/,
  );

  await assert.rejects(
    () =>
      provider.uninstall!({
        cwd: '/workspace/project',
        kind: 'plugin',
        name: 'review',
        marketplace: 'company-tools',
        scope: 'project',
        confirmed: true,
      }),
    (error: unknown) =>
      error instanceof AgentIntegrationDiscoveryError &&
      error.code === 'invalid-response',
  );
});
