import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  delegateAcceptedHandoffExecution,
  ROOT_DIRECTORY,
} from './self-update-agent-execute.mjs';
import { installAgent } from './self-update-agent.mjs';
import {
  getOrCreateSelfUpdateAgentToken,
  resolveSelfUpdateAgentPaths,
  sendSelfUpdateAgentRequest,
  startSelfUpdateAgentServer,
} from './self-update-agent-runtime.mjs';
import { SelfUpdateHandoffStore } from './self-update-handoff.mjs';

const REVISION = 'a'.repeat(40);
const PLAN_HASH = 'b'.repeat(64);
const SOURCE_DIRECTORY = path.join(ROOT_DIRECTORY, 'scripts');

async function createTestPaths(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-agent-execute-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  return resolveSelfUpdateAgentPaths({
    installRoot: path.join(root, 'install'),
    configDirectory: path.join(root, 'config'),
    stateRoot: path.join(root, 'state'),
    runtimeDirectory: path.join(root, 'runtime'),
  });
}

async function prepare(store) {
  return await store.prepare({
    projectId: 'dev-dashboard',
    targetRevision: REVISION,
    planHash: PLAN_HASH,
  });
}

test('faz preflight com API viva e delega somente o spawn ao agent persistente', async (t) => {
  const paths = await createTestPaths(t);
  const token = await getOrCreateSelfUpdateAgentToken(paths);
  const store = new SelfUpdateHandoffStore(paths.stateDirectory);
  await installAgent({ paths, sourceDirectory: SOURCE_DIRECTORY });

  let spawned = 0;
  const runtime = await startSelfUpdateAgentServer({
    paths,
    token,
    store,
    spawnProcess() {
      spawned += 1;
      const child = {
        pid: 5151,
        once(event, callback) {
          if (event === 'spawn') queueMicrotask(callback);
          return child;
        },
        unref() {},
      };
      return child;
    },
  });
  t.after(() => runtime.close());

  const handoff = await prepare(store);
  await sendSelfUpdateAgentRequest('claim', {
    paths,
    token,
    handoffId: handoff.id,
  });

  const preflights = [];
  const result = await delegateAcceptedHandoffExecution({
    handoffId: handoff.id,
    paths,
    repositoryRoot: ROOT_DIRECTORY,
    executor: {
      async preflight(revision) {
        preflights.push(revision);
      },
    },
  });

  assert.deepEqual(preflights, [REVISION]);
  assert.equal(spawned, 1);
  assert.deepEqual(result, {
    status: 'worker-started',
    handoffId: handoff.id,
    pid: 5151,
  });
});

test('não executa preflight nem spawn para handoff ainda não aceito', async (t) => {
  const paths = await createTestPaths(t);
  const token = await getOrCreateSelfUpdateAgentToken(paths);
  const store = new SelfUpdateHandoffStore(paths.stateDirectory);
  const runtime = await startSelfUpdateAgentServer({ paths, token, store });
  t.after(() => runtime.close());
  const handoff = await prepare(store);

  let preflights = 0;
  await assert.rejects(
    () =>
      delegateAcceptedHandoffExecution({
        handoffId: handoff.id,
        paths,
        repositoryRoot: ROOT_DIRECTORY,
        executor: {
          async preflight() {
            preflights += 1;
          },
        },
      }),
    (error) => error?.code === 'SELF_UPDATE_HANDOFF_NOT_ACCEPTED',
  );
  assert.equal(preflights, 0);
});
