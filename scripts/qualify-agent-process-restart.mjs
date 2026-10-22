#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  AgentAuditStore,
  AgentConversationStore,
  AgentRuntimeStateStore,
  AgentTaskLockManager,
  AgentWorkflowRuntime,
  AgentWorkflowRuntimeError,
  GitAgentTaskStore,
  StaticAgentProviderRegistry,
} from '../packages/agent-runtime/dist/index.js';

const PROJECT = 'qualification-project';
const COMPLETE_TASK = 'completed-task';
const INTERRUPTED_TASK = 'interrupted-task';
const TIMEOUT_MS = 15_000;
const ENTRYPOINT = fileURLToPath(import.meta.url);

function fixturePaths(root) {
  return {
    canonical: path.join(root, 'canonical-tasks'),
    state: path.join(root, 'runtime-state'),
    dispatches: path.join(root, 'dispatches.jsonl'),
  };
}

async function assertDisposableRoot(root) {
  if (!root || !path.isAbsolute(root)) {
    throw new Error('Disposable restart fixture path is required.');
  }
  const actual = await fs.realpath(root);
  const tmp = await fs.realpath(os.tmpdir());
  if (
    path.dirname(actual) !== tmp ||
    !path.basename(actual).startsWith('dd-agent-restart-') ||
    actual !== root
  ) {
    throw new Error('Refusing non-disposable restart fixture.');
  }
  return actual;
}

function createRuntime(root, providerExecute) {
  const paths = fixturePaths(root);
  const taskStore = new GitAgentTaskStore({
    repositoryDirectory: paths.canonical,
  });
  const lockManager = new AgentTaskLockManager({
    stateDirectory: paths.state,
  });
  const audit = new AgentAuditStore({
    stateDirectory: paths.state,
    lockManager,
  });
  const conversation = new AgentConversationStore({
    stateDirectory: paths.state,
    lockManager,
  });
  const stateStore = new AgentRuntimeStateStore({
    stateDirectory: paths.state,
  });
  const provider = {
    id: 'codex',
    status: async () => ({
      providerId: 'codex',
      availability: 'available',
      observedAt: new Date().toISOString(),
    }),
    execute: providerExecute,
  };
  const runtime = new AgentWorkflowRuntime({
    taskStore,
    lockManager,
    checkpointStore: audit,
    executionResultStore: audit,
    conversationStore: conversation,
    runtimeStateStore: stateStore,
    providerRegistry: new StaticAgentProviderRegistry([provider]),
  });
  return { runtime, taskStore, paths };
}

function request(taskId, turnId) {
  return {
    projectId: PROJECT,
    taskId,
    providerId: 'codex',
    userTurn: {
      id: turnId,
      content: 'Synthetic restart qualification instruction.',
    },
  };
}

