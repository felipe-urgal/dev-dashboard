import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  LOCAL_DESKTOP_WM_CLASS,
  LOCAL_SERVICE_NAME,
  MANAGED_DESKTOP_MARKER,
  MANAGED_ICON_MARKER,
  MANAGED_UNIT_MARKER,
  buildDesktopEntry,
  buildLocalOrigin,
  buildRuntimeEnvironment,
  buildSystemdUnit,
  desktopExecQuote,
  installLocal,
  localStatus,
  openAppLocal,
  openLocal,
  resolveChromiumBrowserCommand,
  resolveLocalInstallPaths,
  systemdQuote,
  uninstallLocal,
} from './local-install.mjs';

async function fixture(t) {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-local-install-'),
  );
  const repositoryRoot = path.join(root, 'repo');
  const home = path.join(root, 'home');
  await mkdir(repositoryRoot, { recursive: true });
  await mkdir(home, { recursive: true });

  const iconSource = path.join(
    repositoryRoot,
    'apps',
    'web',
    'public',
    'dev-dashboard.svg',
  );
  await mkdir(path.dirname(iconSource), { recursive: true });
  await writeFile(iconSource, MANAGED_ICON_MARKER + '\n<svg></svg>\n');

  t.after(async () => rm(root, { recursive: true, force: true }));
  const environment = {
    PATH: '/usr/bin:/bin',
    XDG_CONFIG_HOME: path.join(home, '.config-custom'),
    XDG_STATE_HOME: path.join(home, '.state-custom'),
    XDG_DATA_HOME: path.join(home, '.data-custom'),
  };
  return { root, repositoryRoot, home, environment };
}

function successfulRunner(calls) {
  return async (command, args, options) => {
    calls.push({ command, args, options });
    return { code: 0, stdout: 'ok\n', stderr: '' };
  };
}

function healthyResponse() {
  return {
    ok: true,
    async json() {
      return { status: 'ok', service: 'dev-dashboard-api' };
    },
  };
}

function healthyFetch() {
  return async () => healthyResponse();
}

test('escapa valores da unit sem permitir quebra de diretiva', () => {
  assert.equal(systemdQuote('/tmp/a b'), '"/tmp/a b"');
  assert.equal(systemdQuote('/tmp/100%'), '"/tmp/100%%"');
  assert.throws(() => systemdQuote('a\nb'), /systemd/);
});

test('desktop entry usa launcher gerenciado sem shell', () => {
  assert.equal(desktopExecQuote('/tmp/a b%'), '"/tmp/a b%%"');
  assert.throws(() => desktopExecQuote('a\nb'), /desktop entry/);

  const desktopEntry = buildDesktopEntry({
    repositoryRoot: '/home/test/dev dashboard',
    nodePath: '/opt/node/bin/node',
  });

  assert.ok(desktopEntry.startsWith(MANAGED_DESKTOP_MARKER + '\n'));
  assert.match(
    desktopEntry,
    /Exec="\/opt\/node\/bin\/node" "\/home\/test\/dev dashboard\/scripts\/local-install\.mjs" open-app/,
  );
  assert.match(desktopEntry, /^Icon=dev-dashboard$/m);
  assert.match(desktopEntry, /^Terminal=false$/m);
  assert.match(
    desktopEntry,
    new RegExp('^StartupWMClass=' + LOCAL_DESKTOP_WM_CLASS + '$', 'm'),
  );
  assert.doesNotMatch(desktopEntry, /sudo|sh -c|bash -c/);
});

test('resolve browser Chromium apenas para desktop ids conhecidos', () => {
  assert.equal(resolveChromiumBrowserCommand('chromium.desktop\n'), 'chromium');
  assert.equal(
    resolveChromiumBrowserCommand('google-chrome.desktop'),
    'google-chrome',
  );
  assert.equal(resolveChromiumBrowserCommand('firefox.desktop'), null);
});

