import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  LOCAL_SERVICE_NAME,
  MANAGED_UNIT_MARKER,
  buildLocalOrigin,
  buildSystemdUnit,
  installLocal,
  localStatus,
  openLocal,
  resolveLocalInstallPaths,
  systemdQuote,
  uninstallLocal,
} from './local-install.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-local-install-'));
  const repositoryRoot = path.join(root, 'repo');
  const home = path.join(root, 'home');
  await mkdir(repositoryRoot, { recursive: true });
  await mkdir(home, { recursive: true });
  t.after(async () => rm(root, { recursive: true, force: true }));
  const environment = {
    PATH: '/usr/bin:/bin',
    XDG_CONFIG_HOME: path.join(home, '.config-custom'),
    XDG_STATE_HOME: path.join(home, '.state-custom'),
  };
  return { root, repositoryRoot, home, environment };
}

function successfulRunner(calls) {
  return async (command, args, options) => {
    calls.push({ command, args, options });
    return { code: 0, stdout: 'ok\n', stderr: '' };
  };
}

test('escapa valores da unit sem permitir quebra de diretiva', () => {
  assert.equal(systemdQuote('/tmp/a b'), '"/tmp/a b"');
  assert.equal(systemdQuote('/tmp/100%'), '"/tmp/100%%"');
  assert.throws(() => systemdQuote('a\nb'), /systemd/);
});

test('unit usa Node absoluto, loopback nominal e reinício somente em falha', () => {
  const unit = buildSystemdUnit({
    repositoryRoot: '/home/test/.dev-dashboard',
    nodePath: '/home/test/.nvm/node/bin/node',
    port: 4343,
    origin: buildLocalOrigin(4343),
    configDirectory: '/home/test/.config/dev-dashboard',
    stateDirectory: '/home/test/.local/state/dev-dashboard',
    runtimePath: '/home/test/.nvm/node/bin:/usr/bin:/bin',
  });

  assert.ok(unit.startsWith(`${MANAGED_UNIT_MARKER}\n`));
  assert.match(unit, /ExecStart="\/home\/test\/\.nvm\/node\/bin\/node"/);
  assert.match(unit, /scripts\/dev-web\.mjs" --installed/);
  assert.match(unit, /DEV_DASHBOARD_LOCAL_ORIGIN=http:\/\/dev-dashboard\.localhost:4343/);
  assert.match(unit, /EnvironmentFile=-"\/home\/test\/\.dev-dashboard\/\.env\.local"/);
  assert.match(unit, /Restart=on-failure/);
  assert.match(unit, /WantedBy=default\.target/);
  assert.doesNotMatch(unit, /sudo|0\.0\.0\.0/);
});

test('install é idempotente, grava apenas metadados não sensíveis e habilita a unit', async (t) => {
  const { repositoryRoot, home, environment } = await fixture(t);
  const calls = [];
  const run = successfulRunner(calls);
  const options = {
    platform: 'linux',
    rootDirectory: repositoryRoot,
    homeDirectory: home,
    environment,
    nodePath: '/opt/node/bin/node',
    resolveRealpath: async (value) => value,
    runCommand: run,
  };

  const first = await installLocal(options);
  const second = await installLocal(options);

  assert.equal(first.origin, 'http://dev-dashboard.localhost:4343');
  assert.equal(second.unit, LOCAL_SERVICE_NAME);
  const paths = resolveLocalInstallPaths(environment, home);
  const unit = await readFile(paths.unitPath, 'utf8');
  const metadata = await readFile(paths.metadataPath, 'utf8');
  assert.ok(unit.startsWith(`${MANAGED_UNIT_MARKER}\n`));
  assert.doesNotMatch(unit, /TOKEN|SECRET|VERCEL_TOKEN=/);
  assert.doesNotMatch(metadata, /TOKEN|SECRET|VERCEL/);
  assert.equal(calls.filter((entry) => entry.args.join(' ') === 'run build').length, 2);
  assert.equal(
    calls.filter(
      (entry) => entry.args.join(' ') === `--user enable --now ${LOCAL_SERVICE_NAME}`,
    ).length,
    2,
  );
});

test('install recusa sobrescrever unit não gerenciada', async (t) => {
  const { repositoryRoot, home, environment } = await fixture(t);
  const paths = resolveLocalInstallPaths(environment, home);
  await mkdir(paths.unitDirectory, { recursive: true });
  await writeFile(paths.unitPath, '[Service]\nExecStart=/bin/false\n');
  let calls = 0;

  await assert.rejects(
    installLocal({
      platform: 'linux',
      rootDirectory: repositoryRoot,
      homeDirectory: home,
      environment,
      nodePath: '/opt/node/bin/node',
      resolveRealpath: async (value) => value,
      runCommand: async () => {
        calls += 1;
        return { code: 0, stdout: '', stderr: '' };
      },
    }),
    /não pertence/,
  );
  assert.equal(calls, 0);
});

test('status combina unit, systemd e health reais da instalação', async (t) => {
  const { repositoryRoot, home, environment } = await fixture(t);
  await installLocal({
    platform: 'linux',
    rootDirectory: repositoryRoot,
    homeDirectory: home,
    environment,
    nodePath: '/opt/node/bin/node',
    resolveRealpath: async (value) => value,
    runCommand: successfulRunner([]),
  });

  const status = await localStatus({
    homeDirectory: home,
    environment,
    runCommand: async (_command, args) => ({
      code: 0,
      stdout: args.includes('is-active') ? 'active\n' : 'enabled\n',
      stderr: '',
    }),
    fetchImpl: async (url) => {
      assert.equal(url, 'http://127.0.0.1:4343/api/health');
      return {
        ok: true,
        async json() {
          return { status: 'ok', service: 'dev-dashboard-api' };
        },
      };
    },
  });

  assert.deepEqual(
    {
      installed: status.installed,
      enabled: status.enabled,
      active: status.active,
      healthy: status.healthy,
      origin: status.origin,
    },
    {
      installed: true,
      enabled: true,
      active: true,
      healthy: true,
      origin: 'http://dev-dashboard.localhost:4343',
    },
  );
});

test('open usa xdg-open sem shell e uninstall preserva checkout/config funcional', async (t) => {
  const { repositoryRoot, home, environment } = await fixture(t);
  await installLocal({
    platform: 'linux',
    rootDirectory: repositoryRoot,
    homeDirectory: home,
    environment,
    nodePath: '/opt/node/bin/node',
    resolveRealpath: async (value) => value,
    runCommand: successfulRunner([]),
  });
  const paths = resolveLocalInstallPaths(environment, home);
  const preserved = path.join(paths.configDirectory, 'api-token');
  await writeFile(preserved, 'segredo-local');

  const openCalls = [];
  const opened = await openLocal({
    homeDirectory: home,
    environment,
    runCommand: successfulRunner(openCalls),
  });
  assert.equal(opened.opened, true);
  assert.deepEqual(openCalls[0].args, ['http://dev-dashboard.localhost:4343']);

  const uninstallCalls = [];
  await uninstallLocal({
    rootDirectory: repositoryRoot,
    homeDirectory: home,
    environment,
    runCommand: successfulRunner(uninstallCalls),
  });
  await assert.rejects(readFile(paths.unitPath, 'utf8'), /ENOENT/);
  await assert.rejects(readFile(paths.metadataPath, 'utf8'), /ENOENT/);
  assert.equal(await readFile(preserved, 'utf8'), 'segredo-local');
  assert.ok(
    uninstallCalls.some(
      (entry) =>
        entry.args.join(' ') === `--user disable --now ${LOCAL_SERVICE_NAME}`,
    ),
  );
});
