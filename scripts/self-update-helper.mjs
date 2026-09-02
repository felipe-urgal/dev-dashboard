#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { SelfUpdateHandoffStore } from './self-update-handoff.mjs';

function usage() {
  return [
    'Uso:',
    '  node scripts/self-update-helper.mjs prepare --project-id <id> --revision <sha> --plan-hash <hash> [--handoff-id <id>]',
    '  node scripts/self-update-helper.mjs claim <handoff-id>',
    '  node scripts/self-update-helper.mjs inspect <handoff-id>',
    '  node scripts/self-update-helper.mjs recover',
    '',
    'Este helper apenas persiste e consulta handoffs; a mutação pertence ao worker fechado do self-update agent.',
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
  { store, stdout = process.stdout, stderr = process.stderr } = {},
) {
  const [command, ...args] = argv;
  let activeStore = store;
  const getStore = () => {
    activeStore ??= new SelfUpdateHandoffStore();
    return activeStore;
  };

  try {
    if (!command || command === 'help') {
      if (args.length !== 0) throw new Error('help não aceita argumentos.');
      stdout.write(`${usage()}\n`);
      return 0;
    }

    if (command === 'prepare') {
      const options = parseOptions(
        args,
        new Set([
          '--project-id',
          '--revision',
          '--plan-hash',
          '--handoff-id',
        ]),
      );
      const projectId = options.get('--project-id');
      const targetRevision = options.get('--revision');
      const planHash = options.get('--plan-hash');
      const handoffId = options.get('--handoff-id');
      if (!projectId || !targetRevision || !planHash) {
        throw new Error('prepare exige project-id, revision e plan-hash.');
      }
      const handoff = await getStore().prepare({
        projectId,
        targetRevision,
        planHash,
        ...(handoffId ? { handoffId } : {}),
      });
      printJson(handoff, stdout);
      return 0;
    }

    if (command === 'claim') {
      if (args.length !== 1) {
        throw new Error('claim exige exatamente um handoff-id.');
      }
      const handoff = await getStore().claim(args[0]);
      printJson(handoff, stdout);
      return 0;
    }

    if (command === 'inspect') {
      if (args.length !== 1) {
        throw new Error('inspect exige exatamente um handoff-id.');
      }
      const handoff = await getStore().get(args[0]);
      if (!handoff) throw new Error('Handoff de self-update não encontrado.');
      printJson(handoff, stdout);
      return 0;
    }

    if (command === 'recover') {
      if (args.length !== 0) throw new Error('recover não aceita argumentos.');
      const recovered = await getStore().recoverInterrupted();
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
