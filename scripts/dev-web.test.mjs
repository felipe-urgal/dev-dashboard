import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertBuildHasNoCredentials,
  delegateManagedSelfUpdate,
  orchestrate,
  proveLegacyManagedSelfUpdate,
  resolveInstalledEnvironment,
} from './dev-web.mjs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  LOCAL_SERVICE_NAME,
  MANAGED_UNIT_MARKER,
  resolveLocalInstallPaths,
} from './local-install.mjs';
import { SelfUpdateHandoffStore } from './self-update-handoff.mjs';

const REVISION = 'a'.repeat(40);
const PLAN_HASH = 'b'.repeat(64);

async function createRuntimeHandoff(stateDirectory, revision = REVISION) {
  const store = new SelfUpdateHandoffStore(stateDirectory);
  const handoff = await store.prepare({
    projectId: 'dev-dashboard',
    targetRevision: revision,
    planHash: PLAN_HASH,
  });
  await store.claim(handoff.id);
  await store.transition(handoff.id, 'applying');
  await store.transition(handoff.id, 'restarting');
  return store;
}

test('orquestrador aborta antes do build quando o diagnóstico falha', async () => {
  let executions = 0;
  await assert.rejects(
    orchestrate({
      diagnoseEnvironment: async () => [{ status: 'error' }],
      runner: async () => {
        executions += 1;
        return { code: 0 };
      },
    }),
    /Diagnóstico/,
  );
  assert.equal(executions, 0);
});

test('orquestrador manual constrói e inicia somente a API distribuída', async () => {
  const calls = [];
  const code = await orchestrate({
    rootDirectory: '/repo',
    diagnoseEnvironment: async () => [],
    createBootstrapToken: () => 'e'.repeat(64),
    fileChecker: async () => undefined,
    buildScanner: async () => undefined,
    runner: async (command, args, options) => {
      calls.push({ command, args, options });
      return { code: calls.length === 2 ? 7 : 0 };
    },
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].args, ['run', 'build']);
  assert.match(calls[1].args[0], /apps\/api\/dist\/server\.js$/);
  assert.equal(calls[1].options.env.DEV_DASHBOARD_LOCAL_DISTRIBUTION, '1');
  assert.equal(
    calls[1].options.env.DEV_DASHBOARD_BROWSER_BOOTSTRAP,
    'e'.repeat(64),
  );
  assert.equal(code, 7);
});

test('modo instalado não rebuilda no login e publica a revision atual', async () => {
  const calls = [];
  const revision = 'a'.repeat(40);
  const installedEnvironment = {
    DEV_DASHBOARD_API_PORT: '4343',
    DEV_DASHBOARD_LOCAL_ORIGIN: 'http://dev-dashboard.localhost:4343',
  };
  const code = await orchestrate({
    rootDirectory: '/repo',
    installed: true,
    environment: {
      DEV_DASHBOARD_API_PORT: '9999',
      DEV_DASHBOARD_LOCAL_ORIGIN: 'http://127.0.0.1:9999',
    },
    resolveInstalledEnvironment: async () => installedEnvironment,
    diagnoseEnvironment: async () => [],
    resolveRuntimeRevision: async () => revision,
    createBootstrapToken: () => 'e'.repeat(64),
    fileChecker: async () => undefined,
    buildScanner: async () => undefined,
    runner: async (command, args, options) => {
      calls.push({ command, args, options });
      return { code: 7 };
    },
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].args[0], /apps\/api\/dist\/server\.js$/);
  assert.equal(calls[0].options.env.DEV_DASHBOARD_RUNTIME_REVISION, revision);
  assert.equal(calls[0].options.env.DEV_DASHBOARD_API_PORT, '4343');
  assert.equal(
    calls[0].options.env.DEV_DASHBOARD_LOCAL_ORIGIN,
    'http://dev-dashboard.localhost:4343',
  );
  assert.equal(code, 7);
});

