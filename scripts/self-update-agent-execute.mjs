#!/usr/bin/env node

import { realpath } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  SelfUpdateExecutionError,
  SelfUpdateExecutor,
} from './self-update-agent.mjs';
import {
  resolveSelfUpdateAgentPaths,
  sendSelfUpdateAgentRequest,
} from './self-update-agent-runtime.mjs';

export const ROOT_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const HANDOFF_ID_PATTERN = /^self-update-[0-9a-f-]{36}$/;

export async function delegateAcceptedHandoffExecution({
  handoffId,
  paths = resolveSelfUpdateAgentPaths(),
  repositoryRoot = ROOT_DIRECTORY,
  executor,
} = {}) {
  if (typeof handoffId !== 'string' || !HANDOFF_ID_PATTERN.test(handoffId)) {
    throw new SelfUpdateExecutionError(
      'SELF_UPDATE_HANDOFF_ID_INVALID',
      'Identificador do handoff de self-update é inválido.',
    );
  }

  const handoff = await sendSelfUpdateAgentRequest('inspect', {
    paths,
    handoffId,
  });
  if (handoff?.status !== 'accepted') {
    throw new SelfUpdateExecutionError(
      'SELF_UPDATE_HANDOFF_NOT_ACCEPTED',
      'Handoff precisa ser aceito pelo agent antes de iniciar execução.',
    );
  }

  const canonicalRoot = await realpath(repositoryRoot);
  if (canonicalRoot !== path.resolve(repositoryRoot)) {
    throw new SelfUpdateExecutionError(
      'SELF_UPDATE_REPOSITORY_INVALID',
      'Checkout do self-update não pode depender de symlink.',
    );
  }

  const activeExecutor =
    executor ?? new SelfUpdateExecutor({ repositoryRoot: canonicalRoot });
  await activeExecutor.preflight(handoff.targetRevision);

  return await sendSelfUpdateAgentRequest('execute', {
    paths,
    handoffId,
    repositoryRoot: canonicalRoot,
  });
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1) {
    process.stderr.write(
      'Uso: node scripts/self-update-agent-execute.mjs <handoff-id>\n',
    );
    return 2;
  }

  try {
    const result = await delegateAcceptedHandoffExecution({
      handoffId: argv[0],
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Falha desconhecida.';
    process.stderr.write(`Self-update execution: ${message}\n`);
    return 1;
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  process.exitCode = await main();
}
