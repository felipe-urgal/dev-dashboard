#!/usr/bin/env node

import { spawn } from 'node:child_process';
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const LOCAL_INSTALL_VERSION = 1;
export const LOCAL_SERVICE_NAME = 'dev-dashboard.service';
export const LOCAL_INSTALL_FILE = 'local-install.json';
export const LOCAL_RUNTIME_ENV_FILE = 'local-runtime.env';
export const LOCAL_ORIGIN_HOSTNAME = 'dev-dashboard.localhost';
export const LOCAL_DESKTOP_FILE = 'dev-dashboard.desktop';
export const LOCAL_DESKTOP_ICON_FILE = 'dev-dashboard.svg';
export const LOCAL_DESKTOP_WM_CLASS = 'dev-dashboard';
export const MANAGED_UNIT_MARKER = '# Managed by dev-dashboard local:install';
export const MANAGED_DESKTOP_MARKER =
  '# Managed by dev-dashboard local:install';
export const MANAGED_ICON_MARKER =
  '<!-- Managed by dev-dashboard local:install -->';

export const ROOT_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const DEFAULT_API_PORT = 4343;
const DEFAULT_SYSTEM_PATH = '/usr/local/bin:/usr/bin:/bin';
const MAX_COMMAND_OUTPUT_BYTES = 128 * 1024;
const INSTALL_READINESS_ATTEMPTS = 60;
const INSTALL_READINESS_INTERVAL_MS = 500;

function isErrnoCode(error, code) {
  return error instanceof Error && 'code' in error && error.code === code;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function assertSafeSystemdValue(value, label) {
  if (typeof value !== 'string' || /[\0\r\n]/u.test(value)) {
    throw new Error(`${label} contém caracteres inválidos para systemd.`);
  }
}

export function systemdQuote(value) {
  assertSafeSystemdValue(value, 'Valor');
  return `"${value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('%', '%%')}"`;
}

export function systemdPathValue(value, label = 'Caminho') {
  assertSafeSystemdValue(value, label);
  let escaped = '';
  for (const byte of Buffer.from(value, 'utf8')) {
    const isAlphaNumeric =
      (byte >= 0x30 && byte <= 0x39) ||
      (byte >= 0x41 && byte <= 0x5a) ||
      (byte >= 0x61 && byte <= 0x7a);
    const isSafePunctuation =
      byte === 0x2f || byte === 0x2e || byte === 0x5f || byte === 0x2d;
    escaped +=
      isAlphaNumeric || isSafePunctuation
        ? String.fromCharCode(byte)
        : `\\x${byte.toString(16).padStart(2, '0')}`;
  }
  return escaped;
}

function assertSafeDesktopValue(value, label) {
  if (typeof value !== 'string' || /[\0\r\n]/u.test(value)) {
    throw new Error(label + ' contém caracteres inválidos para desktop entry.');
  }
}

export function desktopExecQuote(value) {
  assertSafeDesktopValue(value, 'Valor');
  return (
    '"' +
    value
      .replaceAll('\\', '\\\\')
      .replaceAll('"', '\\"')
      .replaceAll('`', '\\`')
      .replaceAll('$', '\\$')
      .replaceAll('%', '%%') +
    '"'
  );
}

function environmentFileQuote(value, label) {
  assertSafeSystemdValue(value, label);
  return (
    '"' +
    value
      .replaceAll('\\', '\\\\')
      .replaceAll('"', '\\"')
      .replaceAll('$', '\\$')
      .replaceAll('`', '\\`') +
    '"'
  );
}
export function buildRuntimeEnvironment({
  port,
  origin,
  configDirectory,
  stateDirectory,
  runtimePath,
}) {
  return [
    `PATH=${environmentFileQuote(runtimePath, 'PATH')}`,
    `DEV_DASHBOARD_API_PORT=${port}`,
    `DEV_DASHBOARD_LOCAL_ORIGIN=${environmentFileQuote(origin, 'Origem')}`,
    `DEV_DASHBOARD_CONFIG_DIR=${environmentFileQuote(
      configDirectory,
      'Configuração',
    )}`,
    `DEV_DASHBOARD_STATE_DIR=${environmentFileQuote(stateDirectory, 'Estado')}`,
    'DEV_DASHBOARD_RUNTIME_REVISION=',
    '',
  ].join('\n');
}

export function parseInstallPort(value) {
  const configured = value?.trim() || String(DEFAULT_API_PORT);
  if (!/^\d+$/u.test(configured)) {
    throw new Error(`DEV_DASHBOARD_API_PORT inválida: ${configured}`);
  }
  const port = Number(configured);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`DEV_DASHBOARD_API_PORT inválida: ${configured}`);
  }
  return port;
}

function resolveXdgDirectory(environment, home, key, fallbackSegments) {
  const configured = environment[key]?.trim();
  return configured
    ? path.resolve(configured)
    : path.join(home, ...fallbackSegments);
}

export function resolveLocalInstallPaths(
  environment = process.env,
  home = homedir(),
) {
  const xdgConfigHome = resolveXdgDirectory(
    environment,
    home,
    'XDG_CONFIG_HOME',
    ['.config'],
  );
  const xdgStateHome = resolveXdgDirectory(
    environment,
    home,
    'XDG_STATE_HOME',
    ['.local', 'state'],
  );
  const xdgDataHome = resolveXdgDirectory(
    environment,
    home,
    'XDG_DATA_HOME',
    ['.local', 'share'],
  );
  const configDirectory = environment.DEV_DASHBOARD_CONFIG_DIR?.trim()
    ? path.resolve(environment.DEV_DASHBOARD_CONFIG_DIR.trim())
    : path.join(xdgConfigHome, 'dev-dashboard');
  const stateDirectory = environment.DEV_DASHBOARD_STATE_DIR?.trim()
    ? path.resolve(environment.DEV_DASHBOARD_STATE_DIR.trim())
    : path.join(xdgStateHome, 'dev-dashboard');
  const unitDirectory = path.join(xdgConfigHome, 'systemd', 'user');
  const applicationsDirectory = path.join(xdgDataHome, 'applications');
  const desktopIconDirectory = path.join(
    xdgDataHome,
    'icons',
    'hicolor',
    'scalable',
    'apps',
  );

  return {
    configDirectory,
    stateDirectory,
    metadataPath: path.join(configDirectory, LOCAL_INSTALL_FILE),
    runtimeEnvironmentPath: path.join(configDirectory, LOCAL_RUNTIME_ENV_FILE),
    unitDirectory,
    unitPath: path.join(unitDirectory, LOCAL_SERVICE_NAME),
    applicationsDirectory,
    desktopEntryPath: path.join(applicationsDirectory, LOCAL_DESKTOP_FILE),
    desktopIconDirectory,
    desktopIconPath: path.join(desktopIconDirectory, LOCAL_DESKTOP_ICON_FILE),
  };
}

export function buildRuntimePath(nodePath, inheritedPath = process.env.PATH) {
  const entries = [
    path.dirname(nodePath),
    ...(inheritedPath || DEFAULT_SYSTEM_PATH).split(path.delimiter),
  ].filter(Boolean);
  return [...new Set(entries)].join(path.delimiter);
}

export function buildLocalOrigin(port) {
  return `http://${LOCAL_ORIGIN_HOSTNAME}:${port}`;
}

export function buildDesktopEntry({ repositoryRoot, nodePath }) {
  assertSafeDesktopValue(repositoryRoot, 'Checkout');
  assertSafeDesktopValue(nodePath, 'Node');
  const entrypoint = path.join(repositoryRoot, 'scripts', 'local-install.mjs');

  return `${MANAGED_DESKTOP_MARKER}
[Desktop Entry]
Version=1.0
Type=Application
Name=Dev Dashboard
Comment=Dashboard local para gerenciamento de projetos de desenvolvimento
Exec=${desktopExecQuote(nodePath)} ${desktopExecQuote(entrypoint)} open-app
Icon=dev-dashboard
Terminal=false
Categories=Development;Utility;
StartupNotify=true
StartupWMClass=${LOCAL_DESKTOP_WM_CLASS}
`;
}

