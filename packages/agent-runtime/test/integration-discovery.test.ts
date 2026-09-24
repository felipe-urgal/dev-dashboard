import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentIntegrationDiscoveryError,
  BrowserCapabilityIntegrationProvider,
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
  const integrations = await provider.list({ cwd: '/workspace/project' });

  assert.deepEqual(calls[0]?.args, ['mcp', 'list', '--json']);
  assert.equal(calls[0]?.cwd, '/workspace/project');
  assert.deepEqual(integrations, [
    {
      id: 'codex:mcp-server:github',
      providerId: 'codex',
      kind: 'mcp-server',
      name: 'github',
      enabled: true,
      authStatus: 'authenticated',
    },
  ]);
  assert.equal(
    JSON.stringify(integrations).includes('SECRET_SHOULD_NOT_LEAK'),
    false,
  );
  assert.equal(JSON.stringify(integrations).includes('secret-arg'), false);
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
  const integrations = await provider.list({ cwd: '/workspace/project' });

  assert.deepEqual(
    integrations.map((integration) => integration.name),
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
    integrations.every(
      (integration) =>
        integration.providerId === 'chatgpt-browser' &&
        integration.kind === 'browser-capability' &&
        integration.enabled === true &&
        integration.authStatus === 'unsupported',
    ),
  );
});
