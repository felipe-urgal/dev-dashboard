import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  SelfUpdateExecutor,
  runSelfUpdateExecutionWorker,
} from './self-update-agent.mjs';
import { resolveSelfUpdateAgentPaths } from './self-update-agent-runtime.mjs';
import { SelfUpdateHandoffStore } from './self-update-handoff.mjs';

const execFileAsync = promisify(execFile);
const ROOT_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const PLAN_HASH = 'b'.repeat(64);
const WRONG_REVISION = 'c'.repeat(40);
const AGENT_FILES = [
  'self-update-agent.mjs',
  'self-update-agent-runtime.mjs',
  'self-update-handoff.mjs',
];

const RUNTIME_SOURCE = `import { createServer } from 'node:http';

const port = Number(process.env.DEV_DASHBOARD_API_PORT);
const revision = process.env.DEV_DASHBOARD_RUNTIME_REVISION ?? '';
const server = createServer((request, response) => {
  if (request.url !== '/api/health') {
    response.statusCode = 404;
    response.end();
    return;
  }
  response.statusCode = 200;
  response.setHeader('content-type', 'application/json');
  if (/^[0-9a-f]{40,64}$/.test(revision)) {
    response.setHeader('x-dev-dashboard-revision', revision);
  }
  response.end(JSON.stringify({
    status: 'ok',
    service: 'dev-dashboard-api',
    timestamp: new Date().toISOString(),
  }));
});

server.listen(port, '127.0.0.1');

const shutdown = () => {
  server.close(() => process.exit(0));
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
`;

async function git(cwd, args) {
  const result = await execFileAsync('git', args, {
    cwd,
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0',
    },
  });
  return result.stdout.trim();
}

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Não foi possível alocar porta para o teste.'));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForHealth(port, revision, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(500),
      });
      const body = await response.json();
      if (
        response.ok &&
        body?.status === 'ok' &&
        body?.service === 'dev-dashboard-api' &&
        response.headers.get('x-dev-dashboard-revision') === revision
      ) {
        return;
      }
    } catch {
      // Runtime ainda não ficou disponível.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Runtime não comprovou a revision ${revision}.`);
}

async function waitForExecutionLock(paths, handoffId, timeoutMs = 5_000) {
  const lockPath = path.join(paths.stateDirectory, 'execution.lock');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const lock = JSON.parse(await readFile(lockPath, 'utf8'));
      if (lock?.handoffId === handoffId && lock?.pid === process.pid) return;
    } catch {
      // Worker ainda não adquiriu o lock.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Worker não adquiriu o lock de execução no teste.');
}

async function stopChild(child) {
  if (!child?.pid) return;
  try {
    process.kill(child.pid, 'SIGTERM');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) {
      throw error;
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
}

async function createRepositoryFixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-self-update-e2e-'));
  const repositoryRoot = path.join(root, 'repo');
  const originRoot = path.join(root, 'origin.git');
  const scriptsDirectory = path.join(repositoryRoot, 'scripts');
  await mkdir(scriptsDirectory, { recursive: true });

  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  await writeFile(
    path.join(repositoryRoot, 'package.json'),
    `${JSON.stringify({ name: 'dev-dashboard', private: true }, null, 2)}\n`,
  );
  await writeFile(path.join(scriptsDirectory, 'dev-web.mjs'), RUNTIME_SOURCE);
  for (const fileName of AGENT_FILES) {
    await cp(
      path.join(ROOT_DIRECTORY, 'scripts', fileName),
      path.join(scriptsDirectory, fileName),
    );
  }

  await git(root, ['init', '--bare', originRoot]);
  await git(repositoryRoot, ['init', '--initial-branch=main']);
  await git(repositoryRoot, ['config', 'user.name', 'Self Update Test']);
  await git(repositoryRoot, ['config', 'user.email', 'self-update@example.invalid']);
  await git(repositoryRoot, ['add', '.']);
  await git(repositoryRoot, ['commit', '-m', 'estado inicial']);
  const initialRevision = await git(repositoryRoot, ['rev-parse', 'HEAD']);
  await git(repositoryRoot, ['remote', 'add', 'origin', originRoot]);
  await git(repositoryRoot, ['push', '-u', 'origin', 'main']);

  await writeFile(path.join(repositoryRoot, 'target.txt'), 'revision alvo\n');
  await git(repositoryRoot, ['add', 'target.txt']);
  await git(repositoryRoot, ['commit', '-m', 'revision alvo']);
  const targetRevision = await git(repositoryRoot, ['rev-parse', 'HEAD']);
  await git(repositoryRoot, ['push', 'origin', 'main']);
  await git(repositoryRoot, ['reset', '--hard', initialRevision]);

  const paths = resolveSelfUpdateAgentPaths({
    installRoot: path.join(root, 'agent-install'),
    configDirectory: path.join(root, 'agent-config'),
    stateRoot: path.join(root, 'agent-state'),
    runtimeDirectory: path.join(root, 'agent-runtime'),
  });

  return {
    repositoryRoot,
    initialRevision,
    targetRevision,
    paths,
  };
}