export function buildSystemdUnit({
  repositoryRoot,
  nodePath,
  origin,
  configDirectory,
  stateDirectory,
  runtimePath,
}) {
  for (const [label, value] of [
    ['Checkout', repositoryRoot],
    ['Node', nodePath],
    ['Origem', origin],
    ['Configuração', configDirectory],
    ['Estado', stateDirectory],
    ['PATH', runtimePath],
  ]) {
    assertSafeSystemdValue(value, label);
  }

  const entrypoint = path.join(repositoryRoot, 'scripts', 'dev-web.mjs');
  const environmentFile = path.join(repositoryRoot, '.env.local');
  const runtimeEnvironmentFile = path.join(
    configDirectory,
    LOCAL_RUNTIME_ENV_FILE,
  );

  return `${MANAGED_UNIT_MARKER}
[Unit]
Description=Dev Dashboard local

[Service]
Type=simple
WorkingDirectory=${systemdPathValue(repositoryRoot, 'Checkout')}
EnvironmentFile=-${systemdPathValue(environmentFile, 'EnvironmentFile')}
EnvironmentFile=${systemdPathValue(runtimeEnvironmentFile, 'EnvironmentFile')}
ExecStart=${systemdQuote(nodePath)} ${systemdQuote(entrypoint)} --installed
Restart=on-failure
RestartSec=3
TimeoutStopSec=10

[Install]
WantedBy=default.target
`;
}

export function runCommand(command, args, options = {}) {
  const spawnProcess = options.spawnProcess ?? spawn;
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const append = (current, chunk) => {
      const next = current + String(chunk);
      if (Buffer.byteLength(next, 'utf8') > MAX_COMMAND_OUTPUT_BYTES) {
        if (!settled) {
          settled = true;
          child.kill('SIGTERM');
          reject(new Error(`Saída excessiva do comando ${command}.`));
        }
        return current;
      }
      return next;
    };

    child.stdout.on('data', (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = append(stderr, chunk);
    });
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      resolve({ code: code ?? (signal ? 1 : 0), stdout, stderr, signal });
    });
  });
}

function assertCommandSuccess(result, action) {
  if (result.code === 0) return;
  const detail = result.stderr.trim() || result.stdout.trim();
  throw new Error(detail ? `${action}: ${detail}` : action);
}

async function readTextIfExists(file) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (isErrnoCode(error, 'ENOENT')) return null;
    throw error;
  }
}

async function isManagedFile(file, marker) {
  const contents = await readTextIfExists(file);
  if (contents === null) return false;
  return contents.startsWith(marker + '\n');
}

async function assertManagedFileCanBeManaged(file, marker) {
  const contents = await readTextIfExists(file);
  if (contents === null || contents.startsWith(marker + '\n')) return;
  throw new Error(
    `${file} já existe e não pertence ao instalador do Dev Dashboard. Nenhum arquivo foi sobrescrito.`,
  );
}

export async function isManagedUnit(unitPath) {
  return isManagedFile(unitPath, MANAGED_UNIT_MARKER);
}

export async function isManagedDesktopEntry(desktopEntryPath) {
  return isManagedFile(desktopEntryPath, MANAGED_DESKTOP_MARKER);
}

export async function isManagedDesktopIcon(desktopIconPath) {
  return isManagedFile(desktopIconPath, MANAGED_ICON_MARKER);
}

async function assertUnitCanBeManaged(unitPath) {
  return assertManagedFileCanBeManaged(unitPath, MANAGED_UNIT_MARKER);
}

async function writePrivateFile(file, contents) {
  await writeFile(file, contents, { encoding: 'utf8', mode: 0o600 });
  await chmod(file, 0o600);
}

async function writePublicFile(file, contents) {
  await writeFile(file, contents, { encoding: 'utf8', mode: 0o644 });
  await chmod(file, 0o644);
}

export async function readLocalInstallMetadata(metadataPath) {
  let metadata;
  try {
    metadata = await lstat(metadataPath);
  } catch (error) {
    if (isErrnoCode(error, 'ENOENT')) return null;
    throw error;
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(
      'Metadados da instalação local não são um arquivo regular.',
    );
  }
  try {
    const parsed = JSON.parse(await readFile(metadataPath, 'utf8'));
    if (
      parsed?.version !== LOCAL_INSTALL_VERSION ||
      parsed?.runtimeManager !== 'systemd-user' ||
      parsed?.unit !== LOCAL_SERVICE_NAME ||
      typeof parsed.repositoryRoot !== 'string' ||
      typeof parsed.nodePath !== 'string' ||
      !Number.isInteger(parsed.port) ||
      typeof parsed.origin !== 'string'
    ) {
      throw new Error();
    }
    return parsed;
  } catch {
    throw new Error('Metadados da instalação local são inválidos.');
  }
}

async function checkHealth(port, fetchImpl) {
  try {
    const response = await fetchImpl(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(1_500),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return false;
    const payload = await response.json();
    return payload?.status === 'ok' && payload?.service === 'dev-dashboard-api';
  } catch {
    return false;
  }
}

export async function waitForHealth(port, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? sleep;
  const attempts = options.attempts ?? INSTALL_READINESS_ATTEMPTS;
  const intervalMs = options.intervalMs ?? INSTALL_READINESS_INTERVAL_MS;

  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error(
      'Tentativas de readiness inválidas para a instalação local.',
    );
  }
  if (!Number.isFinite(intervalMs) || intervalMs < 0) {
    throw new Error('Intervalo de readiness inválido para a instalação local.');
  }

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await checkHealth(port, fetchImpl)) return;
    if (attempt < attempts - 1) await sleepImpl(intervalMs);
  }

  throw new Error(
    `Dev Dashboard foi reiniciado, mas a API não ficou saudável. Execute npm run local:status e journalctl --user -u ${LOCAL_SERVICE_NAME} -n 80 --no-pager.`,
  );
}