async function seed(root) {
  const { taskStore } = createRuntime(root, async () => {
    throw new Error('Provider must not execute during setup.');
  });
  const timestamp = new Date().toISOString();
  for (const id of [COMPLETE_TASK, INTERRUPTED_TASK]) {
    await taskStore.save(
      {
        id,
        projectId: PROJECT,
        state: 'review',
        summary: 'Disposable Agent process-restart qualification',
        requestedCapabilities: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      null,
    );
  }
}

async function runOwner(root) {
  const paths = fixturePaths(root);
  const { runtime } = createRuntime(root, async ({ taskId, executionId }) => {
    await fs.appendFile(
      paths.dispatches,
      JSON.stringify({ taskId, executionId }) + '\n',
    );
    if (taskId === INTERRUPTED_TASK) {
      process.stdout.write(
        JSON.stringify({ event: 'execution-started' }) + '\n',
      );
      // Keep the provider fixture alive until the supervisor kills the OS
      // process. It deliberately does not use a real external provider.
      setInterval(() => {}, 1_000);
      await new Promise(() => {});
    }
    return {
      providerId: 'codex',
      outcome: 'succeeded',
      summary: 'Controlled fixture completed.',
      responseText: 'Controlled fixture answer.',
    };
  });
  const completed = await runtime.execute(
    request(COMPLETE_TASK, 'turn-completed'),
  );
  assert.equal(completed.task.task.state, 'review');
  await runtime.execute(request(INTERRUPTED_TASK, 'turn-interrupted'));
  throw new Error('Interrupted fixture must not finish normally.');
}

function hasWorkflowCode(code) {
  return (error) =>
    error instanceof AgentWorkflowRuntimeError && error.code === code;
}

async function runVerifier(root) {
  const { runtime, taskStore, paths } = createRuntime(root, async () => {
    throw new Error('Restart verifier must not dispatch a provider.');
  });
  const before = (await fs.readFile(paths.dispatches, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    before.map((entry) => entry.taskId),
    [COMPLETE_TASK, INTERRUPTED_TASK],
  );
  assert.ok(before.every((entry) => typeof entry.executionId === 'string'));

  const recovered = await runtime.recoverInterrupted(PROJECT);
  assert.deepEqual(recovered, [INTERRUPTED_TASK]);
  const interrupted = await runtime.status(PROJECT, INTERRUPTED_TASK);
  assert.equal(interrupted.runtime.state, 'interrupted');
  assert.equal(interrupted.runtime.lastReason, 'process-interrupted');
  assert.equal(interrupted.task.task.state, 'running');
  assert.equal(interrupted.activeExecution, undefined);
  assert.equal(interrupted.runtime.attempts, 1);

  const beforeTurns = await runtime.conversation(PROJECT, INTERRUPTED_TASK);
  assert.deepEqual(
    beforeTurns.map((turn) => ({ id: turn.id, role: turn.role })),
    [{ id: 'turn-interrupted', role: 'user' }],
  );
  await assert.rejects(
    runtime.execute(request(INTERRUPTED_TASK, 'turn-interrupted')),
    hasWorkflowCode('AGENT_WORKFLOW_TASK_NOT_RUNNABLE'),
  );

  const manuallyRecovered = await runtime.recover(PROJECT, INTERRUPTED_TASK);
  assert.equal(manuallyRecovered.state, 'idle');
  assert.equal(manuallyRecovered.lastReason, 'operator-recovered');
  await assert.rejects(
    runtime.execute(request(INTERRUPTED_TASK, 'turn-interrupted')),
    hasWorkflowCode('AGENT_WORKFLOW_TASK_NOT_RUNNABLE'),
  );
  assert.equal((await taskStore.get(INTERRUPTED_TASK)).task.state, 'running');

  const finishedTurns = await runtime.conversation(PROJECT, COMPLETE_TASK);
  assert.deepEqual(
    finishedTurns.map((turn) => turn.role),
    ['user', 'agent'],
  );
  await assert.rejects(
    runtime.execute(request(COMPLETE_TASK, 'turn-completed')),
    hasWorkflowCode('AGENT_WORKFLOW_TURN_ALREADY_SUBMITTED'),
  );
  assert.deepEqual(
    await runtime.conversation(PROJECT, INTERRUPTED_TASK),
    beforeTurns,
  );
  assert.deepEqual(
    await runtime.conversation(PROJECT, COMPLETE_TASK),
    finishedTurns,
  );
  const after = (await fs.readFile(paths.dispatches, 'utf8'))
    .trim()
    .split('\n');
  assert.equal(after.length, before.length);
  assert.deepEqual(await runtime.recoverInterrupted(PROJECT), []);

  process.stdout.write(
    JSON.stringify({
      version: 1,
      fixture: 'physical-node-restart-canonical-stores',
      processRecovery: 'passed',
      interruptedStateDetected: true,
      explicitRecoveryRequired: true,
      canonicalRunningPreserved: true,
      conversationTurnCount: {
        completed: finishedTurns.length,
        interrupted: beforeTurns.length,
      },
      providerInvocationsBeforeAndAfter: before.length,
      duplicateTurnRejected: true,
      externalProviderExecuted: false,
    }) + '\n',
  );
}

function worker(role, root) {
  const child = spawn(process.execPath, [ENTRYPOINT, role], {
    env: {
      ...process.env,
      AGENT_RESTART_QUALIFY: '1',
      AGENT_RESTART_FIXTURE: root,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  return child;
}

async function waitForMessage(child, expectedEvent) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => {
      reject(new Error('Restart qualification child timed out.'));
    }, TIMEOUT_MS);
    function fail() {
      clearTimeout(timeout);
      reject(new Error('Restart qualification child exited too early.'));
    }
    child.once('error', fail);
    child.once('exit', fail);
    child.stdout.on('data', (chunk) => {
      buffer += String(chunk);
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      clearTimeout(timeout);
      child.removeListener('exit', fail);
      child.removeListener('error', fail);
      try {
        const message = JSON.parse(buffer.slice(0, newline));
        if (expectedEvent && message.event !== expectedEvent) {
          throw new Error('Unexpected restart qualification event.');
        }
        resolve(message);
      } catch {
        reject(new Error('Malformed restart qualification message.'));
      }
    });
  });
}

async function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return { code: child.exitCode, signal: child.signalCode };
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Restart qualification child failed to exit.'));
    }, TIMEOUT_MS);
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
    child.once('error', () => {
      clearTimeout(timeout);
      reject(new Error('Restart qualification child failed.'));
    });
  });
}

async function qualify() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dd-agent-restart-'));
  const children = [];
  try {
    await seed(root);
    const owner = worker('--owner', root);
    children.push(owner);
    await waitForMessage(owner, 'execution-started');
    assert.equal(owner.kill('SIGKILL'), true);
    const terminated = await waitForExit(owner);
    assert.equal(terminated.signal, 'SIGKILL');

    const verifier = worker('--verify', root);
    children.push(verifier);
    const report = await waitForMessage(verifier);
    const exited = await waitForExit(verifier);
    assert.equal(exited.code, 0);
    assert.equal(report.processRecovery, 'passed');
    assert.equal(report.externalProviderExecuted, false);
    process.stdout.write(JSON.stringify(report) + '\n');
    return 0;
  } finally {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await waitForExit(child).catch(() => {});
      }
    }
    await fs.rm(root, { recursive: true, force: true });
  }
}

if (process.env.AGENT_RESTART_QUALIFY !== '1') {
  process.stderr.write('Restart gate requires AGENT_RESTART_QUALIFY=1.\n');
  process.exitCode = 2;
} else if (
  process.argv.length === 3 &&
  (process.argv[2] === '--owner' || process.argv[2] === '--verify')
) {
  try {
    const root = await assertDisposableRoot(process.env.AGENT_RESTART_FIXTURE);
    if (process.argv[2] === '--owner') await runOwner(root);
    else await runVerifier(root);
  } catch {
    process.stderr.write('Restart qualification worker failed.\n');
    process.exitCode = 1;
  }
} else if (process.argv.length !== 2) {
  process.stderr.write('No non-disposable target arguments are supported.\n');
  process.exitCode = 2;
} else {
  try {
    process.exitCode = await qualify();
  } catch {
    process.stderr.write('Physical Agent restart qualification failed.\n');
    process.exitCode = 1;
  }
}
