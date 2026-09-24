import assert from 'node:assert/strict';
import test from 'node:test';

import { runAgentQualificationPreflight } from './agent-qualification-preflight.mjs';

function capture() {
  let content = '';
  return {
    stream: {
      write(value) {
        content += String(value);
      },
    },
    read() {
      return content;
    },
  };
}

function readyFetch(providerId, overrides = {}) {
  return async () => ({
    ok: true,
    async json() {
      return {
        providers: [
          {
            providerId,
            availability: 'available',
            observedAt: '2026-09-24T16:00:00.000Z',
            version: 'provider-version',
            reason: 'token=SECRET_SHOULD_NOT_LEAK',
            internalSecret: 'SECRET_INTERNAL',
            ...overrides,
          },
        ],
      };
    },
  });
}

function baseRunner(calls, { dirty = false, cliAvailable = true } = {}) {
  return (command, args, options) => {
    calls.push({ command, args, options });

    if (command === 'git' && args[0] === 'rev-parse') {
      return {
        status: 0,
        stdout: '0123456789abcdef\n',
        stderr: '',
      };
    }
    if (command === 'git' && args[0] === 'status') {
      return {
        status: 0,
        stdout: dirty ? ' M apps/api/src/server.ts\n' : '',
        stderr: '',
      };
    }
    if (command === 'codex' || command === 'claude') {
      return cliAvailable
        ? {
            status: 0,
            stdout: command + ' 1.2.3\n',
            stderr: '',
          }
        : {
            status: 127,
            stdout: '',
            stderr: 'SECRET_PROVIDER_ERROR',
          };
    }

    throw new Error('unexpected command: ' + command);
  };
}

test('preflight Codex prova somente readiness sanitizado e usa subprocess sem shell', async () => {
  const calls = [];
  const stdout = capture();
  const stderr = capture();

  const code = await runAgentQualificationPreflight(['--provider', 'codex'], {
    runner: baseRunner(calls),
    fetchImpl: readyFetch('codex'),
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd: '/workspace/project',
  });

  assert.equal(code, 0);
  assert.equal(stderr.read(), '');
  const output = JSON.parse(stdout.read());
  assert.deepEqual(output, {
    version: 1,
    commit: '0123456789abcdef',
    dirty: false,
    provider: 'codex',
    api: 'loopback',
    cli: {
      available: true,
      version: 'codex 1.2.3',
    },
    status: {
      providerId: 'codex',
      availability: 'available',
      version: 'provider-version',
      observedAt: '2026-09-24T16:00:00.000Z',
    },
    ready: true,
  });
  assert.equal(stdout.read().includes('SECRET_SHOULD_NOT_LEAK'), false);
  assert.equal(stdout.read().includes('SECRET_INTERNAL'), false);
  assert.ok(calls.every((call) => call.options.shell === false));
  assert.ok(calls.every((call) => call.options.cwd === '/workspace/project'));
});

test('preflight Browser usa status do runtime sem inventar CLI local', async () => {
  const calls = [];
  const stdout = capture();

  const code = await runAgentQualificationPreflight(
    ['--provider', 'chatgpt-browser'],
    {
      runner: baseRunner(calls, { dirty: true }),
      fetchImpl: readyFetch('chatgpt-browser'),
      stdout: stdout.stream,
      stderr: capture().stream,
    },
  );

  assert.equal(code, 0);
  const output = JSON.parse(stdout.read());
  assert.equal(output.provider, 'chatgpt-browser');
  assert.equal(output.dirty, true);
  assert.equal(output.cli, undefined);
  assert.deepEqual(
    calls.map((call) => call.command),
    ['git', 'git'],
  );
});

test('preflight falha fechado quando provider real não está pronto', async () => {
  const stdout = capture();
  const stderr = capture();

  const code = await runAgentQualificationPreflight(
    ['--provider', 'claude-code'],
    {
      runner: baseRunner([], { cliAvailable: false }),
      fetchImpl: readyFetch('claude-code', { availability: 'degraded' }),
      stdout: stdout.stream,
      stderr: stderr.stream,
    },
  );

  assert.equal(code, 1);
  const output = JSON.parse(stdout.read());
  assert.equal(output.ready, false);
  assert.deepEqual(output.cli, { available: false });
  assert.equal(stdout.read().includes('SECRET_PROVIDER_ERROR'), false);
  assert.match(stderr.read(), /nenhum teste de paridade foi declarado/i);
});

test('preflight rejeita API não-loopback antes de executar comandos', async () => {
  const calls = [];
  const stderr = capture();

  const code = await runAgentQualificationPreflight(
    ['--provider', 'codex', '--api', 'https://dashboard.example.com'],
    {
      runner: (...args) => {
        calls.push(args);
        return { status: 0, stdout: '', stderr: '' };
      },
      fetchImpl: async () => {
        throw new Error('fetch should not run');
      },
      stdout: capture().stream,
      stderr: stderr.stream,
    },
  );

  assert.equal(code, 2);
  assert.equal(calls.length, 0);
  assert.match(stderr.read(), /HTTP loopback/i);
});