export async function installLocal(options = {}) {
  const platform = options.platform ?? process.platform;
  if (platform !== 'linux') {
    throw new Error(
      'A instalação local automática está disponível somente no Linux.',
    );
  }

  const environment = options.environment ?? process.env;
  const run = options.runCommand ?? runCommand;
  const root = await (options.resolveRealpath ?? realpath)(
    options.rootDirectory ?? ROOT_DIRECTORY,
  );
  const nodePath = options.nodePath ?? process.execPath;
  if (!path.isAbsolute(nodePath)) {
    throw new Error('O executável do Node precisa ser um caminho absoluto.');
  }

  const port = parseInstallPort(environment.DEV_DASHBOARD_API_PORT);
  const origin = buildLocalOrigin(port);
  const paths = resolveLocalInstallPaths(
    environment,
    options.homeDirectory ?? homedir(),
  );
  const runtimePath = buildRuntimePath(nodePath, environment.PATH);

  await assertUnitCanBeManaged(paths.unitPath);
  await assertManagedFileCanBeManaged(
    paths.desktopEntryPath,
    MANAGED_DESKTOP_MARKER,
  );
  await assertManagedFileCanBeManaged(paths.desktopIconPath, MANAGED_ICON_MARKER);

  const desktopIconSource = path.join(
    root,
    'apps',
    'web',
    'public',
    LOCAL_DESKTOP_ICON_FILE,
  );
  const desktopIcon = await readFile(desktopIconSource, 'utf8');
  if (!desktopIcon.startsWith(MANAGED_ICON_MARKER + '\n')) {
    throw new Error('Ícone desktop gerenciado é inválido.');
  }

  const systemd = await run('systemctl', ['--user', 'show-environment'], {
    cwd: root,
    env: environment,
  });
  assertCommandSuccess(
    systemd,
    'Não foi possível acessar o systemd da sessão do usuário',
  );

  const build = await run('npm', ['run', 'build'], {
    cwd: root,
    env: environment,
  });
  assertCommandSuccess(build, 'Build da instalação local falhou');

  await mkdir(paths.unitDirectory, { recursive: true, mode: 0o700 });
  await mkdir(paths.configDirectory, { recursive: true, mode: 0o700 });

  const runtimeEnvironment = buildRuntimeEnvironment({
    port,
    origin,
    configDirectory: paths.configDirectory,
    stateDirectory: paths.stateDirectory,
    runtimePath,
  });
  await writePrivateFile(paths.runtimeEnvironmentPath, runtimeEnvironment);

  const unit = buildSystemdUnit({
    repositoryRoot: root,
    nodePath,
    port,
    origin,
    configDirectory: paths.configDirectory,
    stateDirectory: paths.stateDirectory,
    runtimePath,
  });
  await writePrivateFile(paths.unitPath, unit);

  const localInstall = {
    version: LOCAL_INSTALL_VERSION,
    runtimeManager: 'systemd-user',
    unit: LOCAL_SERVICE_NAME,
    repositoryRoot: root,
    nodePath,
    port,
    origin,
  };
  await writePrivateFile(
    paths.metadataPath,
    `${JSON.stringify(localInstall, null, 2)}\n`,
  );

  const reload = await run('systemctl', ['--user', 'daemon-reload'], {
    cwd: root,
    env: environment,
  });
  assertCommandSuccess(reload, 'Falha ao recarregar o systemd do usuário');

  const enable = await run(
    'systemctl',
    ['--user', 'enable', LOCAL_SERVICE_NAME],
    { cwd: root, env: environment },
  );
  assertCommandSuccess(enable, 'Falha ao habilitar o Dev Dashboard no login');

  const restart = await run(
    'systemctl',
    ['--user', 'restart', LOCAL_SERVICE_NAME],
    { cwd: root, env: environment },
  );
  assertCommandSuccess(restart, 'Falha ao reiniciar o Dev Dashboard local');

  await waitForHealth(port, {
    fetchImpl: options.fetchImpl ?? fetch,
    sleepImpl: options.sleepImpl ?? sleep,
    attempts: options.readinessAttempts ?? INSTALL_READINESS_ATTEMPTS,
    intervalMs: options.readinessIntervalMs ?? INSTALL_READINESS_INTERVAL_MS,
  });

  await mkdir(paths.applicationsDirectory, { recursive: true, mode: 0o755 });
  await mkdir(paths.desktopIconDirectory, { recursive: true, mode: 0o755 });
  await writePublicFile(
    paths.desktopEntryPath,
    buildDesktopEntry({ repositoryRoot: root, nodePath }),
  );
  await writePublicFile(paths.desktopIconPath, desktopIcon);

  return {
    ...localInstall,
    unitPath: paths.unitPath,
    desktopEntryPath: paths.desktopEntryPath,
    desktopIconPath: paths.desktopIconPath,
  };
}

async function systemdState(run, args, options) {
  try {
    const result = await run('systemctl', ['--user', ...args], options);
    return {
      ok: result.code === 0,
      value:
        (result.stdout.trim() || result.stderr.trim()).split('\n')[0] || '',
    };
  } catch (error) {
    return {
      ok: false,
      value: error instanceof Error ? error.message : 'indisponível',
    };
  }
}

export async function localStatus(options = {}) {
  const environment = options.environment ?? process.env;
  const run = options.runCommand ?? runCommand;
  const paths = resolveLocalInstallPaths(
    environment,
    options.homeDirectory ?? homedir(),
  );
  const metadata = await readLocalInstallMetadata(paths.metadataPath);
  const managedUnit = await isManagedUnit(paths.unitPath);
  const managedDesktopEntry = await isManagedDesktopEntry(
    paths.desktopEntryPath,
  );
  const managedDesktopIcon = await isManagedDesktopIcon(paths.desktopIconPath);
  const desktopInstalled = managedDesktopEntry && managedDesktopIcon;
  const runtimeEnvironment = await readTextIfExists(
    paths.runtimeEnvironmentPath,
  );
  const commandOptions = {
    cwd: metadata?.repositoryRoot ?? options.rootDirectory ?? ROOT_DIRECTORY,
    env: environment,
  };

  const enabled = managedUnit
    ? await systemdState(
        run,
        ['is-enabled', LOCAL_SERVICE_NAME],
        commandOptions,
      )
    : { ok: false, value: 'não instalado' };
  const active = managedUnit
    ? await systemdState(run, ['is-active', LOCAL_SERVICE_NAME], commandOptions)
    : { ok: false, value: 'não instalado' };
  const healthy = metadata
    ? await checkHealth(metadata.port, options.fetchImpl ?? fetch)
    : false;

  return {
    installed: Boolean(
      metadata && managedUnit && runtimeEnvironment !== null && desktopInstalled,
    ),
    desktopInstalled,
    enabled: enabled.ok,
    active: active.ok,
    healthy,
    enabledState: enabled.value,
    activeState: active.value,
    origin: metadata?.origin ?? null,
    unitPath: paths.unitPath,
    desktopEntryPath: paths.desktopEntryPath,
    desktopIconPath: paths.desktopIconPath,
  };
}

export async function openLocal(options = {}) {
  const environment = options.environment ?? process.env;
  const run = options.runCommand ?? runCommand;
  const paths = resolveLocalInstallPaths(
    environment,
    options.homeDirectory ?? homedir(),
  );
  const metadata = await readLocalInstallMetadata(paths.metadataPath);
  if (!metadata) {
    throw new Error(
      'Dev Dashboard local não está instalado. Execute npm run local:install.',
    );
  }

  try {
    const opened = await run('xdg-open', [metadata.origin], {
      cwd: metadata.repositoryRoot,
      env: environment,
    });
    if (opened.code === 0) return { opened: true, origin: metadata.origin };
  } catch {
    // Fallback abaixo mantém a URL disponível sem esconder o erro do ambiente.
  }
  return { opened: false, origin: metadata.origin };
}

const CHROMIUM_BROWSER_COMMANDS = new Map([
  ['google-chrome.desktop', 'google-chrome'],
  ['google-chrome-stable.desktop', 'google-chrome-stable'],
  ['chromium.desktop', 'chromium'],
  ['chromium_chromium.desktop', 'chromium'],
  ['brave-browser.desktop', 'brave-browser'],
  ['microsoft-edge.desktop', 'microsoft-edge'],
  ['microsoft-edge-stable.desktop', 'microsoft-edge-stable'],
]);

export function resolveChromiumBrowserCommand(desktopId) {
  if (typeof desktopId !== 'string') return null;
  return CHROMIUM_BROWSER_COMMANDS.get(desktopId.trim()) ?? null;
}

function launchDetached(command, args, options = {}) {
  const spawnProcess = options.spawnProcess ?? spawn;
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnProcess(command, args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
        shell: false,
        stdio: 'ignore',
        detached: true,
      });
    } catch {
      resolve(false);
      return;
    }

    let settled = false;
    child.once('error', () => {
      if (settled) return;
      settled = true;
      resolve(false);
    });
    child.once('spawn', () => {
      if (settled) return;
      settled = true;
      child.unref();
      resolve(true);
    });
  });
}

export async function openAppLocal(options = {}) {
  const environment = options.environment ?? process.env;
  const run = options.runCommand ?? runCommand;
  const launch = options.launchDetached ?? launchDetached;
  const paths = resolveLocalInstallPaths(
    environment,
    options.homeDirectory ?? homedir(),
  );
  const metadata = await readLocalInstallMetadata(paths.metadataPath);
  if (!metadata) {
    throw new Error(
      'Dev Dashboard local não está instalado. Execute npm run local:install.',
    );
  }

  let browserCommand = null;
  try {
    const defaultBrowser = await run(
      'xdg-settings',
      ['get', 'default-web-browser'],
      { cwd: metadata.repositoryRoot, env: environment },
    );
    if (defaultBrowser.code === 0) {
      browserCommand = resolveChromiumBrowserCommand(defaultBrowser.stdout);
    }
  } catch {
    browserCommand = null;
  }

  if (browserCommand) {
    const opened = await launch(
      browserCommand,
      [
        '--class=' + LOCAL_DESKTOP_WM_CLASS,
        '--app=' + metadata.origin,
      ],
      { cwd: metadata.repositoryRoot, env: environment },
    );
    if (opened) {
      return {
        opened: true,
        origin: metadata.origin,
        mode: 'app',
        browser: browserCommand,
      };
    }
  }

  try {
    const opened = await run('xdg-open', [metadata.origin], {
      cwd: metadata.repositoryRoot,
      env: environment,
    });
    if (opened.code === 0) {
      return {
        opened: true,
        origin: metadata.origin,
        mode: 'browser',
        browser: null,
      };
    }
  } catch {
    // O chamador ainda recebe a URL para diagnóstico/fallback manual.
  }

  return {
    opened: false,
    origin: metadata.origin,
    mode: 'browser',
    browser: null,
  };
}

