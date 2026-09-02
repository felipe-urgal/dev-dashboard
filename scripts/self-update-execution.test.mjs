import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  SelfUpdateExecutionError,
  SelfUpdateExecutor,
  runSelfUpdateExecutionWorker,
} from './self-update-agent.mjs';
import { resolveSelfUpdateAgentPaths } from './self-update-agent-runtime.mjs';
import { SelfUpdateHandoffStore } from './self-update-handoff.mjs';

const ROOT_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const REVISION = 'a'.repeat(40);
const PLAN_HASH = 'b'.repeat(64);

async function createTestPaths(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-execution-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  return resolveSelfUpdateAgentPaths({
    installRoot: path.join(root, 'install'),
    configDirectory: path.join(root, 'config'),
    stateRoot: path.join(root, 'state'),
    runtimeDirectory: path.join(root, 'runtime'),
  });
}

async function acceptedHandoff(store) {
  const handoff = await store.prepare({
    projectId: 'dev-dashboard',
    targetRevision: REVISION,
    planHash: PLAN_HASH,
  });
  return await store.claim(handoff.id);
}

function successfulExecutor(calls) {
  return {
    async waitForApiShutdown() {
      calls.push('shutdown');
    },
    async preflight(revision) {
      calls.push(`preflight:${revision}`);
    },
    async apply(revision) {
      calls.push(`apply:${revision}`);
      return revision;
    },
    async startRuntime(revision) {
      calls.push(`start:${revision}`);
    },
    async waitForReadiness(revision) {
      calls.push(`ready:${revision}`);
      return revision;
    },
  };
}

test('worker persiste applying, restarting, verifying e sucesso com revision comprovada', async (t) => {
  const paths = await createTestPaths(t);
  const store = new SelfUpdateHandoffStore(paths.stateDirectory);
  const handoff = await acceptedHandoff(store);
  const calls = [];

  const result = await runSelfUpdateExecutionWorker({
    handoffId: handoff.id,
    paths,
    repositoryRoot: ROOT_DIRECTORY,
    executor: successfulExecutor(calls),
    store,
  });

  assert.equal(result.status, 'succeeded');
  assert.equal(result.result.code, 'SELF_UPDATE_SUCCEEDED');
  assert.equal(result.result.appliedRevision, REVISION);
  assert.deepEqual(calls, [
    'shutdown',
    `preflight:${REVISION}`,
    `apply:${REVISION}`,
    `start:${REVISION}`,
    `ready:${REVISION}`,
  ]);
});

test('falha antes da parada/mutação termina como failed', async (t) => {
  const paths = await createTestPaths(t);
  const store = new SelfUpdateHandoffStore(paths.stateDirectory);
  const handoff = await acceptedHandoff(store);
  const executor = successfulExecutor([]);
  executor.waitForApiShutdown = async () => {
    throw new SelfUpdateExecutionError(
      'SELF_UPDATE_API_SHUTDOWN_TIMEOUT',
      'API antiga continuou ativa.',
    );
  };

  await assert.rejects(() =>
    runSelfUpdateExecutionWorker({
      handoffId: handoff.id,
      paths,
      repositoryRoot: ROOT_DIRECTORY,
      executor,
      store,
    }),
  );

  const persisted = await store.get(handoff.id);
  assert.equal(persisted.status, 'failed');
  assert.equal(persisted.result.code, 'SELF_UPDATE_API_SHUTDOWN_TIMEOUT');
});

test('falha depois da API cair é conservadora e exige recovery', async (t) => {
  const paths = await createTestPaths(t);
  const store = new SelfUpdateHandoffStore(paths.stateDirectory);
  const handoff = await acceptedHandoff(store);
  const executor = successfulExecutor([]);
  executor.preflight = async () => {
    throw new SelfUpdateExecutionError(
      'SELF_UPDATE_REMOTE_REVISION_MISMATCH',
      'origin/main mudou depois da confirmação.',
    );
  };

  await assert.rejects(() =>
    runSelfUpdateExecutionWorker({
      handoffId: handoff.id,
      paths,
      repositoryRoot: ROOT_DIRECTORY,
      executor,
      store,
    }),
  );

  const persisted = await store.get(handoff.id);
  assert.equal(persisted.status, 'recovery_required');
  assert.equal(persisted.result.code, 'SELF_UPDATE_REMOTE_REVISION_MISMATCH');
});

test('executor usa somente comandos Git fixos e exige fast-forward de origin/main', async () => {
  const commands = [];
  const runProcess = async (command, args, options) => {
    commands.push({ command, args, cwd: options.cwd });
    const key = args.join(' ');
    if (key.startsWith('status ')) return { code: 0, stdout: '', stderr: '' };
    if (key === 'branch --show-current') {
      return { code: 0, stdout: 'main\n', stderr: '' };
    }
    if (key === 'fetch --no-tags origin main') {
      return { code: 0, stdout: '', stderr: '' };
    }
    if (key === 'rev-parse --verify origin/main') {
      return { code: 0, stdout: `${REVISION}\n`, stderr: '' };
    }
    if (key === 'rev-parse --verify HEAD') {
      return { code: 0, stdout: `${'c'.repeat(40)}\n`, stderr: '' };
    }
    if (key.startsWith('merge-base --is-ancestor ')) {
      return { code: 0, stdout: '', stderr: '' };
    }
    throw new Error(`Comando inesperado: ${key}`);
  };
  const executor = new SelfUpdateExecutor({
    repositoryRoot: ROOT_DIRECTORY,
    runProcess,
    apiPort: 4343,
  });

  const result = await executor.preflight(REVISION);

  assert.equal(result.targetRevision, REVISION);
  assert.ok(commands.every((entry) => entry.command === 'git'));
  assert.ok(commands.every((entry) => entry.cwd === ROOT_DIRECTORY));
  assert.deepEqual(
    commands.map((entry) => entry.args),
    [
      ['status', '--porcelain=v1', '--untracked-files=all'],
      ['branch', '--show-current'],
      ['fetch', '--no-tags', 'origin', 'main'],
      ['rev-parse', '--verify', 'origin/main'],
      ['rev-parse', '--verify', 'HEAD'],
      ['merge-base', '--is-ancestor', 'c'.repeat(40), REVISION],
    ],
  );
});

test('readiness só aceita a revision comprovada pelo header do runtime', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    const revision = calls === 1 ? 'c'.repeat(40) : REVISION;
    return {
      ok: true,
      headers: {
        get(name) {
          return name === 'x-dev-dashboard-revision' ? revision : null;
        },
      },
      async text() {
        return JSON.stringify({
          status: 'ok',
          service: 'dev-dashboard-api',
          revision: REVISION,
        });
      },
    };
  };
  const executor = new SelfUpdateExecutor({
    repositoryRoot: ROOT_DIRECTORY,
    runProcess: async () => ({ code: 0, stdout: '', stderr: '' }),
    fetchImpl,
    apiPort: 4343,
  });

  assert.equal(await executor.waitForReadiness(REVISION, 2_000), REVISION);
  assert.equal(calls, 2);
});
