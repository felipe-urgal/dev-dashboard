import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentCliProcessError,
  AgentProviderError,
  AutomaticAgentProvider,
  ClaudeCodeAgentProvider,
  CodexAgentProvider,
  StaticAgentProviderRegistry,
  createLocalAgentProviderRegistry,
  type AgentCliProcessRequest,
  type AgentCliProcessResult,
  type AgentCliProcessRunner,
  type AgentProvider,
  type AgentProviderExecutionRequest,
  type AgentProviderResult,
  type AgentProviderStatus,
} from '../src/index.js';

const observedAt = '2026-09-22T10:00:00.000Z';

function request(
  capabilities: AgentProviderExecutionRequest['allowedCapabilities'] = [
    'workspace:write',
  ],
): AgentProviderExecutionRequest {
  return {
    taskId: 'task-1',
    executionId: 'execution-1',
    projectId: 'project-1',
    environmentInstanceId: 'env-1',
    summary: 'Implement the requested change',
    allowedCapabilities: capabilities,
  };
}

function result(
  overrides: Partial<AgentCliProcessResult> = {},
): AgentCliProcessResult {
  return {
    exitCode: 0,
    signal: null,
    stdout: '',
    stderr: '',
    startedAt: observedAt,
    finishedAt: observedAt,
    ...overrides,
  };
}

function createProviderRunner(): {
  runner: AgentCliProcessRunner;
  calls: AgentCliProcessRequest[];
} {
  const calls: AgentCliProcessRequest[] = [];
  const runner: AgentCliProcessRunner = async (input) => {
    calls.push(input);

    if (input.args[0] === '--version') {
      return result({
        stdout: input.command.includes('claude')
          ? '2.1.259 (Claude Code)\n'
          : 'codex-cli 1.2.3\n',
      });
    }

    if (input.args[0] === 'login' || input.args[0] === 'auth') {
      return result({ stdout: 'authenticated\n' });
    }

    return result({ stdout: 'SECRET_SHOULD_NOT_BE_PERSISTED\n' });
  };

  return { runner, calls };
}

test('Codex doctor checks version and authentication before execution', async () => {
  const fake = createProviderRunner();
  const provider = new CodexAgentProvider({
    resolveCwd: () => '/workspace/project',
    runProcess: fake.runner,
    command: 'codex-test',
    now: () => observedAt,
  });

  const status = await provider.status();
  assert.equal(status.availability, 'available');
  assert.equal(status.version, 'codex-cli 1.2.3');
  assert.deepEqual(status.quota, {
    status: 'unavailable',
    source: 'unavailable',
    reason:
      'Codex quota is only documented through interactive status/usage surfaces.',
  });
  assert.deepEqual(
    fake.calls.map((call) => call.args),
    [['--version'], ['login', 'status']],
  );

  const execution = await provider.execute(request());

  assert.equal(execution.providerId, 'codex');
  assert.equal(execution.outcome, 'succeeded');
  assert.equal(
    JSON.stringify(execution).includes('SECRET_SHOULD_NOT_BE_PERSISTED'),
    false,
  );

  const executionCall = fake.calls.at(-1);
  assert.equal(executionCall?.cwd, '/workspace/project');
  assert.deepEqual(executionCall?.args.slice(0, 7), [
    'exec',
    '--json',
    '--skip-git-repo-check',
    '--sandbox',
    'workspace-write',
    '--ask-for-approval',
    'never',
  ]);
});

