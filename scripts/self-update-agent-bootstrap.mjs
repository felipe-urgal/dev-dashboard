#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AGENT_PATH = fileURLToPath(
  new URL('./self-update-agent.mjs', import.meta.url),
);
const TOOL_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 64 * 1024;

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
    installation.release.length === 0
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

export function ensureSelfUpdateAgentReady({
  runner = spawnSync,
  agentPath = AGENT_PATH,
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

  if (current?.release === installation.release) {
    return current;
  }

  if (current) {
    assertCommand(
      runAgent(['stop']),
      'Não foi possível reiniciar a release antiga do self-update agent.',
    );
  }

  assertCommand(
    runAgent(['start']),
    'Não foi possível iniciar o self-update agent local.',
  );

  const readyResult = runAgent(['ping']);
  const ready = readReady(readyResult);
  if (!ready) {
    throw new Error(
      safeMessage(
        readyResult.stderr,
        'Self-update agent não ficou pronto depois do preparo automático.',
      ),
    );
  }
  if (ready.release !== installation.release) {
    throw new Error(
      'Self-update agent iniciou uma release diferente da instalação preparada.',
    );
  }
  return ready;
}

export function runSelfUpdateAgentBootstrap(
  argv,
  { stdout = process.stdout, stderr = process.stderr, ensure = ensureSelfUpdateAgentReady } = {},
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