export async function uninstallLocal(options = {}) {
  const environment = options.environment ?? process.env;
  const run = options.runCommand ?? runCommand;
  const paths = resolveLocalInstallPaths(
    environment,
    options.homeDirectory ?? homedir(),
  );
  const contents = await readTextIfExists(paths.unitPath);
  const desktopEntry = await readTextIfExists(paths.desktopEntryPath);
  const desktopIcon = await readTextIfExists(paths.desktopIconPath);
  if (contents !== null && !contents.startsWith(MANAGED_UNIT_MARKER + '\n')) {
    throw new Error(
      `${paths.unitPath} não pertence ao instalador do Dev Dashboard; remoção recusada.`,
    );
  }
  if (
    desktopEntry !== null &&
    !desktopEntry.startsWith(MANAGED_DESKTOP_MARKER + '\n')
  ) {
    throw new Error(
      `${paths.desktopEntryPath} não pertence ao instalador do Dev Dashboard; remoção recusada.`,
    );
  }
  if (
    desktopIcon !== null &&
    !desktopIcon.startsWith(MANAGED_ICON_MARKER + '\n')
  ) {
    throw new Error(
      `${paths.desktopIconPath} não pertence ao instalador do Dev Dashboard; remoção recusada.`,
    );
  }

  if (contents !== null) {
    await run('systemctl', ['--user', 'disable', '--now', LOCAL_SERVICE_NAME], {
      cwd: options.rootDirectory ?? ROOT_DIRECTORY,
      env: environment,
    }).catch(() => undefined);
  }

  await rm(paths.unitPath, { force: true });
  await rm(paths.runtimeEnvironmentPath, { force: true });
  await rm(paths.metadataPath, { force: true });
  await rm(paths.desktopEntryPath, { force: true });
  await rm(paths.desktopIconPath, { force: true });

  if (contents !== null) {
    const reload = await run('systemctl', ['--user', 'daemon-reload'], {
      cwd: options.rootDirectory ?? ROOT_DIRECTORY,
      env: environment,
    });
    assertCommandSuccess(reload, 'Falha ao recarregar o systemd do usuário');
  }

  return {
    removed: contents !== null || desktopEntry !== null || desktopIcon !== null,
    unitPath: paths.unitPath,
    desktopEntryPath: paths.desktopEntryPath,
    desktopIconPath: paths.desktopIconPath,
  };
}

function printStatus(status) {
  const icon = (value) => (value ? '✓' : '✗');
  console.log('Dev Dashboard local\n');
  console.log(`${icon(status.installed)} instalado`);
  console.log(`${icon(status.desktopInstalled)} integração desktop`);
  console.log(`${icon(status.enabled)} autostart habilitado`);
  console.log(`${icon(status.active)} serviço ativo`);
  console.log(`${icon(status.healthy)} API saudável`);
  if (status.origin) console.log(`✓ URL: ${status.origin}`);
}

export async function main(args = process.argv.slice(2)) {
  const [command, ...rest] = args;
  if (rest.length > 0) throw new Error('Argumentos extras não são suportados.');

  if (command === 'install') {
    const result = await installLocal();
    console.log(`Dev Dashboard instalado e iniciado.\n${result.origin}`);
    return 0;
  }
  if (command === 'status') {
    const status = await localStatus();
    printStatus(status);
    return status.installed && status.enabled && status.active && status.healthy
      ? 0
      : 1;
  }
  if (command === 'open') {
    const result = await openLocal();
    if (!result.opened) {
      console.log(
        `Não foi possível abrir o navegador automaticamente.\n${result.origin}`,
      );
    }
    return 0;
  }
  if (command === 'open-app') {
    const result = await openAppLocal();
    if (!result.opened) {
      console.log(
        `Não foi possível abrir o aplicativo automaticamente.\n${result.origin}`,
      );
    }
    return result.opened ? 0 : 1;
  }
  if (command === 'uninstall') {
    await uninstallLocal();
    console.log(
      'Integração local removida. Configuração, estado e checkout foram preservados.',
    );
    return 0;
  }

  throw new Error(
    'Uso: node scripts/local-install.mjs <install|status|open|open-app|uninstall>',
  );
}

if (
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], 'file:').href
) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
, '\\
  assertSafeSystemdValue(value, label);
  return `"${value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('$', '\\$')
    .replaceAll('`', '\\`')}"`;
}

export function buildRuntimeEnvironment({
  port,
  origin,
  configDirectory,
  stateDirectory,
  runtimePath,
}) {
  return [
    `PATH=${environmentFileQuote(runtimePath, 'PATH')}`,
    `DEV_DASHBOARD_API_PORT=${port}`,
    `DEV_DASHBOARD_LOCAL_ORIGIN=${environmentFileQuote(origin, 'Origem')}`,
    `DEV_DASHBOARD_CONFIG_DIR=${environmentFileQuote(
      configDirectory,
      'Configuração',
    )}`,
    `DEV_DASHBOARD_STATE_DIR=${environmentFileQuote(stateDirectory, 'Estado')}`,
    'DEV_DASHBOARD_RUNTIME_REVISION=',
    '',
  ].join('\n');
}

export function parseInstallPort(value) {
  const configured = value?.trim() || String(DEFAULT_API_PORT);
  if (!/^\d+$/u.test(configured)) {
    throw new Error(`DEV_DASHBOARD_API_PORT inválida: ${configured}`);
  }
  const port = Number(configured);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`DEV_DASHBOARD_API_PORT inválida: ${configured}`);
  }
  return port;
}

function resolveXdgDirectory(environment, home, key, fallbackSegments) {
  const configured = environment[key]?.trim();
  return configured
    ? path.resolve(configured)
    : path.join(home, ...fallbackSegments);
}

export function resolveLocalInstallPaths(
  environment = process.env,
  home = homedir(),
) {
  const xdgConfigHome = resolveXdgDirectory(
    environment,
    home,
    'XDG_CONFIG_HOME',
    ['.config'],
  );
  const xdgStateHome = resolveXdgDirectory(
    environment,
    home,
    'XDG_STATE_HOME',
    ['.local', 'state'],
  );
  const configDirectory = environment.DEV_DASHBOARD_CONFIG_DIR?.trim()
    ? path.resolve(environment.DEV_DASHBOARD_CONFIG_DIR.trim())
    : path.join(xdgConfigHome, 'dev-dashboard');
  const stateDirectory = environment.DEV_DASHBOARD_STATE_DIR?.trim()
    ? path.resolve(environment.DEV_DASHBOARD_STATE_DIR.trim())
    : path.join(xdgStateHome, 'dev-dashboard');
  const unitDirectory = path.join(xdgConfigHome, 'systemd', 'user');

  return {
    configDirectory,
    stateDirectory,
    metadataPath: path.join(configDirectory, LOCAL_INSTALL_FILE),
    runtimeEnvironmentPath: path.join(configDirectory, LOCAL_RUNTIME_ENV_FILE),
    unitDirectory,
    unitPath: path.join(unitDirectory, LOCAL_SERVICE_NAME),
  };
}

export function buildRuntimePath(nodePath, inheritedPath = process.env.PATH) {
  const entries = [
    path.dirname(nodePath),
    ...(inheritedPath || DEFAULT_SYSTEM_PATH).split(path.delimiter),
  ].filter(Boolean);
  return [...new Set(entries)].join(path.delimiter);
}