test('Codex captures provider-reported usage without persisting raw JSONL', async () => {
  const fake = createProviderRunner();
  const provider = new CodexAgentProvider({
    resolveCwd: () => '/workspace/project',
    runProcess: async (input) => {
      if (input.args[0] === '--version' || input.args[0] === 'login') {
        return fake.runner(input);
      }

      return result({
        stdout: [
          JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' }),
          JSON.stringify({
            type: 'turn.completed',
            usage: {
              input_tokens: 120,
              cached_input_tokens: 40,
              cache_write_input_tokens: 5,
              output_tokens: 30,
              reasoning_output_tokens: 7,
              total_tokens: 150,
            },
          }),
          'SECRET_SHOULD_NOT_BE_PERSISTED',
        ].join('\n'),
      });
    },
  });

  const execution = await provider.execute(request());

  assert.deepEqual(execution.usage, {
    providerId: 'codex',
    source: 'provider',
    inputTokens: 120,
    cachedInputTokens: 40,
    cacheWriteInputTokens: 5,
    outputTokens: 30,
    reasoningTokens: 7,
    totalTokens: 150,
  });
  assert.equal(
    JSON.stringify(execution).includes('SECRET_SHOULD_NOT_BE_PERSISTED'),
    false,
  );
});

test('CLI provider inclui instrução de continuação no prompt', async () => {
  const fake = createProviderRunner();
  const provider = new CodexAgentProvider({
    resolveCwd: () => '/workspace/project',
    runProcess: fake.runner,
  });

  await provider.execute({
    ...request(),
    continuationInstruction: 'Continue after explicit checkpoint approval.',
  });

  const prompt = String(fake.calls.at(-1)?.args.at(-1) ?? '');
  assert.match(prompt, /Continuation instruction:/);
  assert.match(prompt, /explicit checkpoint approval/);
});

test('Codex uses read-only sandbox when workspace write is not granted', async () => {
  const fake = createProviderRunner();
  const provider = new CodexAgentProvider({
    resolveCwd: () => '/workspace/project',
    runProcess: fake.runner,
  });

  const execution = await provider.execute(request([]));
  assert.equal(execution.outcome, 'succeeded');

  const executionCall = fake.calls.at(-1);
  assert.equal(executionCall?.args[4], 'read-only');
});

test('Claude doctor validates supported version and auth before auto mode', async () => {
  const fake = createProviderRunner();
  const provider = new ClaudeCodeAgentProvider({
    resolveCwd: () => '/workspace/project',
    runProcess: fake.runner,
    command: 'claude-test',
    now: () => observedAt,
  });

  const status = await provider.status();
  assert.equal(status.availability, 'available');
  assert.match(status.version ?? '', /2\.1\.259/);
  assert.deepEqual(status.quota, {
    status: 'unavailable',
    source: 'unavailable',
    reason:
      'Claude Code quota is not exposed here through a supported machine-readable CLI interface.',
  });
  assert.deepEqual(
    fake.calls.map((call) => call.args),
    [['--version'], ['auth', 'status']],
  );

  const execution = await provider.execute(request());
  assert.equal(execution.providerId, 'claude-code');
  assert.equal(execution.outcome, 'succeeded');

  const executionCall = fake.calls.at(-1);
  assert.deepEqual(executionCall?.args.slice(0, 9), [
    '-p',
    '--permission-mode',
    'auto',
    '--permission-prompts',
    'none',
    '--no-session-persistence',
    '--output-format',
    'stream-json',
    '--verbose',
  ]);
});

test('Claude captures structured model, tokens, cost and duration', async () => {
  const provider = new ClaudeCodeAgentProvider({
    resolveCwd: () => '/workspace/project',
    command: 'claude-test',
    now: () => observedAt,
    runProcess: async (input) => {
      if (input.args[0] === '--version') {
        return result({ stdout: '2.1.259 (Claude Code)\n' });
      }
      if (input.args[0] === 'auth') {
        return result({ stdout: 'authenticated\n' });
      }

      return result({
        stdout: [
          JSON.stringify({
            type: 'system',
            subtype: 'init',
            model: 'claude-sonnet-test',
          }),
          JSON.stringify({
            type: 'assistant',
            message: {
              model: 'claude-sonnet-test',
              usage: {
                input_tokens: 100,
                cache_read_input_tokens: 20,
                cache_creation_input_tokens: 5,
                output_tokens: 30,
              },
            },
          }),
          JSON.stringify({
            type: 'assistant',
            message: {
              model: 'claude-sonnet-test',
              usage: {
                input_tokens: 10,
                output_tokens: 4,
              },
            },
          }),
          JSON.stringify({
            type: 'result',
            subtype: 'success',
            total_cost_usd: 0.0123,
            duration_ms: 2450,
            result: 'SECRET_SHOULD_NOT_BE_PERSISTED',
          }),
        ].join('\n'),
      });
    },
  });

  const execution = await provider.execute(request());

  assert.deepEqual(execution.usage, {
    providerId: 'claude-code',
    source: 'provider',
    model: 'claude-sonnet-test',
    inputTokens: 110,
    cachedInputTokens: 20,
    cacheWriteInputTokens: 5,
    outputTokens: 34,
    reportedCost: {
      amount: 0.0123,
      currency: 'USD',
    },
    durationMs: 2450,
  });
  assert.equal(
    JSON.stringify(execution).includes('SECRET_SHOULD_NOT_BE_PERSISTED'),
    false,
  );
});

