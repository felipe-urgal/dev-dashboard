import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  runRealRestartQualification,
} from './agent-real-restart-qualification.mjs';

const project = 'qualification-project';
const task = 'qualification-task';
const provider = 'codex';
const api = 'http://127.0.0.1:4343';

function taskStatus(phase) {
  return {
    task: {
      version: 4,
      task: { id: task, projectId: project, state: 'running' },
    },
    runtime: {
      taskId: task,
      projectId: project,
      state: phase === 'capture' ? 'running' : 'interrupted',
      executionId: 'execution-example',
      canonicalVersion: 4,
      ...(phase === 'capture' ? { processId: 42 } : {}),
      ...(phase === 'verify'
        ? { lastReason: 'process-interrupted' }
        : {}),
    },
    ...(phase === 'capture'
      ? {
          activeExecution: {
            projectId: project,
            taskId: task,
            executionId: 'execution-example',
          },
        }
      : {}),
  };
}

function createMock(readPhase = () => 'capture', changedTurns = false) {
  const calls = [];
  async function fetchImpl(url, init) {
    calls.push({ url, init });
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers['x-dev-dashboard-token'], 'secret-token');
    const isConversation = url.endsWith('/conversation');
    const turns = [
      {
        id: 'prior-1',
        role: 'agent',
        executionId: 'prior-execution',
        content: 'sensitive original response',
      },
      { id: 'user-2', role: 'user', content: 'sensitive user input' },
    ];
    if (changedTurns && readPhase() === 'verify' && isConversation) {
      turns.push({ id: 'replayed-3', role: 'agent', executionId: 'execution-example' });
    }
    return {
      ok: true,
      status: 200,
      json: async () =>
        isConversation
          ? { turns }
          : taskStatus(readPhase()),
    };
  }
  return { calls, fetchImpl };
}

function captureOutput() {
  const logs = [];
  return {
    logs,
    stream: { write(value) { logs.push(String(value)); } },
  };
}

function args(phase, file) {
  return [
    '--phase', phase,
    '--provider', provider,
    '--project', project,
    '--task', task,
    '--api', api,
    '--snapshot', file,
  ];
}

test('two-phase read-only restart detects interruption and unchanged turns', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-real-restart-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const snapshot = path.join(root, 'evidence.json');
  let phase = 'capture';
  const { calls, fetchImpl } = createMock(() => phase);
  const out = captureOutput();
  const err = captureOutput();
  let preflightCalls = 0;
  const deps = {
    fetchImpl,
    readToken: async () => 'secret-token',
    preflight: async () => { preflightCalls += 1; return 0; },
    sleep: async () => undefined,
    environment: { AGENT_REAL_RESTART_QUALIFY: '1' },
    stdout: out.stream,
    stderr: err.stream,
  };
  assert.equal(await runRealRestartQualification(
    args('capture', snapshot), deps,
  ), 0);
  const raw = await fs.readFile(snapshot, 'utf8');
  assert.doesNotMatch(raw, /secret-token|sensitive|qualification-project|user-2/);
  assert.equal((JSON.parse(raw)).turnHashes.length, 2);
  assert.equal((await fs.stat(snapshot)).mode & 0o777, 0o600);

  phase = 'verify';
  assert.equal(await runRealRestartQualification(
    args('verify', snapshot), deps,
  ), 0);
  assert.equal(preflightCalls, 1);
  assert.equal(calls.length, 6);
  assert.ok(calls.every((call) => call.init.method === undefined));
  assert.equal(out.logs.length, 2);
  assert.equal(JSON.parse(out.logs[1]).status, 'passed');
  assert.equal(err.logs.length, 0);
});

test('restart gate rejects replay evidence and cannot overwrite snapshot', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-real-restart-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const snapshot = path.join(root, 'evidence.json');
  let phase = 'capture';
  const { fetchImpl } = createMock(() => phase, true);
  const err = captureOutput();
  const deps = {
    fetchImpl,
    readToken: async () => 'secret-token',
    preflight: async () => 0,
    sleep: async () => undefined,
    environment: { AGENT_REAL_RESTART_QUALIFY: '1' },
    stdout: captureOutput().stream,
    stderr: err.stream,
  };
  assert.equal(await runRealRestartQualification(
    args('capture', snapshot), deps,
  ), 0);
  assert.equal(await runRealRestartQualification(
    args('capture', snapshot), deps,
  ), 1);
  phase = 'verify';
  assert.equal(await runRealRestartQualification(
    args('verify', snapshot), deps,
  ), 1);
  assert.equal(err.logs.length, 2);
});

test('restart gate refuses non-loopback API, unsafe scope and missing opt-in', async () => {
  const err = captureOutput();
  const deps = {
    environment: {},
    stderr: err.stream,
    stdout: captureOutput().stream,
  };
  assert.equal(await runRealRestartQualification(
    args('capture', '/tmp/not-used.json'), deps,
  ), 2);
  const opted = {
    ...deps,
    environment: { AGENT_REAL_RESTART_QUALIFY: '1' },
  };
  assert.equal(await runRealRestartQualification(
    [...args('capture', '/tmp/not-used.json').slice(0, -2),
      '--snapshot', '/tmp/not-used.json',
      '--api', 'https://example.com'], opted,
  ), 2);
  assert.equal(await runRealRestartQualification(
    [...args('capture', '/tmp/not-used.json'), '--project', project], opted,
  ), 2);
  assert.equal(err.logs.length, 3);
});
