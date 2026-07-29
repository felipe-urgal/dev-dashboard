import { randomBytes } from 'node:crypto';
import { access, readdir, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { maskSensitiveLogContent } from '@dev-dashboard/process-manager';
import type {
  Project,
  RailsMigrationDetail,
  RailsMigrationEntry,
  RailsMigrationMutationConfirmation,
  RailsMigrationMutationOperation,
  RailsMigrationMutationResult,
  RailsMigrationsOverview,
  RailsModelsOverview,
  RailsRouteEntry,
  RailsRoutesOverview,
  RailsSchemaColumn,
  RailsSchemaForeignKey,
  RailsSchemaIndex,
  RailsSchemaTable,
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
const MIGRATION_SOURCE_LIMIT = 262_144;

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

function readOption(options: string, name: string): string | undefined {
  const expression = new RegExp(`(?:^|,\\s*)${name}:\\s*(.+?)(?=,\\s*[a-zA-Z_]+:|$)`);
  return options.match(expression)?.[1]?.trim();
}

function readStringOption(options: string, name: string): string | undefined {
  const value = readOption(options, name);
  if (!value) return undefined;
  return value.replace(/^:["']?/, '').replace(/["']$/, '');
}

function readNumberOption(options: string, name: string): number | undefined {
  const value = readOption(options, name);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function singularize(table: string): string {
  if (table.endsWith('ies')) return `${table.slice(0, -3)}y`;
  if (table.endsWith('ses')) return table.slice(0, -2);
  if (table.endsWith('s')) return table.slice(0, -1);
  return table;
}

function parseQuotedList(value: string): string[] {
  return [...value.matchAll(/["']([^"']+)["']/g)].map((match) => match[1] ?? '').filter(Boolean);
}

function parseSchema(source: string): RailsSchemaTable[] {
  const tables: RailsSchemaTable[] = [];
  const foreignKeys: RailsSchemaForeignKey[] = [];
  let current: RailsSchemaTable | null = null;

  for (const line of source.split(/\r?\n/)) {
    const createMatch = line.match(/^\s*create_table\s+["']([^"']+)["'](.*?)do\s+\|t\|\s*$/);
    if (createMatch) {
      const [, tableName = '', options = ''] = createMatch;
      current = { name: tableName, columns: [], indexes: [], foreignKeys: [] };
      if (!/\bid:\s*false\b/.test(options)) {
        const idType = readStringOption(options, 'id') ?? 'bigint';
        current.columns.push({ name: 'id', type: idType, nullable: false, primaryKey: true });
      }
      tables.push(current);
      continue;
    }

    if (current && /^\s*end\s*$/.test(line)) {
      current = null;
      continue;
    }

    if (current) {
      const indexMatch = line.match(/^\s*t\.index\s+\[([^\]]*)\](.*)$/);
      if (indexMatch) {
        const [, rawColumns = '', options = ''] = indexMatch;
        const index: RailsSchemaIndex = {
          columns: parseQuotedList(rawColumns),
          unique: /\bunique:\s*true\b/.test(options),
        };
        const name = readStringOption(options, 'name');
        if (name) index.name = name;
        current.indexes.push(index);
        continue;
      }

      const columnMatch = line.match(/^\s*t\.(\w+)\s+["']([^"']+)["'](.*)$/);
      if (columnMatch) {
        const [, method = 'string', rawName = '', options = ''] = columnMatch;
        const reference = method === 'references' || method === 'belongs_to';
        const column: RailsSchemaColumn = {
          name: reference ? `${rawName}_id` : rawName,
          type: reference ? 'bigint' : method,
          nullable: !/\bnull:\s*false\b/.test(options),
          primaryKey: false,
        };
        const defaultValue = readOption(options, 'default');
        const limit = readNumberOption(options, 'limit');
        const precision = readNumberOption(options, 'precision');
        const scale = readNumberOption(options, 'scale');
        if (defaultValue !== undefined) column.default = defaultValue;
        if (limit !== undefined) column.limit = limit;
        if (precision !== undefined) column.precision = precision;
        if (scale !== undefined) column.scale = scale;
        current.columns.push(column);
        continue;
      }
    }

    const foreignKeyMatch = line.match(/^\s*add_foreign_key\s+["']([^"']+)["']\s*,\s*["']([^"']+)["'](.*)$/);
    if (foreignKeyMatch) {
      const [, fromTable = '', toTable = '', options = ''] = foreignKeyMatch;
      const relation: RailsSchemaForeignKey = {
        fromTable,
        toTable,
        column: readStringOption(options, 'column') ?? `${singularize(toTable)}_id`,
      };
      const primaryKey = readStringOption(options, 'primary_key');
      const name = readStringOption(options, 'name');
      if (primaryKey) relation.primaryKey = primaryKey;
      if (name) relation.name = name;
      foreignKeys.push(relation);
    }
  }

  for (const relation of foreignKeys) {
    tables.find((table) => table.name === relation.fromTable)?.foreignKeys.push(relation);
  }

  return tables;
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

  public async getMigrationDetail(project: Project, version: string): Promise<RailsMigrationDetail> {
    if (!/^\d{8,20}$/.test(version)) {
      return { supported: false, version, truncated: false };
    }

    const overview = await this.getMigrationsOverview(project);
    const entry = overview.migrations.find((migration) => migration.version === version);
    const migrationsDirectory = path.join(project.path, 'db', 'migrate');

    let fileName: string | undefined;
    try {
      fileName = (await readdir(migrationsDirectory))
        .filter((candidate) => candidate.startsWith(`${version}_`) && candidate.endsWith('.rb'))
        .sort()[0];
    } catch {
      fileName = undefined;
    }

    if (!entry && !fileName) {
      return { supported: false, version, truncated: false };
    }

    let source: string | undefined;
    let truncated = false;
    if (fileName) {
      try {
        const rawSource = await readFile(path.join(migrationsDirectory, fileName), 'utf8');
        truncated = rawSource.length > MIGRATION_SOURCE_LIMIT;
        source = truncated ? rawSource.slice(0, MIGRATION_SOURCE_LIMIT) : rawSource;
      } catch {
        source = undefined;
      }
    }

    return {
      supported: true,
      version,
      ...(entry?.name ? { name: entry.name } : {}),
      ...(entry?.status ? { status: entry.status } : {}),
      ...(fileName ? { filePath: path.posix.join('db', 'migrate', fileName) } : {}),
      ...(source !== undefined ? { source } : {}),
      truncated,
    };
  }

  public async getModelsOverview(project: Project): Promise<RailsModelsOverview> {
    if (project.type !== 'rails') return { supported: false, tables: [] };
    const schemaPath = path.join(project.path, 'db', 'schema.rb');
    if (!(await pathExists(schemaPath))) return { supported: false, tables: [] };

    try {
      const source = await readFile(schemaPath, 'utf8');
      return {
        supported: true,
        schemaPath: 'db/schema.rb',
        tables: parseSchema(source),
      };
    } catch {
      return { supported: false, tables: [] };
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
