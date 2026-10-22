#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

import {
  isLoopbackUrl,
  readLocalApiToken,
  runAgentQualificationPreflight,
} from './agent-qualification-preflight.mjs';

const PROVIDERS = new Set([
  'codex',
  'claude-code',
  'chatgpt-browser',
  'automatic',
]);
const DEFAULT_API = 'http://127.0.0.1:4343';
const OBSERVATION_DELAY_MS = 3_000;
const MAX_SNAPSHOT_BYTES = 64 * 1024;
const MAX_SNAPSHOT_AGE_MS = 2 * 60 * 60 * 1_000;

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function optionsFromArgs(argv) {
  const options = { api: DEFAULT_API };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (
      !['--phase', '--provider', '--project', '--task', '--snapshot', '--api'].includes(key) ||
      typeof value !== 'string' ||
      !value
    ) {
      throw new Error('Invalid real restart qualification arguments.');
    }
    const name = key.slice(2);
    if (Object.hasOwn(options, name)) {
      throw new Error('Duplicate real restart qualification argument.');
    }
    options[name] = value;
  }
  if (!['capture', 'verify'].includes(options.phase) ||
      !PROVIDERS.has(options.provider) ||
      !options.project ||
      !options.task ||
      !options.snapshot ||
      [options.project, options.task].some(
        (value) => value.length > 256 || value.includes('\0'),
      ) ||
      !isLoopbackUrl(options.api)) {
    throw new Error('Invalid real restart qualification scope.');
  }
  const url = new URL(options.api);
  if (
    url.username || url.password || url.search || url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error('Only the origin of a loopback API is allowed.');
  }
  options.api = url.origin;
  return options;
}

function fingerprintTurn(turn) {
  assert.equal(typeof turn?.id, 'string');
  assert.ok(turn.id.length > 0);
  assert.ok(['user', 'agent'].includes(turn.role));
  return hash(
    JSON.stringify({
      id: turn.id,
      role: turn.role,
      executionId: turn.executionId ?? null,
    }),
  );
}

function readShape(status, turns, project, task) {
  assert.equal(status?.task?.task?.projectId, project);
  assert.equal(status?.task?.task?.id, task);
  assert.equal(status?.runtime?.projectId, project);
  assert.equal(status?.runtime?.taskId, task);
  assert.ok(Number.isSafeInteger(status.task.version));
  assert.ok(Array.isArray(turns?.turns));
  return {
    state: status.task.task.state,
    version: status.task.version,
    runtime: status.runtime,
    activeExecution: status.activeExecution,
    turnHashes: turns.turns.map(fingerprintTurn),
    lastTurnRole: turns.turns.at(-1)?.role,
    agentTurnForExecution: (executionId) =>
      turns.turns.some(
        (turn) =>
          turn.role === 'agent' && turn.executionId === executionId,
      ),
  };
}

function assertCaptured(shape, project, task) {
  assert.equal(shape.state, 'running');
  assert.equal(shape.runtime.state, 'running');
  assert.equal(typeof shape.runtime.executionId, 'string');
  assert.ok(shape.runtime.executionId.length > 0);
  assert.ok(Number.isSafeInteger(shape.runtime.processId));
  assert.equal(shape.activeExecution?.projectId, project);
  assert.equal(shape.activeExecution?.taskId, task);
  assert.equal(
    shape.activeExecution?.executionId,
    shape.runtime.executionId,
  );
  assert.equal(shape.lastTurnRole, 'user');
  assert.equal(
    shape.agentTurnForExecution(shape.runtime.executionId),
    false,
  );
}

function assertVerified(before, after) {
  assert.equal(after.state, 'running');
  assert.equal(after.version, before.canonicalVersion);
  assert.equal(after.runtime.state, 'interrupted');
  assert.equal(after.runtime.lastReason, 'process-interrupted');
  assert.equal(after.runtime.processId, undefined);
  assert.equal(after.activeExecution, undefined);
  assert.equal(hash(after.runtime.executionId), before.executionHash);
  assert.equal(after.runtime.canonicalVersion, before.canonicalVersion);
  assert.deepEqual(after.turnHashes, before.turnHashes);
}

async function requestJson(fetchImpl, options, token, path) {
  let response;
  try {
    response = await fetchImpl(options.api + path, {
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: {
        accept: 'application/json',
        'x-dev-dashboard-token': token,
      },
    });
  } catch {
    throw new Error('Local API unavailable during read-only restart qualification.');
  }
  if (!response.ok) {
    throw new Error('Local API rejected restart qualification read.');
  }
  return response.json();
}

