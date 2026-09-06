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
export const LOCAL_ORIGIN_HOSTNAME = 'dev-dashboard.localhost';
export const MANAGED_UNIT_MARKER = '# Managed by dev-dashboard local:install';

export const ROOT_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const DEFAULT_API_PORT = 4343;
const DEFAULT_SYSTEM_PATH = '/usr/local/bin:/usr/bin:/bin';
const MAX_COMMAND_OUTPUT_BYTES = 128 * 1024;

function isErrnoCode(error, code) {
  return error instanceof Error && 'code' in error && error.code === code;
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
  port,
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

  return `${MANAGED_UNIT_MARKER}
[Unit]
Description=Dev Dashboard local

[Service]
Type=simple
WorkingDirectory=${systemdQuote(repositoryRoot)}
EnvironmentFile=-${systemdQuote(environmentFile)}
Environment=${systemdQuote(`PATH=${runtimePath}`)}
Environment=${systemdQuote(`DEV_DASHBOARD_API_PORT=${port}`)}
Environment=${systemdQuote(`DEV_DASHBOARD_LOCAL_ORIGIN=${origin}`)}
Environment=${systemdQuote(
    `DEV_DASHBOARD_CONFIG_DIR=${configDirectory}`,
  )}
Environment=${systemdQuote(`DEV_DASHBOARD_STATE_DIR=${stateDirectory}`)}
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
    throw new Error('Metadados da instalação local não são um arquivo regular.');
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

export async function installLocal(options = {}) {
  const platform = options.platform ?? process.platform;
  if (platform !== 'linux') {
    throw new Error('A instalação local automática está disponível somente no Linux.');
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
    ['--user', 'enable', '--now', LOCAL_SERVICE_NAME],
    { cwd: root, env: environment },
  );
  assertCommandSuccess(enable, 'Falha ao habilitar o Dev Dashboard no login');

  return { ...localInstall, unitPath: paths.unitPath };
}

async function systemdState(run, args, options) {
  try {
    const result = await run('systemctl', ['--user', ...args], options);
    return {
      ok: result.code === 0,
      value: (result.stdout.trim() || result.stderr.trim()).split('\n')[0] || '',
    };
  } catch (error) {
    return {
      ok: false,
      value: error instanceof Error ? error.message : 'indisponível',
    };
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

export async function localStatus(options = {}) {
  const environment = options.environment ?? process.env;
  const run = options.runCommand ?? runCommand;
  const paths = resolveLocalInstallPaths(
    environment,
    options.homeDirectory ?? homedir(),
  );
  const metadata = await readLocalInstallMetadata(paths.metadataPath);
  const managedUnit = await isManagedUnit(paths.unitPath);
  const commandOptions = {
    cwd: metadata?.repositoryRoot ?? options.rootDirectory ?? ROOT_DIRECTORY,
    env: environment,
  };

  const enabled = managedUnit
    ? await systemdState(run, ['is-enabled', LOCAL_SERVICE_NAME], commandOptions)
    : { ok: false, value: 'não instalado' };
  const active = managedUnit
    ? await systemdState(run, ['is-active', LOCAL_SERVICE_NAME], commandOptions)
    : { ok: false, value: 'não instalado' };
  const healthy = metadata
    ? await checkHealth(metadata.port, options.fetchImpl ?? fetch)
    : false;

  return {
    installed: Boolean(metadata && managedUnit),
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
    throw new Error('Dev Dashboard local não está instalado. Execute npm run local:install.');
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
    await run(
      'systemctl',
      ['--user', 'disable', '--now', LOCAL_SERVICE_NAME],
      { cwd: options.rootDirectory ?? ROOT_DIRECTORY, env: environment },
    ).catch(() => undefined);
  }

  await rm(paths.unitPath, { force: true });
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
      console.log(`Não foi possível abrir o navegador automaticamente.\n${result.origin}`);
    }
    return 0;
  }
  if (command === 'uninstall') {
    await uninstallLocal();
    console.log('Integração local removida. Configuração, estado e checkout foram preservados.');
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