async function acceptedHandoff(paths, targetRevision) {
  const store = new SelfUpdateHandoffStore(paths.stateDirectory);
  const prepared = await store.prepare({
    projectId: 'dev-dashboard',
    targetRevision,
    planHash: PLAN_HASH,
  });
  return { store, handoff: await store.claim(prepared.id) };
}

function startOldRuntime(repositoryRoot, port, revision) {
  return spawn(
    process.execPath,
    [path.join(repositoryRoot, 'scripts/dev-web.mjs')],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        DEV_DASHBOARD_API_PORT: String(port),
        DEV_DASHBOARD_RUNTIME_REVISION: revision,
      },
      shell: false,
      stdio: 'ignore',
    },
  );
}

test('restart real aplica origin/main e só conclui após health provar a revision alvo', async (t) => {
  const fixture = await createRepositoryFixture(t);
  const port = await getFreePort();
  const oldRuntime = startOldRuntime(
    fixture.repositoryRoot,
    port,
    fixture.initialRevision,
  );
  let newRuntime;

  t.after(async () => {
    await stopChild(oldRuntime);
    await stopChild(newRuntime);
  });

  await waitForHealth(port, fixture.initialRevision);
  const { store, handoff } = await acceptedHandoff(
    fixture.paths,
    fixture.targetRevision,
  );

  const executor = new SelfUpdateExecutor({
    repositoryRoot: fixture.repositoryRoot,
    apiPort: port,
    spawnProcess(command, args, options) {
      newRuntime = spawn(command, args, options);
      return newRuntime;
    },
  });

  const execution = runSelfUpdateExecutionWorker({
    handoffId: handoff.id,
    paths: fixture.paths,
    repositoryRoot: fixture.repositoryRoot,
    executor,
    store,
  });

  await waitForExecutionLock(fixture.paths, handoff.id);
  await stopChild(oldRuntime);

  const result = await execution;
  assert.equal(result.status, 'succeeded');
  assert.equal(result.result.code, 'SELF_UPDATE_SUCCEEDED');
  assert.equal(result.result.appliedRevision, fixture.targetRevision);
  assert.equal(
    await git(fixture.repositoryRoot, ['rev-parse', 'HEAD']),
    fixture.targetRevision,
  );
  await waitForHealth(port, fixture.targetRevision);

  const persisted = await store.get(handoff.id);
  assert.equal(persisted.status, 'succeeded');
  assert.equal(persisted.result.appliedRevision, fixture.targetRevision);
});

test('restart real com runtime na revision errada persiste recovery_required', async (t) => {
  const fixture = await createRepositoryFixture(t);
  const port = await getFreePort();
  const oldRuntime = startOldRuntime(
    fixture.repositoryRoot,
    port,
    fixture.initialRevision,
  );
  let newRuntime;

  t.after(async () => {
    await stopChild(oldRuntime);
    await stopChild(newRuntime);
  });

  await waitForHealth(port, fixture.initialRevision);
  const { store, handoff } = await acceptedHandoff(
    fixture.paths,
    fixture.targetRevision,
  );

  const executor = new SelfUpdateExecutor({
    repositoryRoot: fixture.repositoryRoot,
    apiPort: port,
    spawnProcess(command, args, options) {
      newRuntime = spawn(command, args, {
        ...options,
        env: {
          ...options.env,
          DEV_DASHBOARD_RUNTIME_REVISION: WRONG_REVISION,
        },
      });
      return newRuntime;
    },
  });
  const boundedReadiness = executor.waitForReadiness.bind(executor);
  executor.waitForReadiness = async (revision) =>
    await boundedReadiness(revision, 1_500);

  const execution = runSelfUpdateExecutionWorker({
    handoffId: handoff.id,
    paths: fixture.paths,
    repositoryRoot: fixture.repositoryRoot,
    executor,
    store,
  });

  await waitForExecutionLock(fixture.paths, handoff.id);
  await stopChild(oldRuntime);

  await assert.rejects(execution, (error) => {
    return error?.code === 'SELF_UPDATE_READINESS_TIMEOUT';
  });

  const persisted = await store.get(handoff.id);
  assert.equal(persisted.status, 'recovery_required');
  assert.equal(persisted.result.code, 'SELF_UPDATE_READINESS_TIMEOUT');
  assert.equal(
    await git(fixture.repositoryRoot, ['rev-parse', 'HEAD']),
    fixture.targetRevision,
  );
  await waitForHealth(port, WRONG_REVISION);
});
