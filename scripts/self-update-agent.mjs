#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  SelfUpdateAgentError,
  assertAgentEntrypointInstalled,
  getOrCreateSelfUpdateAgentToken,
  installSelfUpdateAgent,
  readSelfUpdateAgentToken,
  resolveSelfUpdateAgentPaths,
  sendSelfUpdateAgentRequest,
  startSelfUpdateAgentServer,
  verifyInstalledSelfUpdateAgent,
} from './self-update-agent-runtime.mjs';

const START_TIMEOUT_MS = 4_000;
const STOP_TIMEOUT_MS = 4_000;
const POLL_INTERVAL_MS = 50;

function usage() {
  return [
    'Uso:',
    '  node scripts/self-update-agent.mjs install',
    '  node scripts/self-update-agent.mjs start',
    '  node scripts/self-update-agent.mjs stop',
    '  node scripts/self-update-agent.mjs status',
    '  node scripts/self-update-agent.mjs ping',
    '  node scripts/self-update-agent.mjs inspect <handoff-id>',
    '  node scripts/self-update-agent.mjs claim <handoff-id>',
    '  node scripts/self-update-agent.mjs recover',
    '',
    'O agent atual não aplica update, não reinicia serviços e não executa ações privilegiadas.',
  ].join('\n');
}

function printJson(value, stdout) {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isErrnoCode(error, code) {
  return error instanceof Error && 'code' in error && error.code === code;
}

function isUnavailableError(error) {
  return (
    (error instanceof SelfUpdateAgentError &&
      error.code === 'AGENT_UNAVAILABLE') ||
    isErrnoCode(error, 'ENOENT') ||
    isErrnoCode(error, 'ECONNREFUSED')
  );
}

async function pingAgent(paths) {
  let token;
  try {
    token = await readSelfUpdateAgentToken(paths);
  } catch (error) {
    if (isErrnoCode(error, 'ENOENT')) {
      throw new SelfUpdateAgentError(
        'AGENT_TOKEN_MISSING',
        'Token local do self-update agent não foi encontrado.',
      );
    }
    throw error;
  }
  return await sendSelfUpdateAgentRequest('ping', { paths, token });
}

async function waitUntilReady(paths, timeoutMs = START_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await pingAgent(paths);
    } catch (error) {
      lastError = error;
      if (!isUnavailableError(error)) throw error;
      await sleep(POLL_INTERVAL_MS);
    }
  }
  throw new SelfUpdateAgentError(
    'AGENT_START_TIMEOUT',
    lastError instanceof Error
      ? `Agent instalado não ficou pronto: ${lastError.message}`
      : 'Agent instalado não ficou pronto dentro do limite.',
  );
}

async function waitUntilStopped(paths, timeoutMs = STOP_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await pingAgent(paths);
      await sleep(POLL_INTERVAL_MS);
    } catch (error) {
      if (isUnavailableError(error)) return;
      throw error;
    }
  }
  throw new SelfUpdateAgentError(
    'AGENT_STOP_TIMEOUT',
    'Agent não encerrou dentro do limite.',
  );
}

export async function installAgent({ paths, sourceDirectory } = {}) {
  const activePaths = paths ?? resolveSelfUpdateAgentPaths();
  const activeSourceDirectory =
    sourceDirectory ?? path.dirname(fileURLToPath(import.meta.url));
  return await installSelfUpdateAgent({
    sourceDirectory: activeSourceDirectory,
    paths: activePaths,
  });
}

export async function startAgent({ paths, spawnProcess = spawn } = {}) {
  const activePaths = paths ?? resolveSelfUpdateAgentPaths();
  const installation = await verifyInstalledSelfUpdateAgent(activePaths);
  await getOrCreateSelfUpdateAgentToken(activePaths);

  try {
    const current = await pingAgent(activePaths);
    return { status: 'already-running', ...current };
  } catch (error) {
    if (!isUnavailableError(error)) throw error;
  }

  const child = spawnProcess(process.execPath, [installation.entrypoint, 'serve'], {
    detached: true,
    shell: false,
    stdio: 'ignore',
    env: {
      ...process.env,
      DEV_DASHBOARD_SELF_UPDATE_INSTALL_DIR: activePaths.installRoot,
      DEV_DASHBOARD_CONFIG_DIR: activePaths.configDirectory,
      DEV_DASHBOARD_STATE_DIR: path.dirname(activePaths.stateDirectory),
      DEV_DASHBOARD_SELF_UPDATE_RUNTIME_DIR: activePaths.runtimeDirectory,
    },
  });

  try {
    const ready = await waitUntilReady(activePaths);
    child.unref();
    return { status: 'started', ...ready };
  } catch (error) {
    if (typeof child.pid === 'number') {
      try {
        process.kill(child.pid, 'SIGTERM');
      } catch {
        // O processo pode ter encerrado antes da limpeza.
      }
    }
    throw error;
  }
}

