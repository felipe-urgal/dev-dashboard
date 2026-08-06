import { access, readFile } from 'node:fs/promises';

import path from 'node:path';

import type { Project } from '@dev-dashboard/contracts';

import { ProcessManagerError } from './errors.js';

export interface ResolvedCommand {
  command: string;
  args: string[];
  env: Record<string, string>;
}

interface PackageManifest {
  scripts?: Record<string, string>;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readPackageManifest(
  projectPath: string,
): Promise<PackageManifest | null> {
  try {
    const contents = await readFile(
      path.join(projectPath, 'package.json'),
      'utf8',
    );

    const parsed: unknown = JSON.parse(contents);

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }

    const candidate = parsed as Record<string, unknown>;

    if (
      typeof candidate.scripts !== 'object' ||
      candidate.scripts === null ||
      Array.isArray(candidate.scripts)
    ) {
      return {};
    }

    const scripts = Object.fromEntries(
      Object.entries(candidate.scripts).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );

    return {
      scripts,
    };
  } catch {
    return null;
  }
}

type NodePackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

async function resolveNodePackageManager(
  projectPath: string,
): Promise<NodePackageManager> {
  if (await pathExists(path.join(projectPath, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }

  if (await pathExists(path.join(projectPath, 'yarn.lock'))) {
    return 'yarn';
  }

  if (
    (await pathExists(path.join(projectPath, 'bun.lock'))) ||
    (await pathExists(path.join(projectPath, 'bun.lockb')))
  ) {
    return 'bun';
  }

  return 'npm';
}

async function resolveNodeCommand(
  project: Project,
  host: string,
  port: number,
): Promise<ResolvedCommand> {
  const manifest = await readPackageManifest(project.path);

  const scripts = manifest?.scripts ?? {};

  const scriptName = ['dev', 'start', 'serve'].find(
    (candidate) => candidate in scripts,
  );

  if (!scriptName) {
    throw new ProcessManagerError(
      'PROJECT_SCRIPT_NOT_FOUND',
      `Nenhum script dev, start ou serve foi encontrado em ${project.name}.`,
    );
  }

  const packageManager = await resolveNodePackageManager(project.path);

  const scriptCommand = scripts[scriptName] ?? '';
  const forwardedArgs: string[] = [];

  if (/\b(vite|nuxt|astro)\b/i.test(scriptCommand)) {
    forwardedArgs.push('--host', host, '--port', String(port));
  } else if (/\bnext\b/i.test(scriptCommand)) {
    forwardedArgs.push('--hostname', host, '--port', String(port));
  }

  // npm exige `--` para encaminhar opções ao script. pnpm, Yarn e
  // Bun encaminham os argumentos diretamente; incluir `--` nesses
  // gerenciadores faz frameworks como Next interpretarem a opção
  // seguinte como o diretório do projeto.
  const args = [
    'run',
    scriptName,
    ...(forwardedArgs.length === 0
      ? []
      : packageManager === 'npm'
        ? ['--', ...forwardedArgs]
        : forwardedArgs),
  ];

  return {
    command: packageManager,
    args,
    env: {
      PORT: String(port),
      HOST: host,
      ...(packageManager === 'pnpm'
        ? {
            // O processo é destacado e não possui TTY. pnpm precisa
            // receber uma confirmação não interativa quando decide
            // recriar node_modules antes de executar predev/dev.
            CI: 'true',
            pnpm_config_confirmModulesPurge: 'false',
          }
        : {}),
    },
  };
}

async function resolveRailsCommand(
  project: Project,
  host: string,
  port: number,
): Promise<ResolvedCommand> {
  const railsExecutable = path.join(project.path, 'bin', 'rails');

  if (await pathExists(railsExecutable)) {
    return {
      command: railsExecutable,
      args: ['server', '--binding', host, '--port', String(port)],
      env: {},
    };
  }

  return {
    command: 'bundle',
    args: [
      'exec',
      'rails',
      'server',
      '--binding',
      host,
      '--port',
      String(port),
    ],
    env: {},
  };
}

export async function resolveServerCommand(
  project: Project,
  host: string,
  port: number,
): Promise<ResolvedCommand> {
  switch (project.type) {
    case 'rails':
      return await resolveRailsCommand(project, host, port);

    case 'node':
      return await resolveNodeCommand(project, host, port);

    default:
      throw new ProcessManagerError(
        'PROJECT_SERVER_UNSUPPORTED',
        `O projeto ${project.name} não possui servidor suportado.`,
      );
  }
}
