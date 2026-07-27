import { access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import type {
  Project,
  RailsMigrationEntry,
  RailsMigrationsOverview,
  RailsRouteEntry,
  RailsRoutesOverview,
} from '@dev-dashboard/contracts';

type CommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string },
) => Promise<{ stdout: string }>;

const execFileAsync = promisify(execFile);
const defaultCommandRunner: CommandRunner = async (command, args, options) => {
  const { stdout } = await execFileAsync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024,
    timeout: 20_000,
    windowsHide: true,
  });
  return { stdout };
};

interface RailsCommand {
  command: string;
  args: string[];
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function resolveRailsCommand(project: Project): Promise<RailsCommand | null> {
  if (project.type !== 'rails') return null;
  if (await pathExists(path.join(project.path, 'bin', 'rails'))) {
    return { command: path.join(project.path, 'bin', 'rails'), args: [] };
  }
  if (!(await pathExists(path.join(project.path, 'Gemfile')))) return null;
  return { command: 'bundle', args: ['exec', 'rails'] };
}

const MIGRATION_ROW = /^\s*(up|down)\s+(\S+)\s+(.+?)\s*$/i;
const DATABASE_LINE = /^\s*database:\s*(.+?)\s*$/i;

function parseMigrationStatus(output: string): { database?: string; migrations: RailsMigrationEntry[] } {
  const migrations: RailsMigrationEntry[] = [];
  let database: string | undefined;

  for (const line of output.split(/\r?\n/)) {
    const databaseMatch = line.match(DATABASE_LINE);
    if (databaseMatch) {
      database = databaseMatch[1];
      continue;
    }
    const rowMatch = line.match(MIGRATION_ROW);
    if (!rowMatch) continue;
    const [, status, version, name] = rowMatch;
    migrations.push({
      status: (status ?? '').toLowerCase() as RailsMigrationEntry['status'],
      version: version ?? '',
      name: name ?? '',
    });
  }

  return { ...(database ? { database } : {}), migrations };
}

const ROUTE_VERBS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
const ROUTE_ROW = new RegExp(
  `^\\s*(?:([A-Za-z0-9_./]+)\\s+)?(${ROUTE_VERBS.join('|')})\\s+(\\S+)\\s+(.+?)\\s*$`,
);

function parseRoutes(output: string): RailsRouteEntry[] {
  const routes: RailsRouteEntry[] = [];

  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (/^-+$/.test(line.trim())) continue;
    if (/^\s*Prefix\s+Verb\s+URI Pattern/i.test(line)) continue;

    const match = line.match(ROUTE_ROW);
    if (!match) continue;
    const [, prefix, verb, uriPattern, controllerAction] = match;
    routes.push({
      ...(prefix ? { name: prefix } : {}),
      verb: verb ?? '',
      path: uriPattern ?? '',
      controllerAction: (controllerAction ?? '').trim(),
    });
  }

  return routes;
}

export class RailsInspectionService {
  public constructor(private readonly runCommand: CommandRunner = defaultCommandRunner) {}

  public async getMigrationsOverview(project: Project): Promise<RailsMigrationsOverview> {
    const railsCommand = await resolveRailsCommand(project);
    if (!railsCommand) return { supported: false, migrations: [] };

    try {
      const { stdout } = await this.runCommand(
        railsCommand.command,
        [...railsCommand.args, 'db:migrate:status'],
        { cwd: project.path },
      );
      return { supported: true, ...parseMigrationStatus(stdout) };
    } catch {
      return { supported: false, migrations: [] };
    }
  }

  public async getRoutesOverview(project: Project): Promise<RailsRoutesOverview> {
    const railsCommand = await resolveRailsCommand(project);
    if (!railsCommand) return { supported: false, routes: [] };

    try {
      const { stdout } = await this.runCommand(
        railsCommand.command,
        [...railsCommand.args, 'routes'],
        { cwd: project.path },
      );
      return { supported: true, routes: parseRoutes(stdout) };
    } catch {
      return { supported: false, routes: [] };
    }
  }
}