test('Claude execution succeeds when structured usage is absent', async () => {
  const provider = new ClaudeCodeAgentProvider({
    resolveCwd: () => '/workspace/project',
    command: 'claude-test',
    now: () => observedAt,
    runProcess: async (input) => {
      if (input.args[0] === '--version') {
        return result({ stdout: '2.1.259 (Claude Code)\n' });
      }
      if (input.args[0] === 'auth') return result();

      return result({
        stdout: JSON.stringify({
          type: 'result',
          subtype: 'success',
          result: 'done',
        }),
      });
    },
  });

  const execution = await provider.execute(request());

  assert.equal(execution.outcome, 'succeeded');
  assert.equal(execution.usage, undefined);
});

test('Claude doctor degrades cleanly on unsupported version', async () => {
  const calls: AgentCliProcessRequest[] = [];
  const provider = new ClaudeCodeAgentProvider({
    resolveCwd: () => '/workspace/project',
    runProcess: async (input) => {
      calls.push(input);
      return result({ stdout: '2.1.258\n' });
    },
    now: () => observedAt,
  });

  const status = await provider.status();

  assert.equal(status.availability, 'degraded');
  assert.equal(
    status.reason,
    'Claude Code version is below the supported minimum',
  );
  assert.equal(calls.length, 1);
});

function stubProvider({
  id,
  availability = 'available',
  compatible = true,
  outcome = 'succeeded',
}: {
  id: 'codex' | 'claude-code';
  availability?: AgentProviderStatus['availability'];
  compatible?: boolean;
  outcome?: AgentProviderResult['outcome'];
}): AgentProvider & { executions: number } {
  return {
    id,
    executions: 0,
    async status() {
      return {
        providerId: id,
        availability,
        observedAt,
      };
    },
    supports() {
      return compatible;
    },
    async execute() {
      this.executions += 1;
      return {
        providerId: id,
        outcome,
        summary: id + ' result',
      };
    },
  };
}

test('Automatic selection uses healthy providers in deterministic order', async () => {
  const claude = stubProvider({
    id: 'claude-code',
    availability: 'unavailable',
  });
  const codex = stubProvider({ id: 'codex' });
  const registry = new StaticAgentProviderRegistry([claude, codex]);
  const automatic = new AutomaticAgentProvider({
    registry,
    preferredProviderId: 'claude-code',
    fallbackOrder: ['codex'],
    now: () => observedAt,
  });

  const execution = await automatic.execute(request());

  assert.equal(execution.providerId, 'codex');
  assert.equal(claude.executions, 0);
  assert.equal(codex.executions, 1);
});

test('Automatic resolves provider preference per execution project', async () => {
  const claude = stubProvider({ id: 'claude-code' });
  const codex = stubProvider({ id: 'codex' });
  const registry = new StaticAgentProviderRegistry([claude, codex]);
  const automatic = new AutomaticAgentProvider({
    registry,
    fallbackOrder: ['codex', 'claude-code'],
    resolvePreference: async (agentRequest) =>
      agentRequest.projectId === 'project-1'
        ? {
            preferredProviderId: 'claude-code',
            fallbackOrder: ['codex'],
          }
        : null,
  });

  const execution = await automatic.execute(request());

  assert.equal(execution.providerId, 'claude-code');
  assert.equal(claude.executions, 1);
  assert.equal(codex.executions, 0);
});

