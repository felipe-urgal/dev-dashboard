#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MANIFEST_URL = new URL('../.dev-dashboard/production.json', import.meta.url);
const AGENT_PATH = fileURLToPath(
  new URL('./self-update-agent.mjs', import.meta.url),
);
const MAX_AGENT_OUTPUT_BYTES = 64 * 1024;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function loadEnabledContract() {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_URL, 'utf8'));
  } catch {
    throw new Error('Contrato de self-production não pôde ser lido.');
  }

  const production = manifest?.production;
  const commands = production?.commands;
  const policies = production?.policies;
  if (
    manifest?.version !== 1 ||
    !isRecord(production) ||
    production.enabled !== true ||
    production.strategy !== 'self-update' ||
    production.provider !== 'none' ||
    production.branch !== 'main' ||
    production.reasonCode !== undefined ||
    production.blockedBy !== undefined ||
    production.external !== undefined ||
    !isRecord(commands) ||
    Object.keys(commands).length !== 2 ||
    commands.status !== 'prod:status' ||
    commands.check !== 'prod:check' ||
    !isRecord(policies) ||
    policies.backup !== 'not-configured' ||
    policies.migrations !== 'not-configured' ||
    policies.rollback !== 'not-configured'
  ) {
    throw new Error(
      'Contrato self-update não corresponde ao perfil fechado aprovado para o Dev Dashboard.',
    );
  }

  return production;
}

function inspectAgent(runner) {
  const result = runner(process.execPath, [AGENT_PATH, 'ping'], {
    encoding: 'utf8',
    shell: false,
    timeout: 5_000,
    maxBuffer: MAX_AGENT_OUTPUT_BYTES,
  });
  if (result.error || result.status !== 0) {
    return {
      ready: false,
      message: 'Self-update agent local não está pronto.',
    };
  }

  let ping;
  try {
    ping = JSON.parse(result.stdout ?? '');
  } catch {
    return {
      ready: false,
      message: 'Self-update agent retornou uma resposta inválida.',
    };
  }

  if (
    !isRecord(ping) ||
    ping.status !== 'ready' ||
    typeof ping.instanceId !== 'string' ||
    ping.instanceId.length === 0 ||
    !Array.isArray(ping.actions) ||
    !ping.actions.includes('claim') ||
    !ping.actions.includes('inspect')
  ) {
    return {
      ready: false,
      message: 'Self-update agent não comprovou claim + inspect.',
    };
  }

  return { ready: true, ping };
}

export function runProductionGate(
  argv,
  {
    runner = spawnSync,
    stdout = process.stdout,
    stderr = process.stderr,
  } = {},
) {
  const mode = argv[0] ?? 'check';
  if (mode !== 'status' && mode !== 'check') {
    stderr.write('Uso: node scripts/production-gate.mjs <status|check>\n');
    return 2;
  }

  try {
    loadEnabledContract();
  } catch (error) {
    stderr.write(
      `${error instanceof Error ? error.message : 'Contrato de self-production inválido.'}\n`,
    );
    return 1;
  }

  const agent = inspectAgent(runner);
  if (mode === 'status') {
    stdout.write('Self-production do Dev Dashboard está habilitada por contrato.\n');
    stdout.write(
      agent.ready
        ? 'Self-update agent: pronto.\n'
        : `Self-update agent: indisponível (${agent.message})\n`,
    );
    return 0;
  }

  if (!agent.ready) {
    stderr.write(`${agent.message}\n`);
    return 1;
  }

  stdout.write(
    'Self-production pronta: contrato fechado e self-update agent disponível.\n',
  );
  return 0;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;

if (invokedDirectly) {
  process.exitCode = runProductionGate(process.argv.slice(2));
}
