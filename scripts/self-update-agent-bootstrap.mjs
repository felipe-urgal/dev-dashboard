#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveSelfUpdateAgentPaths } from './self-update-agent-runtime.mjs';

const AGENT_PATH = fileURLToPath(
  new URL('./self-update-agent.mjs', import.meta.url),
);
const TOOL_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 64 * 1024;
const SERVICE_READY_ATTEMPTS = 80;
const SERVICE_READY_INTERVAL_MS = 50;

export const SELF_UPDATE_AGENT_SERVICE_NAME =
  'dev-dashboard-self-update-agent.service';
export const SELF_UPDATE_AGENT_UNIT_MARKER =
  '# Managed by dev-dashboard self-update';

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeMessage(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const message = value.trim().replaceAll(/\s+/g, ' ').slice(0, 500);
  return message || fallback;
}

function parseJson(stdout, fallback) {
  try {
    return JSON.parse(stdout ?? '');
  } catch {
    throw new Error(fallback);
  }
}

function assertInstalled(result) {
  if (result.error || result.status !== 0) {
    throw new Error(
      safeMessage(
        result.stderr,
        'Não foi possível instalar/atualizar o self-update agent local.',
      ),
    );
  }
  const installation = parseJson(
    result.stdout,
    'Self-update agent retornou uma instalação inválida.',
  );
  if (
    !isRecord(installation) ||
    installation.status !== 'installed' ||
    typeof installation.release !== 'string' ||
    installation.release.length === 0 ||
    typeof installation.entrypoint !== 'string' ||
    !path.isAbsolute(installation.entrypoint)
  ) {
    throw new Error('Self-update agent não comprovou a release instalada.');
  }
  return installation;
}

function readReady(result) {
  if (result.error || result.status !== 0) return null;
  let ping;
  try {
    ping = JSON.parse(result.stdout ?? '');
  } catch {
    return null;
  }
  if (
    !isRecord(ping) ||
    ping.status !== 'ready' ||
    !Number.isSafeInteger(ping.pid) ||
    ping.pid <= 1 ||
    typeof ping.instanceId !== 'string' ||
    ping.instanceId.length === 0 ||
    typeof ping.release !== 'string' ||
    ping.release.length === 0 ||
    !Array.isArray(ping.actions) ||
    !ping.actions.includes('claim') ||
    !ping.actions.includes('inspect') ||
    !ping.actions.includes('execute')
  ) {
    return null;
  }
  return ping;
}

function assertCommand(result, fallback) {
  if (!result.error && result.status === 0) return;
  throw new Error(safeMessage(result.stderr, fallback));
}

function assertSafeSystemdValue(value, label) {
  if (typeof value !== 'string' || /[\0\r\n]/u.test(value)) {
    throw new Error(`${label} contém caracteres inválidos para systemd.`);
  }
}

function systemdQuote(value) {
  assertSafeSystemdValue(value, 'Valor');
  return `"${value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('%', '%%')}"`;
}

export function resolveSelfUpdateAgentUnitPath(
  environment = process.env,
  home = homedir(),
) {
  const configured = environment.XDG_CONFIG_HOME?.trim();
  const configHome = configured
    ? path.resolve(configured)
    : path.join(home, '.config');
  return path.join(
    configHome,
    'systemd',
    'user',
    SELF_UPDATE_AGENT_SERVICE_NAME,
  );
}

export function buildSelfUpdateAgentUnit({
  installation,
  nodePath = process.execPath,
  paths = resolveSelfUpdateAgentPaths(),
}) {
  for (const [label, value] of [
    ['Node', nodePath],
    ['Entrypoint', installation.entrypoint],
    ['Instalação', paths.installRoot],
    ['Configuração', paths.configDirectory],
    ['Estado', path.dirname(paths.stateDirectory)],
    ['Runtime', paths.runtimeDirectory],
  ]) {
    assertSafeSystemdValue(value, label);
  }

  return `${SELF_UPDATE_AGENT_UNIT_MARKER}
[Unit]
Description=Dev Dashboard self-update agent

[Service]
Type=simple
ExecStart=${systemdQuote(nodePath)} ${systemdQuote(installation.entrypoint)} serve
Environment=${systemdQuote(
    `DEV_DASHBOARD_SELF_UPDATE_INSTALL_DIR=${paths.installRoot}`,
  )}
Environment=${systemdQuote(`DEV_DASHBOARD_CONFIG_DIR=${paths.configDirectory}`)}
Environment=${systemdQuote(
    `DEV_DASHBOARD_STATE_DIR=${path.dirname(paths.stateDirectory)}`,
  )}
Environment=${systemdQuote(
    `DEV_DASHBOARD_SELF_UPDATE_RUNTIME_DIR=${paths.runtimeDirectory}`,
  )}
Restart=on-failure
RestartSec=1
TimeoutStopSec=5
UMask=0077

[Install]
WantedBy=default.target
`;
}

function sleepSync(milliseconds) {
  const state = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(state, 0, 0, milliseconds);
}