export function buildLocalOrigin(port) {
  return `http://${LOCAL_ORIGIN_HOSTNAME}:${port}`;
}

export function buildSystemdUnit({
  repositoryRoot,
  nodePath,
  origin,
  configDirectory,
  stateDirectory,
  runtimePath,
}) {
  for (const [label, value] of [
    ['Checkout', repositoryRoot],
    ['Node', nodePath],
    ['Origem', origin],
    ['Configuração', configDirectory],
    ['Estado', stateDirectory],
    ['PATH', runtimePath],
  ]) {
    assertSafeSystemdValue(value, label);
  }

  const entrypoint = path.join(repositoryRoot, 'scripts', 'dev-web.mjs');
  const environmentFile = path.join(repositoryRoot, '.env.local');
  const runtimeEnvironmentFile = path.join(
    configDirectory,
    LOCAL_RUNTIME_ENV_FILE,
  );

  return `${MANAGED_UNIT_MARKER}
[Unit]
Description=Dev Dashboard local

[Service]
Type=simple
WorkingDirectory=${systemdPathValue(repositoryRoot, 'Checkout')}
EnvironmentFile=-${systemdPathValue(environmentFile, 'EnvironmentFile')}
EnvironmentFile=${systemdPathValue(runtimeEnvironmentFile, 'EnvironmentFile')}
ExecStart=${systemdQuote(nodePath)} ${systemdQuote(entrypoint)} --installed
Restart=on-failure
RestartSec=3
TimeoutStopSec=10

[Install]
WantedBy=default.target
`;
}

export function runCommand(command, args, options = {}) {
  const spawnProcess = options.spawnProcess ?? spawn;
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const append = (current, chunk) => {
      const next = current + String(chunk);
      if (Buffer.byteLength(next, 'utf8') > MAX_COMMAND_OUTPUT_BYTES) {
        if (!settled) {
          settled = true;
          child.kill('SIGTERM');
          reject(new Error(`Saída excessiva do comando ${command}.`));
        }
        return current;
      }
      return next;
    };

    child.stdout.on('data', (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = append(stderr, chunk);
    });
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      resolve({ code: code ?? (signal ? 1 : 0), stdout, stderr, signal });
    });
  });
}

function assertCommandSuccess(result, action) {
  if (result.code === 0) return;
  const detail = result.stderr.trim() || result.stdout.trim();
  throw new Error(detail ? `${action}: ${detail}` : action);
}

async function readTextIfExists(file) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (isErrnoCode(error, 'ENOENT')) return null;
    throw error;
  }
}

export async function isManagedUnit(unitPath) {
  const contents = await readTextIfExists(unitPath);
  if (contents === null) return false;
  return contents.startsWith(`${MANAGED_UNIT_MARKER}\n`);
}

async function assertUnitCanBeManaged(unitPath) {
  const contents = await readTextIfExists(unitPath);
  if (contents === null || contents.startsWith(`${MANAGED_UNIT_MARKER}\n`)) {
    return;
  }
  throw new Error(
    `${unitPath} já existe e não pertence ao instalador do Dev Dashboard. Nenhum arquivo foi sobrescrito.`,
  );
}

async function writePrivateFile(file, contents) {
  await writeFile(file, contents, { encoding: 'utf8', mode: 0o600 });
  await chmod(file, 0o600);
}

export async function readLocalInstallMetadata(metadataPath) {
  let metadata;
  try {
    metadata = await lstat(metadataPath);
  } catch (error) {
    if (isErrnoCode(error, 'ENOENT')) return null;
    throw error;
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(
      'Metadados da instalação local não são um arquivo regular.',
    );
  }
  try {
    const parsed = JSON.parse(await readFile(metadataPath, 'utf8'));
    if (
      parsed?.version !== LOCAL_INSTALL_VERSION ||
      parsed?.runtimeManager !== 'systemd-user' ||
      parsed?.unit !== LOCAL_SERVICE_NAME ||
      typeof parsed.repositoryRoot !== 'string' ||
      typeof parsed.nodePath !== 'string' ||
      !Number.isInteger(parsed.port) ||
      typeof parsed.origin !== 'string'
    ) {
      throw new Error();
    }
    return parsed;
  } catch {
    throw new Error('Metadados da instalação local são inválidos.');
  }
}

async function checkHealth(port, fetchImpl) {
  try {
    const response = await fetchImpl(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(1_500),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return false;
    const payload = await response.json();
    return payload?.status === 'ok' && payload?.service === 'dev-dashboard-api';
  } catch {
    return false;
  }
}

export async function waitForHealth(port, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? sleep;
  const attempts = options.attempts ?? INSTALL_READINESS_ATTEMPTS;
  const intervalMs = options.intervalMs ?? INSTALL_READINESS_INTERVAL_MS;

  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error(
      'Tentativas de readiness inválidas para a instalação local.',
    );
  }
  if (!Number.isFinite(intervalMs) || intervalMs < 0) {
    throw new Error('Intervalo de readiness inválido para a instalação local.');
  }

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await checkHealth(port, fetchImpl)) return;
    if (attempt < attempts - 1) await sleepImpl(intervalMs);
  }

  throw new Error(
    `Dev Dashboard foi reiniciado, mas a API não ficou saudável. Execute npm run local:status e journalctl --user -u ${LOCAL_SERVICE_NAME} -n 80 --no-pager.`,
  );
}

export async function installLocal(options = {}) {
  const platform = options.platform ?? process.platform;
  if (platform !== 'linux') {
    throw new Error(
      'A instalação local automática está disponível somente no Linux.',
    );
  }

  const environment = options.environment ?? process.env;
  const run = options.runCommand ?? runCommand;
  const root = await (options.resolveRealpath ?? realpath)(
    options.rootDirectory ?? ROOT_DIRECTORY,
  );
  const nodePath = options.nodePath ?? process.execPath;
  if (!path.isAbsolute(nodePath)) {
    throw new Error('O executável do Node precisa ser um caminho absoluto.');
  }

  const port = parseInstallPort(environment.DEV_DASHBOARD_API_PORT);
  const origin = buildLocalOrigin(port);
  const paths = resolveLocalInstallPaths(
    environment,
    options.homeDirectory ?? homedir(),
  );
  const runtimePath = buildRuntimePath(nodePath, environment.PATH);

  await assertUnitCanBeManaged(paths.unitPath);

  const systemd = await run('systemctl', ['--user', 'show-environment'], {
    cwd: root,
    env: environment,
  });
  assertCommandSuccess(
    systemd,
    'Não foi possível acessar o systemd da sessão do usuário',
  );

  const build = await run('npm', ['run', 'build'], {
    cwd: root,
    env: environment,
  });
  assertCommandSuccess(build, 'Build da instalação local falhou');

  await mkdir(paths.unitDirectory, { recursive: true, mode: 0o700 });
  await mkdir(paths.configDirectory, { recursive: true, mode: 0o700 });

  const runtimeEnvironment = buildRuntimeEnvironment({
    port,
    origin,
    configDirectory: paths.configDirectory,
    stateDirectory: paths.stateDirectory,
    runtimePath,
  });
  await writePrivateFile(paths.runtimeEnvironmentPath, runtimeEnvironment);

  const unit = buildSystemdUnit({
    repositoryRoot: root,
    nodePath,
    port,
    origin,
    configDirectory: paths.configDirectory,
    stateDirectory: paths.stateDirectory,
    runtimePath,
  });
  await writePrivateFile(paths.unitPath, unit);

  const localInstall = {
    version: LOCAL_INSTALL_VERSION,
    runtimeManager: 'systemd-user',
    unit: LOCAL_SERVICE_NAME,
    repositoryRoot: root,
    nodePath,
    port,
    origin,
  };
  await writePrivateFile(
    paths.metadataPath,
    `${JSON.stringify(localInstall, null, 2)}\n`,
  );

  const reload = await run('systemctl', ['--user', 'daemon-reload'], {
    cwd: root,
    env: environment,
  });
  assertCommandSuccess(reload, 'Falha ao recarregar o systemd do usuário');

  const enable = await run(
    'systemctl',
    ['--user', 'enable', LOCAL_SERVICE_NAME],
    { cwd: root, env: environment },
  );
  assertCommandSuccess(enable, 'Falha ao habilitar o Dev Dashboard no login');

  const restart = await run(
    'systemctl',
    ['--user', 'restart', LOCAL_SERVICE_NAME],
    { cwd: root, env: environment },
  );
  assertCommandSuccess(restart, 'Falha ao reiniciar o Dev Dashboard local');

  await waitForHealth(port, {
    fetchImpl: options.fetchImpl ?? fetch,
    sleepImpl: options.sleepImpl ?? sleep,
    attempts: options.readinessAttempts ?? INSTALL_READINESS_ATTEMPTS,
    intervalMs: options.readinessIntervalMs ?? INSTALL_READINESS_INTERVAL_MS,
  });

  return { ...localInstall, unitPath: paths.unitPath };
}