test('Automatic selection never silently switches after execution starts', async () => {
  const claude = stubProvider({ id: 'claude-code', outcome: 'failed' });
  const codex = stubProvider({ id: 'codex' });
  const registry = new StaticAgentProviderRegistry([claude, codex]);
  const automatic = new AutomaticAgentProvider({
    registry,
    preferredProviderId: 'claude-code',
    fallbackOrder: ['codex'],
  });

  const execution = await automatic.execute(request());

  assert.equal(execution.providerId, 'claude-code');
  assert.equal(execution.outcome, 'failed');
  assert.equal(claude.executions, 1);
  assert.equal(codex.executions, 0);
});

test('Automatic skips incompatible or missing providers without blocking healthy ones', async () => {
  const claude = stubProvider({ id: 'claude-code', compatible: false });
  const registry = new StaticAgentProviderRegistry([claude]);
  const automatic = new AutomaticAgentProvider({
    registry,
    fallbackOrder: ['chatgpt-browser', 'claude-code'],
  });

  await assert.rejects(
    () => automatic.execute(request()),
    (error: unknown) =>
      error instanceof AgentProviderError &&
      error.code === 'no-compatible-provider',
  );

  const codex = stubProvider({ id: 'codex' });
  const codexOnly = new AutomaticAgentProvider({
    registry: new StaticAgentProviderRegistry([codex]),
    fallbackOrder: ['claude-code', 'codex'],
  });
  assert.equal((await codexOnly.execute(request())).providerId, 'codex');
});

test('Registry rejects unknown providers before dispatch', () => {
  const registry = new StaticAgentProviderRegistry([]);

  assert.throws(
    () => registry.require('unknown'),
    (error: unknown) =>
      error instanceof AgentProviderError && error.code === 'unknown-provider',
  );
});

test('Backend-owned cwd is required and absolute', async () => {
  const fake = createProviderRunner();
  const provider = new CodexAgentProvider({
    resolveCwd: () => '../user-controlled',
    runProcess: fake.runner,
  });

  await assert.rejects(
    () => provider.execute(request()),
    (error: unknown) =>
      error instanceof AgentProviderError && error.code === 'invalid-cwd',
  );
});

test('Cancellation and ambiguous termination are normalized without raw output', async () => {
  const cancelled = new CodexAgentProvider({
    resolveCwd: () => '/workspace/project',
    runProcess: async (input) => {
      if (input.args[0] === '--version') {
        return result({ stdout: 'codex-cli 1.2.3' });
      }
      if (input.args[0] === 'login') return result();
      throw new AgentCliProcessError('cancelled', 'cancelled');
    },
  });

  const cancelledResult = await cancelled.execute(request());
  assert.equal(cancelledResult.outcome, 'cancelled');

  const ambiguous = new CodexAgentProvider({
    resolveCwd: () => '/workspace/project',
    runProcess: async (input) => {
      if (input.args[0] === '--version') {
        return result({ stdout: 'codex-cli 1.2.3' });
      }
      if (input.args[0] === 'login') return result();
      throw new AgentCliProcessError(
        'termination-timeout',
        'secret internal output',
      );
    },
  });

  const ambiguousResult = await ambiguous.execute(request());
  assert.equal(ambiguousResult.outcome, 'unknown');
  assert.equal(
    JSON.stringify(ambiguousResult).includes('secret internal output'),
    false,
  );
});

test('Factory registers Automatic, Codex and Claude without shell authority', () => {
  const registry = createLocalAgentProviderRegistry({
    resolveCwd: () => '/workspace/project',
  });

  assert.deepEqual(
    registry.list().map((provider) => provider.id),
    ['automatic', 'codex', 'claude-code'],
  );
});
