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
      scope: 'user',
      origin: 'codex-global-config',
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
    scope: 'user',
    origin: 'codex-global-config',
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
  assert.equal(calls[0]?.cwd, '/workspace/project');
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
  assert.equal(JSON.stringify(discovery).includes('SECRET_SHOULD_NOT_LEAK'), false);
  assert.equal(JSON.stringify(discovery).includes('/secret/plugin/path'), false);
  assert.equal(JSON.stringify(discovery).includes('SECRET_NOTE'), false);
});

test('Claude plugin discovery isolates invalid rows and fails closed on invalid JSON', async () => {
  const provider = new ClaudePluginIntegrationProvider({
    runProcess: async () =>
      result({
        stdout: JSON.stringify([
          { id: 'valid@market', scope: 'user', enabled: true },
          { id: '', scope: 'user', enabled: true },
          { id: 'bad-scope', scope: 'session', enabled: true },
          null,
        ]),
      }),
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