function writeManagedUnit(unitPath, contents) {
  const directory = path.dirname(unitPath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });

  if (existsSync(unitPath)) {
    const current = readFileSync(unitPath, 'utf8');
    if (!current.startsWith(`${SELF_UPDATE_AGENT_UNIT_MARKER}\n`)) {
      throw new Error(
        `${unitPath} já existe e não pertence ao self-update do Dev Dashboard.`,
      );
    }
    if (current === contents) {
      chmodSync(unitPath, 0o600);
      return;
    }
  }

  writeFileSync(unitPath, contents, { encoding: 'utf8', mode: 0o600 });
  chmodSync(unitPath, 0o600);
}

function readServiceState(runSystemctl) {
  const active = runSystemctl(['is-active', SELF_UPDATE_AGENT_SERVICE_NAME]);
  const pid = runSystemctl([
    'show',
    SELF_UPDATE_AGENT_SERVICE_NAME,
    '--property=MainPID',
    '--value',
  ]);

  const parsedPid = Number.parseInt(pid.stdout?.trim() ?? '', 10);
  return {
    active:
      !active.error &&
      active.status === 0 &&
      active.stdout?.trim() === 'active',
    pid:
      !pid.error &&
      pid.status === 0 &&
      Number.isSafeInteger(parsedPid) &&
      parsedPid > 1
        ? parsedPid
        : null,
  };
}

export function ensureSelfUpdateAgentService({
  installation,
  current,
  runAgent,
  runner = spawnSync,
  environment = process.env,
  homeDirectory = homedir(),
  paths = resolveSelfUpdateAgentPaths(),
  unitPath = resolveSelfUpdateAgentUnitPath(environment, homeDirectory),
} = {}) {
  if (!installation || typeof runAgent !== 'function') {
    throw new Error(
      'Lifecycle do self-update agent recebeu argumentos inválidos.',
    );
  }

  const unit = buildSelfUpdateAgentUnit({ installation, paths });
  writeManagedUnit(unitPath, unit);

  const runSystemctl = (args) =>
    runner('systemctl', ['--user', ...args], {
      encoding: 'utf8',
      shell: false,
      timeout: TOOL_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      env: environment,
    });

  assertCommand(
    runSystemctl(['daemon-reload']),
    'Não foi possível recarregar o systemd do self-update agent.',
  );
  assertCommand(
    runSystemctl(['enable', SELF_UPDATE_AGENT_SERVICE_NAME]),
    'Não foi possível habilitar o self-update agent no systemd do usuário.',
  );

  const state = readServiceState(runSystemctl);
  if (
    current?.release === installation.release &&
    state.active &&
    state.pid === current.pid
  ) {
    return current;
  }

  if (current) {
    assertCommand(
      runAgent(['stop']),
      'Não foi possível encerrar a instância antiga do self-update agent.',
    );
  }

  assertCommand(
    runSystemctl(['restart', SELF_UPDATE_AGENT_SERVICE_NAME]),
    'Não foi possível iniciar o self-update agent em unit própria.',
  );

  let lastError = '';
  for (let attempt = 0; attempt < SERVICE_READY_ATTEMPTS; attempt += 1) {
    const pingResult = runAgent(['ping']);
    const ready = readReady(pingResult);
    if (ready?.release === installation.release) {
      const service = readServiceState(runSystemctl);
      if (service.active && service.pid === ready.pid) return ready;
      lastError =
        'Agent respondeu, mas o PID não pertence à unit gerenciada do systemd.';
    } else if (pingResult.stderr) {
      lastError = safeMessage(pingResult.stderr, lastError);
    }

    if (attempt < SERVICE_READY_ATTEMPTS - 1) {
      sleepSync(SERVICE_READY_INTERVAL_MS);
    }
  }

  throw new Error(
    lastError ||
      'Self-update agent não ficou pronto na unit gerenciada dentro do limite.',
  );
}

export function ensureSelfUpdateAgentReady({
  runner = spawnSync,
  agentPath = AGENT_PATH,
  serviceManager = ensureSelfUpdateAgentService,
} = {}) {
  const runAgent = (args) =>
    runner(process.execPath, [agentPath, ...args], {
      encoding: 'utf8',
      shell: false,
      timeout: TOOL_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
    });

  const installation = assertInstalled(runAgent(['install']));
  const current = readReady(runAgent(['ping']));
  const ready = serviceManager({
    installation,
    current,
    runAgent,
    runner,
  });

  if (!ready || ready.release !== installation.release) {
    throw new Error(
      'Self-update agent iniciou uma release diferente da instalação preparada.',
    );
  }
  return ready;
}

export function runSelfUpdateAgentBootstrap(
  argv,
  {
    stdout = process.stdout,
    stderr = process.stderr,
    ensure = ensureSelfUpdateAgentReady,
  } = {},
) {
  const [command, ...args] = argv;
  if (command !== 'ensure' || args.length !== 0) {
    stderr.write('Uso: node scripts/self-update-agent-bootstrap.mjs ensure\n');
    return 2;
  }

  try {
    const ready = ensure();
    stdout.write(`${JSON.stringify(ready, null, 2)}\n`);
    return 0;
  } catch (error) {
    stderr.write(
      `Self-update bootstrap: ${error instanceof Error ? error.message : 'Falha desconhecida.'}\n`,
    );
    return 1;
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  process.exitCode = runSelfUpdateAgentBootstrap(process.argv.slice(2));
}