export async function stopAgent({ paths } = {}) {
  const activePaths = paths ?? resolveSelfUpdateAgentPaths();
  let current;
  try {
    current = await pingAgent(activePaths);
  } catch (error) {
    if (isUnavailableError(error)) return { status: 'already-stopped' };
    throw error;
  }

  if (!Number.isSafeInteger(current.pid) || current.pid <= 1) {
    throw new SelfUpdateAgentError(
      'AGENT_IDENTITY_INVALID',
      'Agent respondeu com PID inválido; encerramento recusado.',
    );
  }

  process.kill(current.pid, 'SIGTERM');
  await waitUntilStopped(activePaths);
  return { status: 'stopped', instanceId: current.instanceId };
}

export async function agentStatus({ paths } = {}) {
  const activePaths = paths ?? resolveSelfUpdateAgentPaths();
  try {
    const current = await pingAgent(activePaths);
    return { status: 'running', ...current };
  } catch (error) {
    if (isUnavailableError(error)) return { status: 'stopped' };
    throw error;
  }
}

async function serveInstalledAgent({ paths } = {}) {
  const activePaths = paths ?? resolveSelfUpdateAgentPaths();
  const installation = await assertAgentEntrypointInstalled(
    fileURLToPath(import.meta.url),
    activePaths,
  );
  const token = await readSelfUpdateAgentToken(activePaths);
  const runtime = await startSelfUpdateAgentServer({
    paths: activePaths,
    token,
    release: installation.release,
  });

  await new Promise((resolve, reject) => {
    let closing = false;
    const shutdown = async () => {
      if (closing) return;
      closing = true;
      try {
        await runtime.close();
        resolve();
      } catch (error) {
        reject(error);
      }
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  });
}

async function requestAgent(action, handoffId, paths) {
  const activePaths = paths ?? resolveSelfUpdateAgentPaths();
  const token = await readSelfUpdateAgentToken(activePaths);
  return await sendSelfUpdateAgentRequest(action, {
    paths: activePaths,
    token,
    ...(handoffId ? { handoffId } : {}),
  });
}

export async function runSelfUpdateAgent(
  argv,
  { paths, stdout = process.stdout, stderr = process.stderr } = {},
) {
  const [command, ...args] = argv;

  try {
    if (!command || command === 'help') {
      if (args.length !== 0) throw new Error('help não aceita argumentos.');
      stdout.write(`${usage()}\n`);
      return 0;
    }

    if (command === 'install') {
      if (args.length !== 0) throw new Error('install não aceita argumentos.');
      const installation = await installAgent({ paths });
      printJson(
        {
          status: 'installed',
          release: installation.release,
          entrypoint: installation.entrypoint,
        },
        stdout,
      );
      return 0;
    }

    if (command === 'start') {
      if (args.length !== 0) throw new Error('start não aceita argumentos.');
      printJson(await startAgent({ paths }), stdout);
      return 0;
    }

    if (command === 'stop') {
      if (args.length !== 0) throw new Error('stop não aceita argumentos.');
      printJson(await stopAgent({ paths }), stdout);
      return 0;
    }

    if (command === 'status') {
      if (args.length !== 0) throw new Error('status não aceita argumentos.');
      printJson(await agentStatus({ paths }), stdout);
      return 0;
    }

    if (command === 'ping' || command === 'recover') {
      if (args.length !== 0) {
        throw new Error(`${command} não aceita argumentos.`);
      }
      printJson(await requestAgent(command, undefined, paths), stdout);
      return 0;
    }

    if (command === 'inspect' || command === 'claim') {
      if (args.length !== 1) {
        throw new Error(`${command} exige exatamente um handoff-id.`);
      }
      printJson(await requestAgent(command, args[0], paths), stdout);
      return 0;
    }

    if (command === 'serve') {
      if (args.length !== 0) throw new Error('serve não aceita argumentos.');
      await serveInstalledAgent({ paths });
      return 0;
    }

    stderr.write(`${usage()}\n`);
    return 2;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Falha desconhecida.';
    stderr.write(`Self-update agent: ${message}\n`);
    return 1;
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  process.exitCode = await runSelfUpdateAgent(process.argv.slice(2));
}