async function observe(fetchImpl, options, token) {
  const path = '/api/projects/' +
    encodeURIComponent(options.project) + '/agent/tasks/' +
    encodeURIComponent(options.task);
  const [status, turns] = await Promise.all([
    requestJson(fetchImpl, options, token, path + '/status'),
    requestJson(fetchImpl, options, token, path + '/conversation'),
  ]);
  return readShape(status, turns, options.project, options.task);
}

async function loadSnapshot(filename) {
  const stat = await fs.lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink() ||
      stat.size > MAX_SNAPSHOT_BYTES) {
    throw new Error('Qualification snapshot is not a safe regular file.');
  }
  const data = JSON.parse(await fs.readFile(filename, 'utf8'));
  if (
    data?.schemaVersion !== 1 ||
    !PROVIDERS.has(data.provider) ||
    !Number.isSafeInteger(data.canonicalVersion) ||
    typeof data.capturedAt !== 'string' ||
    !Number.isFinite(Date.parse(data.capturedAt)) ||
    Date.now() - Date.parse(data.capturedAt) < 0 ||
    Date.now() - Date.parse(data.capturedAt) > MAX_SNAPSHOT_AGE_MS ||
    ![data.projectHash, data.taskHash, data.executionHash].every(
      (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value),
    ) ||
    !Array.isArray(data.turnHashes) ||
    data.turnHashes.length === 0 ||
    !data.turnHashes.every(
      (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value),
    )
  ) {
    throw new Error('Qualification snapshot is invalid or expired.');
  }
  return data;
}

export async function runRealRestartQualification(
  argv,
  {
    fetchImpl = fetch,
    readToken = readLocalApiToken,
    preflight = runAgentQualificationPreflight,
    sleep = delay,
    stdout = process.stdout,
    stderr = process.stderr,
    environment = process.env,
  } = {},
) {
  if (environment.AGENT_REAL_RESTART_QUALIFY !== '1') {
    stderr.write('Real provider restart qualification needs explicit opt-in.\n');
    return 2;
  }
  let options;
  try {
    options = optionsFromArgs(argv);
  } catch {
    stderr.write('Invalid restart qualification arguments or loopback API.\n');
    return 2;
  }

  try {
    const token = await readToken();
    if (options.phase === 'capture') {
      const noop = { write() {} };
      const exit = await preflight(
        ['--provider', options.provider, '--api', options.api],
        { stdout: noop, stderr: noop },
      );
      if (exit !== 0) {
        throw new Error('Real provider preflight did not pass.');
      }
      const current = await observe(fetchImpl, options, token);
      assertCaptured(current, options.project, options.task);
      const snapshot = {
        schemaVersion: 1,
        provider: options.provider,
        api: options.api,
        projectHash: hash(options.project),
        taskHash: hash(options.task),
        executionHash: hash(current.runtime.executionId),
        canonicalVersion: current.version,
        capturedAt: new Date().toISOString(),
        turnHashes: current.turnHashes,
      };
      await fs.writeFile(
        options.snapshot,
        JSON.stringify(snapshot) + '\n',
        { flag: 'wx', mode: 0o600 },
      );
      stdout.write(JSON.stringify({
        phase: 'capture',
        status: 'captured',
        activeExecutionObserved: true,
        realProviderPreflightPassed: true,
        nextAction: 'restart-dashboard-manually-then-verify',
      }) + '\n');
      return 0;
    }

    const snapshot = await loadSnapshot(options.snapshot);
    assert.equal(snapshot.provider, options.provider);
    assert.equal(snapshot.api, options.api);
    assert.equal(snapshot.projectHash, hash(options.project));
    assert.equal(snapshot.taskHash, hash(options.task));
    const first = await observe(fetchImpl, options, token);
    assertVerified(snapshot, first);
    await sleep(OBSERVATION_DELAY_MS);
    const second = await observe(fetchImpl, options, token);
    assertVerified(snapshot, second);
    stdout.write(JSON.stringify({
      phase: 'verify',
      status: 'passed',
      externallyStartedExecutionObserved: true,
      processInterruptionDetected: true,
      canonicalTaskPreserved: true,
      noNewConversationTurnsObserved: true,
      noActiveExecutionObserved: true,
      observationCount: 2,
      providerReplayDirectlyObserved: false,
    }) + '\n');
    return 0;
  } catch {
    stderr.write(
      'Restart qualification blocked or failed; inspect local state without auto-replaying.\n',
    );
    return 1;
  }
}

if (process.argv[1] && import.meta.url ===
  new URL(process.argv[1], 'file:').href) {
  process.exitCode = await runRealRestartQualification(process.argv.slice(2));
}
