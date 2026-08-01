import { randomBytes } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { maskSensitiveLogContent } from '@dev-dashboard/process-manager';
import type {
  Project,
  RailsGeneratorConfirmation,
  RailsGeneratorField,
  RailsGeneratorKind,
  RailsGeneratorResult,
  RailsMigrationDetail,
  RailsMigrationMutationConfirmation,
  RailsMigrationMutationOperation,
  RailsMigrationMutationResult,
  RailsMigrationsOverview,
  RailsModelsOverview,
  RailsRoutesOverview,
} from '@dev-dashboard/contracts';

import {
  defaultCommandRunner,
  pathExists,
  resolveRailsCommand,
  type CommandRunner,
} from './rails-inspection/command-resolution.js';
import {
  GENERATOR_CONFIRMATION_TTL_MS,
  MIGRATION_SOURCE_LIMIT,
  MUTATION_ARGS,
  MUTATION_CONFIRMATION_TTL_MS,
  MUTATION_OUTPUT_LIMIT,
} from './rails-inspection/constants.js';
import { listDatabases } from './rails-inspection/databases.js';
import { RailsMutationError } from './rails-inspection/errors.js';
import {
  buildGeneratorArgs,
  parseGeneratorCreatedFiles,
  type StoredGeneratorConfirmation,
} from './rails-inspection/generator.js';
import {
  matchMigrationStatusBlock,
  migrationsDirectory,
  parseMigrationStatusBlocks,
} from './rails-inspection/migrations-parsing.js';
import { parseRoutes } from './rails-inspection/routes-parsing.js';
import { parseSchema } from './rails-inspection/schema-parsing.js';

export { RailsMutationError } from './rails-inspection/errors.js';
export type { RailsMutationErrorCode } from './rails-inspection/errors.js';

interface StoredMutationConfirmation {
  token: string;
  projectId: string;
  operation: RailsMigrationMutationOperation;
  expiresAt: number;
}

export class RailsInspectionService {
  private readonly mutationConfirmations = new Map<string, StoredMutationConfirmation>();
  private readonly generatorConfirmations = new Map<string, StoredGeneratorConfirmation>();

  public constructor(private readonly runCommand: CommandRunner = defaultCommandRunner) {}

  public async getMigrationsOverview(project: Project, database = 'primary'): Promise<RailsMigrationsOverview> {
    const databases = await listDatabases(project);
    const selected = databases.includes(database) ? database : 'primary';
    const railsCommand = await resolveRailsCommand(project);
    if (!railsCommand) return { supported: false, databases, migrations: [] };

    try {
      const { stdout } = await this.runCommand(
        railsCommand.command,
        [...railsCommand.args, 'db:migrate:status'],
        { cwd: project.path },
      );
      const blocks = parseMigrationStatusBlocks(stdout);
      const block = matchMigrationStatusBlock(blocks, databases, selected);
      return { supported: true, databases, ...(block.database ? { database: block.database } : {}), migrations: block.migrations };
    } catch {
      return { supported: false, databases, migrations: [] };
    }
  }

  public async getMigrationDetail(project: Project, version: string, database = 'primary'): Promise<RailsMigrationDetail> {
    if (!/^\d{8,20}$/.test(version)) {
      return { supported: false, version, truncated: false };
    }

    const databases = await listDatabases(project);
    const selected = databases.includes(database) ? database : 'primary';
    const overview = await this.getMigrationsOverview(project, selected);
    const entry = overview.migrations.find((migration) => migration.version === version);
    const migrateDir = migrationsDirectory(project.path, selected);

    let fileName: string | undefined;
    try {
      fileName = (await readdir(migrateDir))
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
        const rawSource = await readFile(path.join(migrateDir, fileName), 'utf8');
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
      ...(fileName ? { filePath: path.posix.join('db', path.basename(migrateDir), fileName) } : {}),
      ...(source !== undefined ? { source } : {}),
      truncated,
    };
  }

