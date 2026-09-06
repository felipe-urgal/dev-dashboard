import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertBuildHasNoCredentials,
  delegateManagedSelfUpdate,
  orchestrate,
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

test('orquestrador constrói e inicia somente a API distribuída', async () => {
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

test('modo instalado deriva e publica a revision atual no runtime', async () => {
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
      return { code: calls.length === 2 ? 7 : 0 };
    },
  });

  assert.equal(calls[1].options.env.DEV_DASHBOARD_RUNTIME_REVISION, revision);
  assert.equal(calls[1].options.env.DEV_DASHBOARD_API_PORT, '4343');
  assert.equal(
    calls[1].options.env.DEV_DASHBOARD_LOCAL_ORIGIN,
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

test('self-update delega restart somente para instalação local gerenciada', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-web-self-update-'));
  const home = path.join(root, 'home');
  const repositoryRoot = path.join(root, 'repo');
  await mkdir(repositoryRoot, { recursive: true });
  await mkdir(home, { recursive: true });
  t.after(async () => rm(root, { recursive: true, force: true }));

  const environment = {
    XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_STATE_HOME: path.join(home, '.state'),
    DEV_DASHBOARD_RUNTIME_REVISION: 'a'.repeat(40),
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
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'systemctl');
  assert.deepEqual(calls[0].args, ['--user', 'start', LOCAL_SERVICE_NAME]);
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
