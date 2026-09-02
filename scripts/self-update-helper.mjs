#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { SelfUpdateHandoffStore } from './self-update-handoff.mjs';

function usage() {
  return [
    'Uso:',
    '  node scripts/self-update-helper.mjs prepare --project-id <id> --revision <sha> --plan-hash <hash>',
    '  node scripts/self-update-helper.mjs claim <handoff-id>',
    '  node scripts/self-update-helper.mjs inspect <handoff-id>',
    '  node scripts/self-update-helper.mjs recover',
    '',
    'Este helper ainda não aplica atualização, não reinicia serviços e não executa ações privilegiadas.',
  ].join('\n');
}

function parseOptions(args, knownOptions) {
  const parsed = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!option?.startsWith('--')) {
      throw new Error(`Argumento posicional inesperado: ${String(option)}.`);
    }
    if (!knownOptions.has(option)) {
      throw new Error(`Opção desconhecida: ${option}.`);
    }
    if (!value || value.startsWith('--')) {
      throw new Error(`Valor ausente para ${option}.`);
    }
    if (parsed.has(option)) {
      throw new Error(`Opção repetida: ${option}.`);
    }
    parsed.set(option, value);
  }
  return parsed;
}

function printJson(value, stdout) {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export async function runSelfUpdateHelper(
  argv,
  {
    store = new SelfUpdateHandoffStore(),
    stdout = process.stdout,
    stderr = process.stderr,
  } = {},
) {
  const [command, ...args] = argv;

  try {
    if (command === 'prepare') {
      const options = parseOptions(
        args,
        new Set(['--project-id', '--revision', '--plan-hash']),
      );
      const projectId = options.get('--project-id');
      const targetRevision = options.get('--revision');
      const planHash = options.get('--plan-hash');
      if (!projectId || !targetRevision || !planHash || options.size !== 3) {
        throw new Error('prepare exige project-id, revision e plan-hash.');
      }
      const handoff = await store.prepare({
        projectId,
        targetRevision,
        planHash,
      });
      printJson(handoff, stdout);
      return 0;
    }

    if (command === 'claim') {
      if (args.length !== 1) {
        throw new Error('claim exige exatamente um handoff-id.');
      }
      const handoff = await store.claim(args[0]);
      printJson(handoff, stdout);
      return 0;
    }

    if (command === 'inspect') {
      if (args.length !== 1) {
        throw new Error('inspect exige exatamente um handoff-id.');
      }
      const handoff = await store.get(args[0]);
      if (!handoff) throw new Error('Handoff de self-update não encontrado.');
      printJson(handoff, stdout);
      return 0;
    }

    if (command === 'recover') {
      if (args.length !== 0) throw new Error('recover não aceita argumentos.');
      const recovered = await store.recoverInterrupted();
      printJson(
        {
          recovered: recovered.length,
          handoffIds: recovered.map((handoff) => handoff.id),
        },
        stdout,
      );
      return 0;
    }

    stderr.write(`${usage()}\n`);
    return 2;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Falha desconhecida.';
    stderr.write(`Self-update helper: ${message}\n`);
    return 1;
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  process.exitCode = await runSelfUpdateHelper(process.argv.slice(2));
}