test('unit carrega ambiente local antes do ambiente gerenciado', () => {
  const unit = buildSystemdUnit({
    repositoryRoot: '/home/test/.dev-dashboard',
    nodePath: '/home/test/.nvm/node/bin/node',
    port: 4343,
    origin: buildLocalOrigin(4343),
    configDirectory: '/home/test/.config/dev-dashboard',
    stateDirectory: '/home/test/.local/state/dev-dashboard',
    runtimePath: '/home/test/.nvm/node/bin:/usr/bin:/bin',
  });

  assert.ok(unit.startsWith(MANAGED_UNIT_MARKER + '\n'));
  assert.match(unit, /ExecStart="\/home\/test\/\.nvm\/node\/bin\/node"/);
  assert.match(unit, /scripts\/dev-web\.mjs" --installed/);
  const localEnvironmentIndex = unit.indexOf(
    'EnvironmentFile=-/home/test/.dev-dashboard/.env.local',
  );
  const managedEnvironmentIndex = unit.indexOf(
    'EnvironmentFile=/home/test/.config/dev-dashboard/local-runtime.env',
  );
  assert.ok(localEnvironmentIndex >= 0);
  assert.ok(managedEnvironmentIndex > localEnvironmentIndex);
  assert.match(unit, /Restart=on-failure/);
  assert.match(unit, /WantedBy=default\.target/);
  assert.doesNotMatch(unit, /sudo|0\.0\.0\.0/);
});

test('ambiente gerenciado fixa paths, porta e origem sem persistir secrets', () => {
  const runtimeEnvironment = buildRuntimeEnvironment({
    port: 4343,
    origin: 'http://dev-dashboard.localhost:4343',
    configDirectory: '/home/test/.config/dev-dashboard',
    stateDirectory: '/home/test/.local/state/dev-dashboard',
    runtimePath: '/opt/node/bin:/usr/bin:/bin',
  });

  assert.match(
    runtimeEnvironment,
    /^PATH="\/opt\/node\/bin:\/usr\/bin:\/bin"/m,
  );
  assert.match(runtimeEnvironment, /^DEV_DASHBOARD_API_PORT=4343$/m);
  assert.match(
    runtimeEnvironment,
    /^DEV_DASHBOARD_LOCAL_ORIGIN="http:\/\/dev-dashboard\.localhost:4343"$/m,
  );
  assert.match(
    runtimeEnvironment,
    /^DEV_DASHBOARD_CONFIG_DIR="\/home\/test\/\.config\/dev-dashboard"$/m,
  );
  assert.match(
    runtimeEnvironment,
    /^DEV_DASHBOARD_STATE_DIR="\/home\/test\/\.local\/state\/dev-dashboard"$/m,
  );
  assert.match(runtimeEnvironment, /^DEV_DASHBOARD_RUNTIME_REVISION=$/m);
  assert.doesNotMatch(runtimeEnvironment, /TOKEN|SECRET|VERCEL/);
});

test('install é idempotente e grava integração desktop gerenciada', async (t) => {
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
    fetchImpl: healthyFetch(),
    sleepImpl: async () => undefined,
    readinessAttempts: 1,
    readinessIntervalMs: 0,
  };

  const first = await installLocal(options);
  const second = await installLocal(options);

  assert.equal(first.origin, 'http://dev-dashboard.localhost:4343');
  assert.equal(second.unit, LOCAL_SERVICE_NAME);

  const paths = resolveLocalInstallPaths(environment, home);
  const unit = await readFile(paths.unitPath, 'utf8');
  const runtimeEnvironment = await readFile(
    paths.runtimeEnvironmentPath,
    'utf8',
  );
  const metadata = await readFile(paths.metadataPath, 'utf8');
  const desktopEntry = await readFile(paths.desktopEntryPath, 'utf8');
  const desktopIcon = await readFile(paths.desktopIconPath, 'utf8');

  assert.ok(unit.startsWith(MANAGED_UNIT_MARKER + '\n'));
  assert.match(unit, /local-runtime\.env/);
  assert.match(runtimeEnvironment, /DEV_DASHBOARD_API_PORT=4343/);
  assert.match(
    runtimeEnvironment,
    /DEV_DASHBOARD_LOCAL_ORIGIN="http:\/\/dev-dashboard\.localhost:4343"/,
  );
  assert.doesNotMatch(unit, /TOKEN|SECRET|VERCEL_TOKEN=/);
  assert.doesNotMatch(runtimeEnvironment, /TOKEN|SECRET|VERCEL/);
  assert.doesNotMatch(metadata, /TOKEN|SECRET|VERCEL/);

  assert.ok(desktopEntry.startsWith(MANAGED_DESKTOP_MARKER + '\n'));
  assert.match(desktopEntry, /open-app/);
  assert.ok(desktopIcon.startsWith(MANAGED_ICON_MARKER + '\n'));
  assert.equal((await stat(paths.desktopEntryPath)).mode & 0o777, 0o644);
  assert.equal((await stat(paths.desktopIconPath)).mode & 0o777, 0o644);

  assert.equal(
    calls.filter((entry) => entry.args.join(' ') === 'run build').length,
    2,
  );
  assert.equal(
    calls.filter(
      (entry) => entry.args.join(' ') === '--user enable ' + LOCAL_SERVICE_NAME,
    ).length,
    2,
  );
  assert.equal(
    calls.filter(
      (entry) =>
        entry.args.join(' ') === '--user restart ' + LOCAL_SERVICE_NAME,
    ).length,
    2,
  );
  assert.equal(
    calls.some((entry) => entry.args.includes('--now')),
    false,
  );
});

