import assert from 'node:assert/strict';
import test from 'node:test';

import { AgentCliProcessError, runAgentCliProcess } from '../src/index.js';

const cwd = process.cwd();

test('CLI runner captures bounded stdout/stderr and exit code', async () => {
  const result = await runAgentCliProcess({
    command: process.execPath,
    args: [
      '-e',
      'process.stdout.write("hello"); process.stderr.write("warn"); process.exit(7)',
    ],
    cwd,
    timeoutMs: 1_000,
    label: 'Node fixture',
  });

  assert.equal(result.exitCode, 7);
  assert.equal(result.signal, null);
  assert.equal(result.stdout, 'hello');
  assert.equal(result.stderr, 'warn');
  assert.ok(result.startedAt);
  assert.ok(result.finishedAt);
});

test('CLI runner terminates output that exceeds its bound', async () => {
  await assert.rejects(
    () =>
      runAgentCliProcess({
        command: process.execPath,
        args: [
          '-e',
          'process.stdout.write("x".repeat(4096)); setInterval(() => {}, 1000)',
        ],
        cwd,
        timeoutMs: 1_000,
        label: 'Node fixture',
        maxOutputBytes: 64,
        terminationGraceMs: 20,
      }),
    (error: unknown) =>
      error instanceof AgentCliProcessError && error.code === 'output-limit',
  );
});

test('CLI runner times out and terminates only its owned child process', async () => {
  await assert.rejects(
    () =>
      runAgentCliProcess({
        command: process.execPath,
        args: ['-e', 'setInterval(() => {}, 1000)'],
        cwd,
        timeoutMs: 20,
        label: 'Node fixture',
        terminationGraceMs: 20,
      }),
    (error: unknown) =>
      error instanceof AgentCliProcessError && error.code === 'timeout',
  );
});

test('CLI runner supports explicit cancellation', async () => {
  const controller = new AbortController();
  const running = runAgentCliProcess({
    command: process.execPath,
    args: ['-e', 'setInterval(() => {}, 1000)'],
    cwd,
    timeoutMs: 1_000,
    label: 'Node fixture',
    terminationGraceMs: 20,
    signal: controller.signal,
  });

  setTimeout(() => controller.abort(), 20);

  await assert.rejects(
    () => running,
    (error: unknown) =>
      error instanceof AgentCliProcessError && error.code === 'cancelled',
  );
});

test('CLI runner fails closed when command cannot be spawned', async () => {
  await assert.rejects(
    () =>
      runAgentCliProcess({
        command: '__dev_dashboard_missing_provider__',
        args: [],
        cwd,
        timeoutMs: 1_000,
        label: 'Missing provider',
      }),
    (error: unknown) =>
      error instanceof AgentCliProcessError && error.code === 'spawn-failed',
  );
});
