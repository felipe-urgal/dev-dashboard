import { access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import type { Project } from '@dev-dashboard/contracts';

export type CommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string },
) => Promise<{ stdout: string; stderr?: string }>;

const execFileAsync = promisify(execFile);
export const defaultCommandRunner: CommandRunner = async (command, args, options) => {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024,
    timeout: 20_000,
    windowsHide: true,
  });

  // Alguns wrappers Docker encaminham a saída normal do Rails para stderr.
  // A inspeção trata ambos os streams como uma única saída textual para não
  // perder migrations, rotas ou diagnósticos válidos.
  return {
    stdout: [stdout, stderr].filter(Boolean).join('\n'),
  };
};

export interface RailsCommand {
  command: string;
  args: string[];
  runtime: 'local' | 'docker';
}

export type RailsExecutionRuntime = 'auto' | RailsCommand['runtime'];

export async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function localRailsCommand(project: Project): Promise<RailsCommand | null> {
  if (await pathExists(path.join(project.path, 'bin', 'rails'))) {
    return { command: path.join(project.path, 'bin', 'rails'), args: [], runtime: 'local' };
  }
  if (!(await pathExists(path.join(project.path, 'Gemfile')))) return null;
  return { command: 'bundle', args: ['exec', 'rails'], runtime: 'local' };
}

async function dockerRailsCommand(project: Project): Promise<RailsCommand | null> {
  if (!(await pathExists(path.join(project.path, 'bin', 'docker-rails')))) return null;
  return { command: path.join(project.path, 'bin', 'docker-rails'), args: [], runtime: 'docker' };
}

/**
 * Retorna comandos compatíveis com o runtime solicitado. Em `auto`, preserva a
 * preferência histórica pelo wrapper Docker, mas mantém o comando local como
 * fallback para inspeções somente leitura.
 */
export async function resolveRailsCommands(
  project: Project,
  runtime: RailsExecutionRuntime = 'auto',
): Promise<RailsCommand[]> {
  if (project.type !== 'rails') return [];
  const [local, docker] = await Promise.all([
    localRailsCommand(project),
    dockerRailsCommand(project),
  ]);
  if (runtime === 'local') return local ? [local] : [];
  if (runtime === 'docker') return docker ? [docker] : [];
  return [docker, local].filter((command): command is RailsCommand => command !== null);
}

export async function resolveRailsCommand(
  project: Project,
  runtime: RailsExecutionRuntime = 'auto',
): Promise<RailsCommand | null> {
  return (await resolveRailsCommands(project, runtime))[0] ?? null;
}