async function systemdState(run, args, options) {
  try {
    const result = await run('systemctl', ['--user', ...args], options);
    return {
      ok: result.code === 0,
      value:
        (result.stdout.trim() || result.stderr.trim()).split('\n')[0] || '',
    };
  } catch (error) {
    return {
      ok: false,
      value: error instanceof Error ? error.message : 'indisponível',
    };
  }
}

export async function localStatus(options = {}) {
  const environment = options.environment ?? process.env;
  const run = options.runCommand ?? runCommand;
  const paths = resolveLocalInstallPaths(
    environment,
    options.homeDirectory ?? homedir(),
  );
  const metadata = await readLocalInstallMetadata(paths.metadataPath);
  const managedUnit = await isManagedUnit(paths.unitPath);
  const runtimeEnvironment = await readTextIfExists(
    paths.runtimeEnvironmentPath,
  );
  const commandOptions = {
    cwd: metadata?.repositoryRoot ?? options.rootDirectory ?? ROOT_DIRECTORY,
    env: environment,
  };

  const enabled = managedUnit
    ? await systemdState(
        run,
        ['is-enabled', LOCAL_SERVICE_NAME],
        commandOptions,
      )
    : { ok: false, value: 'não instalado' };
  const active = managedUnit
    ? await systemdState(run, ['is-active', LOCAL_SERVICE_NAME], commandOptions)
    : { ok: false, value: 'não instalado' };
  const healthy = metadata
    ? await checkHealth(metadata.port, options.fetchImpl ?? fetch)
    : false;

  return {
    installed: Boolean(metadata && managedUnit && runtimeEnvironment !== null),
    enabled: enabled.ok,
    active: active.ok,
    healthy,
    enabledState: enabled.value,
    activeState: active.value,
    origin: metadata?.origin ?? null,
    unitPath: paths.unitPath,
  };
}

export async function openLocal(options = {}) {
  const environment = options.environment ?? process.env;
  const run = options.runCommand ?? runCommand;
  const paths = resolveLocalInstallPaths(
    environment,
    options.homeDirectory ?? homedir(),
  );
  const metadata = await readLocalInstallMetadata(paths.metadataPath);
  if (!metadata) {
    throw new Error(
      'Dev Dashboard local não está instalado. Execute npm run local:install.',
    );
  }

  try {
    const opened = await run('xdg-open', [metadata.origin], {
      cwd: metadata.repositoryRoot,
      env: environment,
    });
    if (opened.code === 0) return { opened: true, origin: metadata.origin };
  } catch {
    // Fallback abaixo mantém a URL disponível sem esconder o erro do ambiente.
  }
  return { opened: false, origin: metadata.origin };
}

export async function uninstallLocal(options = {}) {
  const environment = options.environment ?? process.env;
  const run = options.runCommand ?? runCommand;
  const paths = resolveLocalInstallPaths(
    environment,
    options.homeDirectory ?? homedir(),
  );
  const contents = await readTextIfExists(paths.unitPath);
  if (contents !== null && !contents.startsWith(`${MANAGED_UNIT_MARKER}\n`)) {
    throw new Error(
      `${paths.unitPath} não pertence ao instalador do Dev Dashboard; remoção recusada.`,
    );
  }

  if (contents !== null) {
    await run('systemctl', ['--user', 'disable', '--now', LOCAL_SERVICE_NAME], {
      cwd: options.rootDirectory ?? ROOT_DIRECTORY,
      env: environment,
    }).catch(() => undefined);
  }

  await rm(paths.unitPath, { force: true });
  await rm(paths.runtimeEnvironmentPath, { force: true });
  await rm(paths.metadataPath, { force: true });

  if (contents !== null) {
    const reload = await run('systemctl', ['--user', 'daemon-reload'], {
      cwd: options.rootDirectory ?? ROOT_DIRECTORY,
      env: environment,
    });
    assertCommandSuccess(reload, 'Falha ao recarregar o systemd do usuário');
  }

  return { removed: contents !== null, unitPath: paths.unitPath };
}

function printStatus(status) {
  const icon = (value) => (value ? '✓' : '✗');
  console.log('Dev Dashboard local\n');
  console.log(`${icon(status.installed)} instalado`);
  console.log(`${icon(status.enabled)} autostart habilitado`);
  console.log(`${icon(status.active)} serviço ativo`);
  console.log(`${icon(status.healthy)} API saudável`);
  if (status.origin) console.log(`✓ URL: ${status.origin}`);
}

export async function main(args = process.argv.slice(2)) {
  const [command, ...rest] = args;
  if (rest.length > 0) throw new Error('Argumentos extras não são suportados.');

  if (command === 'install') {
    const result = await installLocal();
    console.log(`Dev Dashboard instalado e iniciado.\n${result.origin}`);
    return 0;
  }
  if (command === 'status') {
    const status = await localStatus();
    printStatus(status);
    return status.installed && status.enabled && status.active && status.healthy
      ? 0
      : 1;
  }
  if (command === 'open') {
    const result = await openLocal();
    if (!result.opened) {
      console.log(
        `Não foi possível abrir o navegador automaticamente.\n${result.origin}`,
      );
    }
    return 0;
  }
  if (command === 'uninstall') {
    await uninstallLocal();
    console.log(
      'Integração local removida. Configuração, estado e checkout foram preservados.',
    );
    return 0;
  }

  throw new Error(
    'Uso: node scripts/local-install.mjs <install|status|open|uninstall>',
  );
}

if (
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], 'file:').href
) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
)
    .replaceAll('%', '%%')}"`;
}

function environmentFileQuote(value, label) {
  assertSafeSystemdValue(value, label);
  return `"${value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('$', '\\$')
    .replaceAll('`', '\\`')}"`;
}

export function buildRuntimeEnvironment({
  port,
  origin,
  configDirectory,
  stateDirectory,
  runtimePath,
}) {
  return [
    `PATH=${environmentFileQuote(runtimePath, 'PATH')}`,
    `DEV_DASHBOARD_API_PORT=${port}`,
    `DEV_DASHBOARD_LOCAL_ORIGIN=${environmentFileQuote(origin, 'Origem')}`,
    `DEV_DASHBOARD_CONFIG_DIR=${environmentFileQuote(
      configDirectory,
      'Configuração',
    )}`,
    `DEV_DASHBOARD_STATE_DIR=${environmentFileQuote(stateDirectory, 'Estado')}`,
    'DEV_DASHBOARD_RUNTIME_REVISION=',
    '',
  ].join('\n');
}

export function parseInstallPort(value) {
  const configured = value?.trim() || String(DEFAULT_API_PORT);
  if (!/^\d+$/u.test(configured)) {
    throw new Error(`DEV_DASHBOARD_API_PORT inválida: ${configured}`);
  }
  const port = Number(configured);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`DEV_DASHBOARD_API_PORT inválida: ${configured}`);
  }
  return port;
}

function resolveXdgDirectory(environment, home, key, fallbackSegments) {
  const configured = environment[key]?.trim();
  return configured
    ? path.resolve(configured)
    : path.join(home, ...fallbackSegments);
}

