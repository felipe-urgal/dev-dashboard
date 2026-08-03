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
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export async function resolveRailsCommand(project: Project): Promise<RailsCommand | null> {
  if (project.type !== 'rails') return null;
  // Projetos que rodam o Rails dentro do Docker costumam expor um wrapper (`bin/docker-rails`,
  // seguindo a mesma convenção de `bin/rails`) que decide entre `compose exec`/`compose run --rm`
  // e repassa os argumentos. Preferimos esse wrapper quando existe: rodar `bin/rails` direto no
  // host falharia (gems vivem só na imagem) ou usaria um ambiente local desalinhado do container.
  if (await pathExists(path.join(project.path, 'bin', 'docker-rails'))) {
    return { command: path.join(project.path, 'bin', 'docker-rails'), args: [] };
  }
  if (await pathExists(path.join(project.path, 'bin', 'rails'))) {
    return { command: path.join(project.path, 'bin', 'rails'), args: [] };
  }
  if (!(await pathExists(path.join(project.path, 'Gemfile')))) return null;
  return { command: 'bundle', args: ['exec', 'rails'] };
}