test('install aguarda readiness transitória depois do restart', async (t) => {
  const { repositoryRoot, home, environment } = await fixture(t);
  const calls = [];
  let healthChecks = 0;
  let sleeps = 0;

  await installLocal({
    platform: 'linux',
    rootDirectory: repositoryRoot,
    homeDirectory: home,
    environment,
    nodePath: '/opt/node/bin/node',
    resolveRealpath: async (value) => value,
    runCommand: successfulRunner(calls),
    fetchImpl: async () => {
      healthChecks += 1;
      return healthChecks < 3 ? { ok: false } : healthyResponse();
    },
    sleepImpl: async () => {
      sleeps += 1;
    },
    readinessAttempts: 3,
    readinessIntervalMs: 0,
  });

  assert.equal(healthChecks, 3);
  assert.equal(sleeps, 2);
  const restartIndex = calls.findIndex(
    (entry) => entry.args.join(' ') === '--user restart ' + LOCAL_SERVICE_NAME,
  );
  assert.ok(restartIndex >= 0);
});

test('install falha com diagnóstico quando API não fica saudável', async (t) => {
  const { repositoryRoot, home, environment } = await fixture(t);
  const calls = [];
  let healthChecks = 0;

  await assert.rejects(
    installLocal({
      platform: 'linux',
      rootDirectory: repositoryRoot,
      homeDirectory: home,
      environment,
      nodePath: '/opt/node/bin/node',
      resolveRealpath: async (value) => value,
      runCommand: successfulRunner(calls),
      fetchImpl: async () => {
        healthChecks += 1;
        return { ok: false };
      },
      sleepImpl: async () => undefined,
      readinessAttempts: 2,
      readinessIntervalMs: 0,
    }),
    /API não ficou saudável.*local:status.*journalctl/,
  );

  assert.equal(healthChecks, 2);
  assert.ok(
    calls.some(
      (entry) =>
        entry.args.join(' ') === '--user restart ' + LOCAL_SERVICE_NAME,
    ),
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

test('install recusa sobrescrever launcher não gerenciado', async (t) => {
  const { repositoryRoot, home, environment } = await fixture(t);
  const paths = resolveLocalInstallPaths(environment, home);
  await mkdir(paths.applicationsDirectory, { recursive: true });
  await writeFile(paths.desktopEntryPath, '[Desktop Entry]\nName=Outro App\n');
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

test('status combina serviço, desktop e health reais da instalação', async (t) => {
  const { repositoryRoot, home, environment } = await fixture(t);
  await installLocal({
    platform: 'linux',
    rootDirectory: repositoryRoot,
    homeDirectory: home,
    environment,
    nodePath: '/opt/node/bin/node',
    resolveRealpath: async (value) => value,
    runCommand: successfulRunner([]),
    fetchImpl: healthyFetch(),
    readinessAttempts: 1,
    readinessIntervalMs: 0,
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
      return healthyResponse();
    },
  });

  assert.deepEqual(
    {
      installed: status.installed,
      desktopInstalled: status.desktopInstalled,
      enabled: status.enabled,
      active: status.active,
      healthy: status.healthy,
      origin: status.origin,
    },
    {
      installed: true,
      desktopInstalled: true,
      enabled: true,
      active: true,
      healthy: true,
      origin: 'http://dev-dashboard.localhost:4343',
    },
  );
});

test('status considera incompleta instalação sem ambiente gerenciado', async (t) => {
  const { repositoryRoot, home, environment } = await fixture(t);
  await installLocal({
    platform: 'linux',
    rootDirectory: repositoryRoot,
    homeDirectory: home,
    environment,
    nodePath: '/opt/node/bin/node',
    resolveRealpath: async (value) => value,
    runCommand: successfulRunner([]),
    fetchImpl: healthyFetch(),
    readinessAttempts: 1,
    readinessIntervalMs: 0,
  });
  const paths = resolveLocalInstallPaths(environment, home);
  await rm(paths.runtimeEnvironmentPath);

  const status = await localStatus({
    homeDirectory: home,
    environment,
    runCommand: successfulRunner([]),
    fetchImpl: async () => healthyResponse(),
  });

  assert.equal(status.installed, false);
});

test('status considera incompleta instalação sem launcher desktop', async (t) => {
  const { repositoryRoot, home, environment } = await fixture(t);
  await installLocal({
    platform: 'linux',
    rootDirectory: repositoryRoot,
    homeDirectory: home,
    environment,
    nodePath: '/opt/node/bin/node',
    resolveRealpath: async (value) => value,
    runCommand: successfulRunner([]),
    fetchImpl: healthyFetch(),
    readinessAttempts: 1,
    readinessIntervalMs: 0,
  });
  const paths = resolveLocalInstallPaths(environment, home);
  await rm(paths.desktopEntryPath);

  const status = await localStatus({
    homeDirectory: home,
    environment,
    runCommand: successfulRunner([]),
    fetchImpl: async () => healthyResponse(),
  });

  assert.equal(status.installed, false);
  assert.equal(status.desktopInstalled, false);
});

test('open-app usa app-mode no Chromium padrão e fallback no navegador', async (t) => {
  const { repositoryRoot, home, environment } = await fixture(t);
  await installLocal({
    platform: 'linux',
    rootDirectory: repositoryRoot,
    homeDirectory: home,
    environment,
    nodePath: '/opt/node/bin/node',
    resolveRealpath: async (value) => value,
    runCommand: successfulRunner([]),
    fetchImpl: healthyFetch(),
    readinessAttempts: 1,
    readinessIntervalMs: 0,
  });

  const launched = [];
  const appRunCalls = [];
  const appResult = await openAppLocal({
    homeDirectory: home,
    environment,
    runCommand: async (command, args, options) => {
      appRunCalls.push({ command, args, options });
      if (command === 'xdg-settings') {
        return {
          code: 0,
          stdout: 'chromium.desktop\n',
          stderr: '',
        };
      }
      return { code: 0, stdout: '', stderr: '' };
    },
    launchDetached: async (command, args, options) => {
      launched.push({ command, args, options });
      return true;
    },
  });

  assert.equal(appResult.mode, 'app');
  assert.equal(appResult.browser, 'chromium');
  assert.deepEqual(launched[0].args, [
    '--class=' + LOCAL_DESKTOP_WM_CLASS,
    '--app=http://dev-dashboard.localhost:4343',
  ]);
  assert.equal(
    appRunCalls.some((entry) => entry.command === 'xdg-open'),
    false,
  );

  const fallbackCalls = [];
  const fallback = await openAppLocal({
    homeDirectory: home,
    environment,
    runCommand: async (command, args, options) => {
      fallbackCalls.push({ command, args, options });
      if (command === 'xdg-settings') {
        return { code: 0, stdout: 'firefox.desktop\n', stderr: '' };
      }
      return { code: 0, stdout: '', stderr: '' };
    },
    launchDetached: async () => {
      throw new Error('não deveria lançar Chromium');
    },
  });

  assert.equal(fallback.mode, 'browser');
  assert.ok(fallbackCalls.some((entry) => entry.command === 'xdg-open'));
});

test('open usa xdg-open e uninstall preserva checkout/config funcional', async (t) => {
  const { repositoryRoot, home, environment } = await fixture(t);
  await installLocal({
    platform: 'linux',
    rootDirectory: repositoryRoot,
    homeDirectory: home,
    environment,
    nodePath: '/opt/node/bin/node',
    resolveRealpath: async (value) => value,
    runCommand: successfulRunner([]),
    fetchImpl: healthyFetch(),
    readinessAttempts: 1,
    readinessIntervalMs: 0,
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
  await assert.rejects(
    readFile(paths.runtimeEnvironmentPath, 'utf8'),
    /ENOENT/,
  );
  await assert.rejects(readFile(paths.metadataPath, 'utf8'), /ENOENT/);
  await assert.rejects(readFile(paths.desktopEntryPath, 'utf8'), /ENOENT/);
  await assert.rejects(readFile(paths.desktopIconPath, 'utf8'), /ENOENT/);
  assert.equal(await readFile(preserved, 'utf8'), 'segredo-local');
  assert.ok(
    uninstallCalls.some(
      (entry) =>
        entry.args.join(' ') === '--user disable --now ' + LOCAL_SERVICE_NAME,
    ),
  );
});