export function resolveLocalInstallPaths(
  environment = process.env,
  home = homedir(),
) {
  const xdgConfigHome = resolveXdgDirectory(
    environment,
    home,
    'XDG_CONFIG_HOME',
    ['.config'],
  );
  const xdgStateHome = resolveXdgDirectory(
    environment,
    home,
    'XDG_STATE_HOME',
    ['.local', 'state'],
  );
  const configDirectory = environment.DEV_DASHBOARD_CONFIG_DIR?.trim()
    ? path.resolve(environment.DEV_DASHBOARD_CONFIG_DIR.trim())
    : path.join(xdgConfigHome, 'dev-dashboard');
  const stateDirectory = environment.DEV_DASHBOARD_STATE_DIR?.trim()
    ? path.resolve(environment.DEV_DASHBOARD_STATE_DIR.trim())
    : path.join(xdgStateHome, 'dev-dashboard');
  const unitDirectory = path.join(xdgConfigHome, 'systemd', 'user');

  return {
    configDirectory,
    stateDirectory,
    metadataPath: path.join(configDirectory, LOCAL_INSTALL_FILE),
    runtimeEnvironmentPath: path.join(configDirectory, LOCAL_RUNTIME_ENV_FILE),
    unitDirectory,
    unitPath: path.join(unitDirectory, LOCAL_SERVICE_NAME),
  };
}

export function buildRuntimePath(nodePath, inheritedPath = process.env.PATH) {
  const entries = [
    path.dirname(nodePath),
    ...(inheritedPath || DEFAULT_SYSTEM_PATH).split(path.delimiter),
  ].filter(Boolean);
  return [...new Set(entries)].join(path.delimiter);
}

export function buildLocalOrigin(port) {
  return `http://${LOCAL_ORIGIN_HOSTNAME}:${port}`;
}

export function buildSystemdUnit({
  repositoryRoot,
  nodePath,
  origin,
  configDirectory,
  stateDirectory,
  runtimePath,
}) {
  for (const [label, value] of [
    ['Checkout', repositoryRoot],
    ['Node', nodePath],
    ['Origem', origin],
    ['Configuração', configDirectory],
    ['Estado', stateDirectory],
    ['PATH', runtimePath],
  ]) {
    assertSafeSystemdValue(value, label);
  }

  const entrypoint = path.join(repositoryRoot, 'scripts', 'dev-web.mjs');
  const environmentFile = path.join(repositoryRoot, '.env.local');
  const runtimeEnvironmentFile = path.join(
    configDirectory,
    LOCAL_RUNTIME_ENV_FILE,
  );

  return `${MANAGED_UNIT_MARKER}
[Unit]
Description=Dev Dashboard local

[Service]
Type=simple
WorkingDirectory=${systemdPathValue(repositoryRoot, 'Checkout')}
EnvironmentFile=-${systemdPathValue(environmentFile, 'EnvironmentFile')}
EnvironmentFile=${systemdPathValue(runtimeEnvironmentFile, 'EnvironmentFile')}
ExecStart=${systemdQuote(nodePath)} ${systemdQuote(entrypoint)} --installed
Restart=on-failure
RestartSec=3
TimeoutStopSec=10

[Install]
WantedBy=default.target
`;
}

export function runCommand(command, args, options = {}) {
  const spawnProcess = options.spawnProcess ?? spawn;
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const append = (current, chunk) => {
      const next = current + String(chunk);
      if (Buffer.byteLength(next, 'utf8') > MAX_COMMAND_OUTPUT_BYTES) {
        if (!settled) {
          settled = true;
          child.kill('SIGTERM');
          reject(new Error(`Saída excessiva do comando ${command}.`));
        }
        return current;
      }
      return next;
    };

    child.stdout.on('data', (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = append(stderr, chunk);
    });
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      resolve({ code: code ?? (signal ? 1 : 0), stdout, stderr, signal });
    });
  });
}

function assertCommandSuccess(result, action) {
  if (result.code === 0) return;
  const detail = result.stderr.trim() || result.stdout.trim();
  throw new Error(detail ? `${action}: ${detail}` : action);
}

async function readTextIfExists(file) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (isErrnoCode(error, 'ENOENT')) return null;
    throw error;
  }
}

export async function isManagedUnit(unitPath) {
  const contents = await readTextIfExists(unitPath);
  if (contents === null) return false;
  return contents.startsWith(`${MANAGED_UNIT_MARKER}\n`);
}

async function assertUnitCanBeManaged(unitPath) {
  const contents = await readTextIfExists(unitPath);
  if (contents === null || contents.startsWith(`${MANAGED_UNIT_MARKER}\n`)) {
    return;
  }
  throw new Error(
    `${unitPath} já existe e não pertence ao instalador do Dev Dashboard. Nenhum arquivo foi sobrescrito.`,
  );
}

async function writePrivateFile(file, contents) {
  await writeFile(file, contents, { encoding: 'utf8', mode: 0o600 });
  await chmod(file, 0o600);
}

export async function readLocalInstallMetadata(metadataPath) {
  let metadata;
  try {
    metadata = await lstat(metadataPath);
  } catch (error) {
    if (isErrnoCode(error, 'ENOENT')) return null;
    throw error;
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(
      'Metadados da instalação local não são um arquivo regular.',
    );
  }
  try {
    const parsed = JSON.parse(await readFile(metadataPath, 'utf8'));
    if (
      parsed?.version !== LOCAL_INSTALL_VERSION ||
      parsed?.runtimeManager !== 'systemd-user' ||
      parsed?.unit !== LOCAL_SERVICE_NAME ||
      typeof parsed.repositoryRoot !== 'string' ||
      typeof parsed.nodePath !== 'string' ||
      !Number.isInteger(parsed.port) ||
      typeof parsed.origin !== 'string'
    ) {
      throw new Error();
    }
    return parsed;
  } catch {
    throw new Error('Metadados da instalação local são inválidos.');
  }
}

async function checkHealth(port, fetchImpl) {
  try {
    const response = await fetchImpl(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(1_500),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return false;
    const payload = await response.json();
    return payload?.status === 'ok' && payload?.service === 'dev-dashboard-api';
  } catch {
    return false;
  }
}

export async function waitForHealth(port, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? sleep;
  const attempts = options.attempts ?? INSTALL_READINESS_ATTEMPTS;
  const intervalMs = options.intervalMs ?? INSTALL_READINESS_INTERVAL_MS;

  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error(
      'Tentativas de readiness inválidas para a instalação local.',
    );
  }
  if (!Number.isFinite(intervalMs) || intervalMs < 0) {
    throw new Error('Intervalo de readiness inválido para a instalação local.');
  }

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await checkHealth(port, fetchImpl)) return;
    if (attempt < attempts - 1) await sleepImpl(intervalMs);
  }

  throw new Error(
    `Dev Dashboard foi reiniciado, mas a API não ficou saudável. Execute npm run local:status e journalctl --user -u ${LOCAL_SERVICE_NAME} -n 80 --no-pager.`,
  );
}

