import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, stat } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  agentStatus,
  installAgent,
  startAgent,
  stopAgent,
} from './self-update-agent.mjs';
import {
  assertAgentEntrypointInstalled,
  getOrCreateSelfUpdateAgentToken,
  resolveSelfUpdateAgentPaths,
  sendSelfUpdateAgentRequest,
  startSelfUpdateAgentServer,
} from './self-update-agent-runtime.mjs';
import { SelfUpdateHandoffStore } from './self-update-handoff.mjs';

const SOURCE_DIRECTORY = path.dirname(
  fileURLToPath(new URL('./self-update-agent.mjs', import.meta.url)),
);
const REVISION = 'a'.repeat(40);
const PLAN_HASH = 'b'.repeat(64);

async function createTestPaths(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-agent-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  return resolveSelfUpdateAgentPaths({
    installRoot: path.join(root, 'install'),
    configDirectory: path.join(root, 'config'),
    stateRoot: path.join(root, 'state'),
    runtimeDirectory: path.join(root, 'runtime'),
  });
}

async function rawRequest(socketPath, payload) {
  return await new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    let content = '';
    socket.once('error', reject);
    socket.once('connect', () => {
      socket.write(`${JSON.stringify(payload)}\n`);
    });
    socket.on('data', (chunk) => {
      content += chunk.toString('utf8');
    });
    socket.once('end', () => {
      try {
        resolve(JSON.parse(content));
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function prepareHandoff(store) {
  return await store.prepare({
    projectId: 'dev-dashboard',
    targetRevision: REVISION,
    planHash: PLAN_HASH,
  });
}

test('instala release isolada com hashes e token privado', async (t) => {
  const paths = await createTestPaths(t);
  const installation = await installAgent({
    paths,
    sourceDirectory: SOURCE_DIRECTORY,
  });

  assert.ok(installation.entrypoint.startsWith(paths.installRoot));
  assert.equal((await stat(paths.installRoot)).mode & 0o777, 0o700);
  assert.equal((await stat(installation.entrypoint)).mode & 0o077, 0);
  assert.equal((await stat(paths.tokenPath)).mode & 0o777, 0o600);

  await assert.rejects(
    () =>
      assertAgentEntrypointInstalled(
        path.join(SOURCE_DIRECTORY, 'self-update-agent.mjs'),
        paths,
      ),
    /modo serve só pode executar a cópia instalada/,
  );
});

test('socket é privado e exige token local válido', async (t) => {
  const paths = await createTestPaths(t);
  const token = await getOrCreateSelfUpdateAgentToken(paths);
  const runtime = await startSelfUpdateAgentServer({
    paths,
    token,
    release: 'test-release',
  });
  t.after(() => runtime.close());

  assert.equal((await stat(paths.socketPath)).mode & 0o777, 0o600);

  const ping = await sendSelfUpdateAgentRequest('ping', { paths, token });
  assert.equal(ping.status, 'ready');
  assert.deepEqual(ping.actions, ['ping', 'inspect', 'claim', 'recover']);

  await assert.rejects(
    () =>
      sendSelfUpdateAgentRequest('ping', {
        paths,
        token: token === 'f'.repeat(64) ? 'e'.repeat(64) : 'f'.repeat(64),
      }),
    (error) => error?.code === 'AGENT_AUTH_FAILED',
  );
});

test('canal recusa campos livres mesmo com token válido', async (t) => {
  const paths = await createTestPaths(t);
  const token = await getOrCreateSelfUpdateAgentToken(paths);
  const runtime = await startSelfUpdateAgentServer({
    paths,
    token,
    release: 'test-release',
  });
  t.after(() => runtime.close());

  const response = await rawRequest(paths.socketPath, {
    version: 1,
    requestId: '11111111-1111-4111-8111-111111111111',
    token,
    action: 'ping',
    command: 'bash -lc reboot',
  });

  assert.equal(response.ok, false);
  assert.equal(response.error.code, 'AGENT_REQUEST_INVALID');
});

test('serializa claims concorrentes do mesmo handoff', async (t) => {
  const paths = await createTestPaths(t);
  const token = await getOrCreateSelfUpdateAgentToken(paths);
  const store = new SelfUpdateHandoffStore(paths.stateDirectory);
  const handoff = await prepareHandoff(store);
  const runtime = await startSelfUpdateAgentServer({
    paths,
    token,
    store,
    release: 'test-release',
  });
  t.after(() => runtime.close());

  const results = await Promise.allSettled([
    sendSelfUpdateAgentRequest('claim', {
      paths,
      token,
      handoffId: handoff.id,
    }),
    sendSelfUpdateAgentRequest('claim', {
      paths,
      token,
      handoffId: handoff.id,
    }),
  ]);

  assert.equal(
    results.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  assert.equal(
    results.filter((result) => result.status === 'rejected').length,
    1,
  );

  const inspected = await sendSelfUpdateAgentRequest('inspect', {
    paths,
    token,
    handoffId: handoff.id,
  });
  assert.equal(inspected.status, 'accepted');
});

test('startup recupera handoff assumido por execução anterior', async (t) => {
  const paths = await createTestPaths(t);
  const token = await getOrCreateSelfUpdateAgentToken(paths);
  const store = new SelfUpdateHandoffStore(paths.stateDirectory);
  const handoff = await prepareHandoff(store);
  await store.claim(handoff.id);

  const runtime = await startSelfUpdateAgentServer({
    paths,
    token,
    store,
    release: 'test-release',
  });
  t.after(() => runtime.close());

  const inspected = await sendSelfUpdateAgentRequest('inspect', {
    paths,
    token,
    handoffId: handoff.id,
  });
  assert.equal(inspected.status, 'recovery_required');
  assert.equal(inspected.result.code, 'SELF_UPDATE_HELPER_INTERRUPTED');
});

test('segundo agent não executa recovery enquanto o socket já está ativo', async (t) => {
  const paths = await createTestPaths(t);
  const token = await getOrCreateSelfUpdateAgentToken(paths);
  const firstStore = new SelfUpdateHandoffStore(paths.stateDirectory);
  const firstRuntime = await startSelfUpdateAgentServer({
    paths,
    token,
    store: firstStore,
    release: 'first-release',
  });
  t.after(() => firstRuntime.close());

  const handoff = await prepareHandoff(firstStore);
  await sendSelfUpdateAgentRequest('claim', {
    paths,
    token,
    handoffId: handoff.id,
  });

  const secondStore = new SelfUpdateHandoffStore(paths.stateDirectory);
  await assert.rejects(
    () =>
      startSelfUpdateAgentServer({
        paths,
        token,
        store: secondStore,
        release: 'second-release',
      }),
    (error) => error?.code === 'AGENT_ALREADY_RUNNING',
  );

  const inspected = await sendSelfUpdateAgentRequest('inspect', {
    paths,
    token,
    handoffId: handoff.id,
  });
  assert.equal(inspected.status, 'accepted');
});

test('lifecycle inicia cópia instalada fora do repo e encerra pelo PID autenticado', async (t) => {
  const paths = await createTestPaths(t);
  await installAgent({ paths, sourceDirectory: SOURCE_DIRECTORY });
  t.after(async () => {
    await stopAgent({ paths }).catch(() => undefined);
  });

  const started = await startAgent({ paths });
  assert.equal(started.status, 'started');
  assert.notEqual(started.pid, process.pid);

  const running = await agentStatus({ paths });
  assert.equal(running.status, 'running');
  assert.equal(running.instanceId, started.instanceId);

  const stopped = await stopAgent({ paths });
  assert.equal(stopped.status, 'stopped');
  assert.equal((await agentStatus({ paths })).status, 'stopped');
});

test('token com permissões abertas falha fechado', async (t) => {
  const paths = await createTestPaths(t);
  await getOrCreateSelfUpdateAgentToken(paths);
  await chmod(paths.tokenPath, 0o644);

  await assert.rejects(
    () => sendSelfUpdateAgentRequest('ping', { paths }),
    (error) => error?.code === 'AGENT_FILE_UNSAFE',
  );
});

test('token ausente não é interpretado como agent parado', async (t) => {
  const paths = await createTestPaths(t);
  const token = await getOrCreateSelfUpdateAgentToken(paths);
  const runtime = await startSelfUpdateAgentServer({
    paths,
    token,
    release: 'test-release',
  });
  t.after(() => runtime.close());
  await rm(paths.tokenPath, { force: true });

  await assert.rejects(
    () => agentStatus({ paths }),
    (error) => error?.code === 'AGENT_TOKEN_MISSING',
  );
});
