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
  return { stdout, stderr };
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
  if (await pathExists(path.join(project.path, 'bin', 'rails'))) {
    return { command: path.join(project.path, 'bin', 'rails'), args: [] };
  }
  if (!(await pathExists(path.join(project.path, 'Gemfile')))) return null;
  return { command: 'bundle', args: ['exec', 'rails'] };
}
