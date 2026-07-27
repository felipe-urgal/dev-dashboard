import { randomBytes } from 'node:crypto';
import { access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { maskSensitiveLogContent } from '@dev-dashboard/process-manager';
import type {
  Project,
  RailsMigrationEntry,
  RailsMigrationMutationConfirmation,
  RailsMigrationMutationOperation,
  RailsMigrationMutationResult,
  RailsMigrationsOverview,
  RailsRouteEntry,
  RailsRoutesOverview,
} from '@dev-dashboard/contracts';

type CommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string },
) => Promise<{ stdout: string; stderr?: string }>;

const execFileAsync = promisify(execFile);
const defaultCommandRunner: CommandRunner = async (command, args, options) => {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024,
    timeout: 20_000,
    windowsHide: true,
  });
  return { stdout, stderr };
};

export type RailsMutationErrorCode = 'RAILS_MUTATION_UNSUPPORTED' | 'RAILS_MUTATION_CONFIRMATION_REQUIRED';

export class RailsMutationError extends Error {
  public constructor(public readonly code: RailsMutationErrorCode, message: string) {
    super(message);
    this.name = 'RailsMutationError';
  }
}

const MUTATION_CONFIRMATION_TTL_MS = 60_000;
const MUTATION_OUTPUT_LIMIT = 262_144;

const MUTATION_ARGS: Record<RailsMigrationMutationOperation, string[]> = {
  migrate: ['db:migrate'],
  rollback: ['db:rollback', 'STEP=1'],
  seed: ['db:seed'],
  prepare: ['db:prepare'],
};

interface StoredMutationConfirmation {
  token: string;
  projectId: string;
  operation: RailsMigrationMutationOperation;
  expiresAt: number;
}

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
  private readonly mutationConfirmations = new Map<string, StoredMutationConfirmation>();

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

  public async prepareMutationConfirmation(
    project: Project,
    operation: RailsMigrationMutationOperation,
  ): Promise<RailsMigrationMutationConfirmation> {
    if (!(await resolveRailsCommand(project))) {
      throw new RailsMutationError('RAILS_MUTATION_UNSUPPORTED', 'Não encontramos Rails neste projeto (bin/rails ou Gemfile com Rails).');
    }
    this.pruneExpiredConfirmations();
    const token = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + MUTATION_CONFIRMATION_TTL_MS;
    this.mutationConfirmations.set(token, { token, projectId: project.id, operation, expiresAt });
    return { token, operation, expiresAt: new Date(expiresAt).toISOString() };
  }

  public async runMutation(
    project: Project,
    operation: RailsMigrationMutationOperation,
    confirmationToken: string | undefined,
  ): Promise<RailsMigrationMutationResult> {
    this.consumeMutationConfirmation(project.id, operation, confirmationToken);

    const railsCommand = await resolveRailsCommand(project);
    if (!railsCommand) {
      throw new RailsMutationError('RAILS_MUTATION_UNSUPPORTED', 'Não encontramos Rails neste projeto (bin/rails ou Gemfile com Rails).');
    }

    let succeeded = true;
    let rawOutput = '';
    try {
      const { stdout, stderr } = await this.runCommand(
        railsCommand.command,
        [...railsCommand.args, ...MUTATION_ARGS[operation]],
        { cwd: project.path },
      );
      rawOutput = [stdout, stderr].filter(Boolean).join('\n');
    } catch (error) {
      succeeded = false;
      const failure = error as { stdout?: unknown; stderr?: unknown; message?: unknown };
      rawOutput = [failure.stdout, failure.stderr]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .join('\n') || (typeof failure.message === 'string' ? failure.message : 'Falha ao executar o comando.');
    }

    const truncated = rawOutput.length > MUTATION_OUTPUT_LIMIT;
    const trimmed = truncated ? rawOutput.slice(0, MUTATION_OUTPUT_LIMIT) : rawOutput;
    const masked = maskSensitiveLogContent(trimmed);

    return {
      operation,
      succeeded,
      output: masked.content,
      truncated,
      masked: masked.masked,
      redactionCount: masked.redactionCount,
    };
  }

  private consumeMutationConfirmation(
    projectId: string,
    operation: RailsMigrationMutationOperation,
    token: string | undefined,
  ): void {
    this.pruneExpiredConfirmations();
    const record = token ? this.mutationConfirmations.get(token) : undefined;
    if (!record || record.projectId !== projectId || record.operation !== operation) {
      throw new RailsMutationError('RAILS_MUTATION_CONFIRMATION_REQUIRED', 'Confirmação obrigatória para esta operação.');
    }
    this.mutationConfirmations.delete(token!);
  }

  private pruneExpiredConfirmations(): void {
    const now = Date.now();
    for (const [token, record] of this.mutationConfirmations) {
      if (record.expiresAt <= now) this.mutationConfirmations.delete(token);
    }
  }
}
