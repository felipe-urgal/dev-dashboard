import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BrowserProviderError,
  ChatGptBrowserAgentProvider,
  HttpBrowserBridgeClient,
  createLocalAgentProviderRegistry,
  type AgentProviderExecutionRequest,
  type BrowserBridgeCreateJobRequest,
  type BrowserBridgeHealth,
  type BrowserBridgeJob,
  type BrowserBridgePort,
} from '../src/index.js';

const observedAt = '2026-09-22T11:00:00.000Z';

function request(
  capabilities: AgentProviderExecutionRequest['allowedCapabilities'] = [],
  signal?: AbortSignal,
): AgentProviderExecutionRequest {
  return {
    taskId: 'task-1',
    executionId: 'execution-1',
    projectId: 'project-1',
    environmentInstanceId: 'env-1',
    summary: 'Implement the requested browser task',
    allowedCapabilities: capabilities,
    ...(signal ? { signal } : {}),
  };
}

class StubBridge implements BrowserBridgePort {
  healthValue: BrowserBridgeHealth = {
    ok: true,
    heartbeatAt: observedAt,
    heartbeatVersion: '1.0.0',
    sessionState: 'available',
  };

  created: BrowserBridgeCreateJobRequest[] = [];
  cancelled: Array<{ id: string; code?: string }> = [];
  states: BrowserBridgeJob[] = [{ id: 'job-1', state: 'finished' }];

  async health(): Promise<BrowserBridgeHealth> {
    return this.healthValue;
  }

  async createJob(
    input: BrowserBridgeCreateJobRequest,
  ): Promise<BrowserBridgeJob> {
    this.created.push(input);
    return { id: 'job-1', state: 'queued', createdAt: observedAt };
  }

  async getJob(): Promise<BrowserBridgeJob> {
    return this.states.shift() ?? { id: 'job-1', state: 'running' };
  }

  async cancelJob(id: string, code?: string): Promise<BrowserBridgeJob> {
    this.cancelled.push({ id, ...(code ? { code } : {}) });
    return { id, state: 'cancelled', errorCode: code ?? null };
  }
}

test('HTTP bridge client is loopback-only and requires a private token', async () => {
  assert.throws(
    () =>
      new HttpBrowserBridgeClient({
        host: '0.0.0.0',
        token: 'secret',
      }),
    /127\.0\.0\.1/,
  );

  const client = new HttpBrowserBridgeClient({
    fetchFn: (async () => {
      throw new Error('must not fetch without token');
    }) as typeof fetch,
  });

  await assert.rejects(
    () => client.health(),
    (error: unknown) =>
      error instanceof BrowserProviderError &&
      error.code === 'bridge-token-missing',
  );
});

test('HTTP bridge client sends token only to loopback', async () => {
  let observedUrl = '';
  let observedToken = '';

  const client = new HttpBrowserBridgeClient({
    token: 'local-private-token',
    fetchFn: (async (input, init) => {
      observedUrl = String(input);
      observedToken = String(
        (init?.headers as Record<string, string>)['x-agent-bridge-token'],
      );
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            heartbeatAt: observedAt,
            heartbeatVersion: '1.0.0',
          };
        },
      } as Response;
    }) as typeof fetch,
  });

  const health = await client.health();
  assert.equal(health.ok, true);
  assert.equal(observedUrl, 'http://127.0.0.1:43821/v1/health');
  assert.equal(observedToken, 'local-private-token');
});

test('browser doctor differentiates bridge, extension and session failures', async () => {
  const bridge = new StubBridge();
  const provider = new ChatGptBrowserAgentProvider({
    bridge,
    resolveCwd: () => '/workspace/project',
    now: () => observedAt,
  });

  bridge.healthValue = { ok: true };
  assert.equal(
    (await provider.status()).reason,
    'browser extension unavailable',
  );

  bridge.healthValue = {
    ok: true,
    heartbeatAt: observedAt,
    sessionState: 'unavailable',
  };
  assert.equal((await provider.status()).reason, 'ChatGPT session unavailable');

  bridge.healthValue = {
    ok: true,
    heartbeatAt: observedAt,
    sessionState: 'available',
  };
  assert.equal((await provider.status()).availability, 'available');

  const offlineBridge = new StubBridge();
  offlineBridge.health = async () => {
    throw new BrowserProviderError('bridge-unavailable', 'offline');
  };
  const unavailable = new ChatGptBrowserAgentProvider({
    bridge: offlineBridge,
    resolveCwd: () => '/workspace/project',
    now: () => observedAt,
  });
  const status = await unavailable.status();
  assert.equal(status.availability, 'unavailable');
  assert.equal(status.reason, 'browser bridge unavailable');
});

test('browser provider executes one bounded structured job', async () => {
  const bridge = new StubBridge();
  bridge.states = [
    { id: 'job-1', state: 'running' },
    { id: 'job-1', state: 'finished' },
  ];

  const provider = new ChatGptBrowserAgentProvider({
    bridge,
    resolveCwd: () => '/workspace/project',
    now: () => observedAt,
    sleep: async () => {},
  });

  const result = await provider.execute(request(['workspace:write']));

  assert.equal(result.providerId, 'chatgpt-browser');
  assert.equal(result.outcome, 'succeeded');
  assert.equal(bridge.created.length, 1);

  const created = bridge.created[0];
  assert.equal(created?.cwd, '/workspace/project');
  assert.deepEqual(created?.repositories, {
    project: '/workspace/project',
  });
  assert.equal(created?.capabilities['workspace:write'], true);
  assert.ok(created?.tools.includes('apply_patch'));
  assert.ok(created?.tools.includes('run_process'));
  assert.equal(created?.tools.includes('git_push'), false);
  assert.equal(created?.tools.includes('github_pull_request'), false);
  assert.match(created?.prompt ?? '', /structured tools/);
  assert.match(created?.prompt ?? '', /terminal_result/);
});

test('browser cancellation cancels only the owned job', async () => {
  const bridge = new StubBridge();
  bridge.states = [{ id: 'job-1', state: 'running' }];
  const controller = new AbortController();
  controller.abort();

  const provider = new ChatGptBrowserAgentProvider({
    bridge,
    resolveCwd: () => '/workspace/project',
    now: () => observedAt,
    sleep: async () => {},
  });

  const result = await provider.execute(request([], controller.signal));

  assert.equal(result.outcome, 'cancelled');
  assert.deepEqual(bridge.cancelled, [{ id: 'job-1', code: 'cancelled' }]);
});

test('ambiguous browser failure never retries or becomes success', async () => {
  const bridge = new StubBridge();
  bridge.states = [
    {
      id: 'job-1',
      state: 'failed',
      errorCode: 'unknown_after_submit',
      browserPhase: 'after_submit',
    },
  ];

  const provider = new ChatGptBrowserAgentProvider({
    bridge,
    resolveCwd: () => '/workspace/project',
    now: () => observedAt,
    sleep: async () => {},
  });

  const result = await provider.execute(request());

  assert.equal(result.outcome, 'unknown');
  assert.equal(result.failure?.kind, 'ambiguous');
  assert.equal(bridge.created.length, 1);
});

test('registry can include ChatGPT Browser without changing the default fallback', () => {
  const bridge = new StubBridge();
  const registry = createLocalAgentProviderRegistry({
    resolveCwd: () => '/workspace/project',
    browser: {
      bridge,
      resolveCwd: () => '/workspace/project',
      now: () => observedAt,
    },
  });

  assert.deepEqual(
    registry.list().map((provider) => provider.id),
    ['automatic', 'codex', 'claude-code', 'chatgpt-browser'],
  );
});