  public async getModelsOverview(project: Project, database = 'primary'): Promise<RailsModelsOverview> {
    if (project.type !== 'rails') return { supported: false, databases: [], tables: [] };
    const databases = await listDatabases(project);
    const selected = databases.includes(database) ? database : 'primary';
    const fileName = selected === 'primary' ? 'schema.rb' : `${selected}_schema.rb`;
    const schemaPath = path.join(project.path, 'db', fileName);
    if (!(await pathExists(schemaPath))) return { supported: false, databases, tables: [] };

    try {
      const source = await readFile(schemaPath, 'utf8');
      return {
        databases,
        supported: true,
        schemaPath: path.posix.join('db', fileName),
        tables: parseSchema(source),
      };
    } catch {
      return { supported: false, databases, tables: [] };
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

  public async prepareGeneratorConfirmation(
    project: Project,
    kind: RailsGeneratorKind,
    name: string,
    fields: RailsGeneratorField[],
    database?: string,
  ): Promise<RailsGeneratorConfirmation> {
    if (!(await resolveRailsCommand(project))) {
      throw new RailsMutationError('RAILS_GENERATOR_UNSUPPORTED', 'Não encontramos Rails neste projeto (bin/rails ou Gemfile com Rails).');
    }
    if (database && database !== 'primary' && !(await listDatabases(project)).includes(database)) {
      throw new RailsMutationError('RAILS_GENERATOR_INVALID_INPUT', `Banco "${database}" não foi encontrado neste projeto.`);
    }
    const effectiveDatabase = database && database !== 'primary' ? database : undefined;
    const args = buildGeneratorArgs(kind, name, fields, effectiveDatabase);

    this.pruneExpiredGeneratorConfirmations();
    const token = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + GENERATOR_CONFIRMATION_TTL_MS;
    this.generatorConfirmations.set(token, {
      token, projectId: project.id, kind, name, fields, ...(effectiveDatabase ? { database: effectiveDatabase } : {}), args, expiresAt,
    });
    return {
      token, kind, name, fields, ...(effectiveDatabase ? { database: effectiveDatabase } : {}),
      command: ['rails', ...args].join(' '),
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  public async runGenerator(project: Project, confirmationToken: string | undefined): Promise<RailsGeneratorResult> {
    const record = this.consumeGeneratorConfirmation(project.id, confirmationToken);
    const railsCommand = await resolveRailsCommand(project);
    if (!railsCommand) {
      throw new RailsMutationError('RAILS_GENERATOR_UNSUPPORTED', 'Não encontramos Rails neste projeto (bin/rails ou Gemfile com Rails).');
    }

    let succeeded = true;
    let rawOutput = '';
    try {
      const { stdout, stderr } = await this.runCommand(
        railsCommand.command,
        [...railsCommand.args, ...record.args],
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
      kind: record.kind,
      name: record.name,
      succeeded,
      createdFiles: parseGeneratorCreatedFiles(masked.content),
      output: masked.content,
      truncated,
      masked: masked.masked,
      redactionCount: masked.redactionCount,
    };
  }

  private consumeGeneratorConfirmation(projectId: string, token: string | undefined): StoredGeneratorConfirmation {
    this.pruneExpiredGeneratorConfirmations();
    const record = token ? this.generatorConfirmations.get(token) : undefined;
    if (!record || record.projectId !== projectId) {
      throw new RailsMutationError('RAILS_GENERATOR_CONFIRMATION_REQUIRED', 'Confirmação obrigatória para esta operação.');
    }
    this.generatorConfirmations.delete(token!);
    return record;
  }

  private pruneExpiredGeneratorConfirmations(): void {
    const now = Date.now();
    for (const [token, record] of this.generatorConfirmations) {
      if (record.expiresAt <= now) this.generatorConfirmations.delete(token);
    }
  }
}