export async function installLocal(options = {}) {
  const platform = options.platform ?? process.platform;
  if (platform !== 'linux') {
    throw new Error(
      'A instalação local automática está disponível somente no Linux.',
    );
  }

  const environment = options.environment ?? process.env;
  const run = options.runCommand ?? runCommand;
  const root = await (options.resolveRealpath ?? realpath)(
    options.rootDirectory ?? ROOT_DIRECTORY,
  );
  const nodePath = options.nodePath ?? process.execPath;
  if (!path.isAbsolute(nodePath)) {
    throw new Error('O executável do Node precisa ser um caminho absoluto.');
  }

  const port = parseInstallPort(environment.DEV_DASHBOARD_API_PORT);
  const origin = buildLocalOrigin(port);
  const paths = resolveLocalInstallPaths(
    environment,
    options.homeDirectory ?? homedir(),
  );
  const runtimePath = buildRuntimePath(nodePath, environment.PATH);

  await assertUnitCanBeManaged(paths.unitPath);

  const systemd = await run('systemctl', ['--user', 'show-environment'], {
    cwd: root,
    env: environment,
  });
  assertCommandSuccess(
    systemd,
    'Não foi possível acessar o systemd da sessão do usuário',
  );

  const build = await run('npm', ['run', 'build'], {
    cwd: root,
    env: environment,
  });
  assertCommandSuccess(build, 'Build da instalação local falhou');

  await mkdir(paths.unitDirectory, { recursive: true, mode: 0o700 });
  await mkdir(paths.configDirectory, { recursive: true, mode: 0o700 });

  const runtimeEnvironment = buildRuntimeEnvironment({
    port,
    origin,
    configDirectory: paths.configDirectory,
    stateDirectory: paths.stateDirectory,
    runtimePath,
  });
  await writePrivateFile(paths.runtimeEnvironmentPath, runtimeEnvironment);

  const unit = buildSystemdUnit({
    repositoryRoot: root,
    nodePath,
    port,
    origin,
    configDirectory: paths.configDirectory,
    stateDirectory: paths.stateDirectory,
    runtimePath,
  });
  await writePrivateFile(paths.unitPath, unit);

  const localInstall = {
    version: LOCAL_INSTALL_VERSION,
    runtimeManager: 'systemd-user',
    unit: LOCAL_SERVICE_NAME,
    repositoryRoot: root,
    nodePath,
    port,
    origin,
  };
  await writePrivateFile(
    paths.metadataPath,
    `${JSON.stringify(localInstall, null, 2)}\n`,
  );

  const reload = await run('systemctl', ['--user', 'daemon-reload'], {
    cwd: root,
    env: environment,
  });
  assertCommandSuccess(reload, 'Falha ao recarregar o systemd do usuário');

  const enable = await run(
    'systemctl',
    ['--user', 'enable', LOCAL_SERVICE_NAME],
    { cwd: root, env: environment },
  );
  assertCommandSuccess(enable, 'Falha ao habilitar o Dev Dashboard no login');

  const restart = await run(
    'systemctl',
    ['--user', 'restart', LOCAL_SERVICE_NAME],
    { cwd: root, env: environment },
  );
  assertCommandSuccess(restart, 'Falha ao reiniciar o Dev Dashboard local');

  await waitForHealth(port, {
    fetchImpl: options.fetchImpl ?? fetch,
    sleepImpl: options.sleepImpl ?? sleep,
    attempts: options.readinessAttempts ?? INSTALL_READINESS_ATTEMPTS,
    intervalMs: options.readinessIntervalMs ?? INSTALL_READINESS_INTERVAL_MS,
  });

  return { ...localInstall, unitPath: paths.unitPath };
}

async function systemdState(run, args, options) {
  try {
    const result = await run('systemctl', ['--user', ...args], options);
    return {
      ok: result.code === 0,
      value:
        (result.stdout.trim() || result.stderr.trim()).split('\n')[0] || '',
    };
  } catch (error) {
    return {
      ok: false,
      value: error instanceof Error ? error.message : 'indisponível',
    };
  }
}

export async function localStatus(options = {}) {
  const environment = options.environment ?? process.env;
  const run = options.runCommand ?? runCommand;
  const paths = resolveLocalInstallPaths(
    environment,
    options.homeDirectory ?? homedir(),
  );
  const metadata = await readLocalInstallMetadata(paths.metadataPath);
  const managedUnit = await isManagedUnit(paths.unitPath);
  const runtimeEnvironment = await readTextIfExists(
    paths.runtimeEnvironmentPath,
  );
  const commandOptions = {
    cwd: metadata?.repositoryRoot ?? options.rootDirectory ?? ROOT_DIRECTORY,
    env: environment,
  };

  const enabled = managedUnit
    ? await systemdState(
        run,
        ['is-enabled', LOCAL_SERVICE_NAME],
        commandOptions,
      )
    : { ok: false, value: 'não instalado' };
  const active = managedUnit
    ? await systemdState(run, ['is-active', LOCAL_SERVICE_NAME], commandOptions)
    : { ok: false, value: 'não instalado' };
  const healthy = metadata
    ? await checkHealth(metadata.port, options.fetchImpl ?? fetch)
    : false;

  return {
    installed: Boolean(metadata && managedUnit && runtimeEnvironment !== null),
    enabled: enabled.ok,
    active: active.ok,
    healthy,
    enabledState: enabled.value,
    activeState: active.value,
    origin: metadata?.origin ?? null,
    unitPath: paths.unitPath,
  };
}

export async function openLocal(options = {}) {
  const environment = options.environment ?? process.env;
  const run = options.runCommand ?? runCommand;
  const paths = resolveLocalInstallPaths(
    environment,
    options.homeDirectory ?? homedir(),
  );
  const metadata = await readLocalInstallMetadata(paths.metadataPath);
  if (!metadata) {
    throw new Error(
      'Dev Dashboard local não está instalado. Execute npm run local:install.',
    );
  }

  try {
    const opened = await run('xdg-open', [metadata.origin], {
      cwd: metadata.repositoryRoot,
      env: environment,
    });
    if (opened.code === 0) return { opened: true, origin: metadata.origin };
  } catch {
    // Fallback abaixo mantém a URL disponível sem esconder o erro do ambiente.
  }
  return { opened: false, origin: metadata.origin };
}

export async function uninstallLocal(options = {}) {
  const environment = options.environment ?? process.env;
  const run = options.runCommand ?? runCommand;
  const paths = resolveLocalInstallPaths(
    environment,
    options.homeDirectory ?? homedir(),
  );
  const contents = await readTextIfExists(paths.unitPath);
  if (contents !== null && !contents.startsWith(`${MANAGED_UNIT_MARKER}\n`)) {
    throw new Error(
      `${paths.unitPath} não pertence ao instalador do Dev Dashboard; remoção recusada.`,
    );
  }

  if (contents !== null) {
    await run('systemctl', ['--user', 'disable', '--now', LOCAL_SERVICE_NAME], {
      cwd: options.rootDirectory ?? ROOT_DIRECTORY,
      env: environment,
    }).catch(() => undefined);
  }

  await rm(paths.unitPath, { force: true });
  await rm(paths.runtimeEnvironmentPath, { force: true });
  await rm(paths.metadataPath, { force: true });

  if (contents !== null) {
    const reload = await run('systemctl', ['--user', 'daemon-reload'], {
      cwd: options.rootDirectory ?? ROOT_DIRECTORY,
      env: environment,
    });
    assertCommandSuccess(reload, 'Falha ao recarregar o systemd do usuário');
  }

  return { removed: contents !== null, unitPath: paths.unitPath };
}

function printStatus(status) {
  const icon = (value) => (value ? '✓' : '✗');
  console.log('Dev Dashboard local\n');
  console.log(`${icon(status.installed)} instalado`);
  console.log(`${icon(status.enabled)} autostart habilitado`);
  console.log(`${icon(status.active)} serviço ativo`);
  console.log(`${icon(status.healthy)} API saudável`);
  if (status.origin) console.log(`✓ URL: ${status.origin}`);
}

export async function main(args = process.argv.slice(2)) {
  const [command, ...rest] = args;
  if (rest.length > 0) throw new Error('Argumentos extras não são suportados.');

  if (command === 'install') {
    const result = await installLocal();
    console.log(`Dev Dashboard instalado e iniciado.\n${result.origin}`);
    return 0;
  }
  if (command === 'status') {
    const status = await localStatus();
    printStatus(status);
    return status.installed && status.enabled && status.active && status.healthy
      ? 0
      : 1;
  }
  if (command === 'open') {
    const result = await openLocal();
    if (!result.opened) {
      console.log(
        `Não foi possível abrir o navegador automaticamente.\n${result.origin}`,
      );
    }
    return 0;
  }
  if (command === 'uninstall') {
    await uninstallLocal();
    console.log(
      'Integração local removida. Configuração, estado e checkout foram preservados.',
    );
    return 0;
  }

  throw new Error(
    'Uso: node scripts/local-install.mjs <install|status|open|uninstall>',
  );
}

if (
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], 'file:').href
) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