test('metadata instalada é autoridade para porta e origem mesmo com ambiente divergente', async () => {
  const environment = await resolveInstalledEnvironment({
    rootDirectory: '/repo',
    environment: {
      DEV_DASHBOARD_API_PORT: '9999',
      DEV_DASHBOARD_LOCAL_ORIGIN: 'http://127.0.0.1:9999',
      VERCEL_TOKEN: 'token-preservado',
    },
    resolveRealpath: async (value) => value,
    readInstallMetadata: async () => ({
      version: 1,
      runtimeManager: 'systemd-user',
      unit: LOCAL_SERVICE_NAME,
      repositoryRoot: '/repo',
      nodePath: '/opt/node/bin/node',
      port: 4343,
      origin: 'http://dev-dashboard.localhost:4343',
    }),
    checkManagedUnit: async () => true,
  });

  assert.equal(environment.DEV_DASHBOARD_API_PORT, '4343');
  assert.equal(
    environment.DEV_DASHBOARD_LOCAL_ORIGIN,
    'http://dev-dashboard.localhost:4343',
  );
  assert.equal(environment.VERCEL_TOKEN, 'token-preservado');
});

test('self-update builda antes de delegar restart para instalação local gerenciada', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-web-self-update-'));
  const home = path.join(root, 'home');
  const repositoryRoot = path.join(root, 'repo');
  await mkdir(repositoryRoot, { recursive: true });
  await mkdir(home, { recursive: true });
  t.after(async () => rm(root, { recursive: true, force: true }));

  const environment = {
    XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_STATE_HOME: path.join(home, '.state'),
    DEV_DASHBOARD_RUNTIME_REVISION: REVISION,
    DEV_DASHBOARD_SELF_UPDATE_REPOSITORY_ROOT: repositoryRoot,
  };
  const paths = resolveLocalInstallPaths(environment, home);
  await mkdir(paths.configDirectory, { recursive: true });
  await mkdir(paths.unitDirectory, { recursive: true });
  await writeFile(
    paths.metadataPath,
    `${JSON.stringify({
      version: 1,
      runtimeManager: 'systemd-user',
      unit: LOCAL_SERVICE_NAME,
      repositoryRoot,
      nodePath: '/opt/node/bin/node',
      port: 4343,
      origin: 'http://dev-dashboard.localhost:4343',
    })}\n`,
  );
  await writeFile(
    paths.unitPath,
    `${MANAGED_UNIT_MARKER}\n[Service]\nExecStart=/bin/true\n`,
  );

  const calls = [];
  const result = await delegateManagedSelfUpdate({
    rootDirectory: repositoryRoot,
    homeDirectory: home,
    environment,
    resolveRealpath: async (value) => value,
    runServiceCommand: async (command, args, options) => {
      calls.push({ command, args, options });
      return { code: 0, stdout: '', stderr: '' };
    },
  });

  assert.deepEqual(result, { code: 0, manager: 'systemd-user' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].command, 'npm');
  assert.deepEqual(calls[0].args, ['run', 'build']);
  assert.equal(calls[1].command, 'systemctl');
  assert.deepEqual(calls[1].args, ['--user', 'restart', LOCAL_SERVICE_NAME]);
});

test('bootstrap legado aceita apenas revision atual com handoff recente em restart', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-web-legacy-proof-'));
  const stateDirectory = path.join(root, 'state', 'self-update');
  t.after(async () => rm(root, { recursive: true, force: true }));

  const store = await createRuntimeHandoff(stateDirectory);
  const proof = await proveLegacyManagedSelfUpdate({
    rootDirectory: root,
    targetRevision: REVISION,
    stateDirectory,
    resolveRuntimeRevision: async () => REVISION,
    handoffStore: store,
  });

  assert.equal(proof, true);

  assert.equal(
    await proveLegacyManagedSelfUpdate({
      rootDirectory: root,
      targetRevision: REVISION,
      stateDirectory,
      resolveRuntimeRevision: async () => 'c'.repeat(40),
      handoffStore: store,
    }),
    false,
  );

  assert.equal(
    await proveLegacyManagedSelfUpdate({
      rootDirectory: root,
      targetRevision: REVISION,
      stateDirectory,
      resolveRuntimeRevision: async () => REVISION,
      handoffStore: store,
      now: Date.now() + 6 * 60 * 1000,
    }),
    false,
  );
});

test('self-update legado sem raiz delega somente quando handoff persistido comprova o bootstrap', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-web-legacy-delegate-'));
  const home = path.join(root, 'home');
  const repositoryRoot = path.join(root, 'repo');
  await mkdir(repositoryRoot, { recursive: true });
  await mkdir(home, { recursive: true });
  t.after(async () => rm(root, { recursive: true, force: true }));

  const environment = {
    XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_STATE_HOME: path.join(home, '.state'),
    DEV_DASHBOARD_RUNTIME_REVISION: REVISION,
  };
  const paths = resolveLocalInstallPaths(environment, home);
  await mkdir(paths.configDirectory, { recursive: true });
  await mkdir(paths.unitDirectory, { recursive: true });
  await writeFile(
    paths.metadataPath,
    `${JSON.stringify({
      version: 1,
      runtimeManager: 'systemd-user',
      unit: LOCAL_SERVICE_NAME,
      repositoryRoot,
      nodePath: '/opt/node/bin/node',
      port: 4343,
      origin: 'http://dev-dashboard.localhost:4343',
    })}\n`,
  );
  await writeFile(
    paths.unitPath,
    `${MANAGED_UNIT_MARKER}\n[Service]\nExecStart=/bin/true\n`,
  );
  await createRuntimeHandoff(path.join(paths.stateDirectory, 'self-update'));

  const calls = [];
  const result = await delegateManagedSelfUpdate({
    rootDirectory: repositoryRoot,
    homeDirectory: home,
    environment,
    resolveRealpath: async (value) => value,
    resolveRuntimeRevision: async () => REVISION,
    runServiceCommand: async (command, args, options) => {
      calls.push({ command, args, options });
      return { code: 0, stdout: '', stderr: '' };
    },
  });

  assert.deepEqual(result, { code: 0, manager: 'systemd-user' });
  assert.deepEqual(
    calls.map(({ command, args }) => ({ command, args })),
    [
      { command: 'npm', args: ['run', 'build'] },
      {
        command: 'systemctl',
        args: ['--user', 'restart', LOCAL_SERVICE_NAME],
      },
    ],
  );
});

test('raiz explícita divergente nunca cai no fallback legado', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-web-root-mismatch-'));
  const home = path.join(root, 'home');
  const repositoryRoot = path.join(root, 'repo');
  await mkdir(repositoryRoot, { recursive: true });
  await mkdir(home, { recursive: true });
  t.after(async () => rm(root, { recursive: true, force: true }));

  let legacyProofCalls = 0;
  const result = await delegateManagedSelfUpdate({
    rootDirectory: repositoryRoot,
    homeDirectory: home,
    environment: {
      DEV_DASHBOARD_RUNTIME_REVISION: REVISION,
      DEV_DASHBOARD_SELF_UPDATE_REPOSITORY_ROOT: path.join(root, 'other'),
    },
    resolveRealpath: async (value) => value,
    proveLegacySelfUpdate: async () => {
      legacyProofCalls += 1;
      return true;
    },
  });

  assert.equal(result, null);
  assert.equal(legacyProofCalls, 0);
});

test('verificação do bundle detecta o valor real sem confundir apenas o nome do header', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bundle-check-'));
  await mkdir(path.join(root, 'assets'));
  const token = 'c'.repeat(64);
  await writeFile(
    path.join(root, 'assets/app.js'),
    'const header = "X-Dev-Dashboard-Token";',
  );
  await assertBuildHasNoCredentials(root, { forbiddenValues: [token] });
  await writeFile(
    path.join(root, 'assets/app.js'),
    `const segredo = "${token}";`,
  );
  await assert.rejects(
    assertBuildHasNoCredentials(root, { forbiddenValues: [token] }),
    /Credencial/,
  );
  await rm(root, { recursive: true });
});
