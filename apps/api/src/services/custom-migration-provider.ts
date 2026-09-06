import { execFile } from 'node:child_process';

import type { Project, ProjectType } from '@dev-dashboard/contracts';

import type {
  MigrationInspectionContext,
  MigrationOverview,
  MigrationOverviewStatus,
  MigrationProvider,
} from './migration-provider.js';

const COMMAND_TIMEOUT_MS = 10_000;
const COMMAND_MAX_BUFFER_BYTES = 256 * 1024;
const MAX_ARGS = 32;
const MAX_ARG_LENGTH = 512;
const SAFE_PROVIDER_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;
const SAFE_PROGRAM = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/u;
const SAFE_DATABASE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const FORBIDDEN_PROGRAMS = new Set([
  'bash',
  'cmd',
  'cmd.exe',
  'fish',
  'powershell',
  'powershell.exe',
  'pwsh',
  'sh',
  'zsh',
]);

export interface CustomMigrationCommand {
  program: string;
  args: readonly string[];
}

export interface CustomMigrationProviderConfig {
  id: string;
  command: CustomMigrationCommand;
  projectIds?: readonly string[];
  projectTypes?: readonly ProjectType[];
  upToDateExitCodes: readonly number[];
  pendingExitCodes: readonly number[];
  unavailableExitCodes?: readonly number[];
}

export interface CustomMigrationStatusResult {
  exitCode: number;
}

export type CustomMigrationStatusRunner = (
  command: CustomMigrationCommand,
  projectPath: string,
) => Promise<CustomMigrationStatusResult>;

function databaseIdentity(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized && SAFE_DATABASE_ID.test(normalized)
    ? normalized
    : 'primary';
}

function normalizedExitCodes(
  name: string,
  values: readonly number[] | undefined,
): ReadonlySet<number> {
  const result = new Set<number>();
  for (const value of values ?? []) {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new Error(`${name} contém exit code inválido.`);
    }
    result.add(value);
  }
  return result;
}

function validateCommand(command: CustomMigrationCommand): CustomMigrationCommand {
  const program = command.program.trim();
  if (
    !SAFE_PROGRAM.test(program) ||
    FORBIDDEN_PROGRAMS.has(program.toLowerCase())
  ) {
    throw new Error('Programa custom inválido ou não permitido.');
  }
  if (command.args.length > MAX_ARGS) {
    throw new Error('Comando custom excede o limite de argumentos.');
  }

  const args = command.args.map((argument) => {
    if (
      argument.length > MAX_ARG_LENGTH ||
      argument.includes('\0') ||
      argument.includes('\n') ||
      argument.includes('\r')
    ) {
      throw new Error('Argumento custom inválido.');
    }
    return argument;
  });

  return { program, args };
}

function defaultStatusRunner(
  command: CustomMigrationCommand,
  projectPath: string,
): Promise<CustomMigrationStatusResult> {
  return new Promise((resolve, reject) => {
    execFile(
      command.program,
      [...command.args],
      {
        cwd: projectPath,
        encoding: 'utf8',
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: COMMAND_MAX_BUFFER_BYTES,
        windowsHide: true,
      },
      (error) => {
        if (error && typeof (error as { code?: unknown }).code === 'string') {
          reject(error);
          return;
        }
        const exitCode =
          error && typeof (error as { code?: unknown }).code === 'number'
            ? (error as { code: number }).code
            : error
              ? 1
              : 0;
        resolve({ exitCode });
      },
    );
  });
}

function ensureDisjoint(
  groups: ReadonlyArray<readonly [string, ReadonlySet<number>]>,
): void {
  const owners = new Map<number, string>();
  for (const [name, codes] of groups) {
    for (const code of codes) {
      const previous = owners.get(code);
      if (previous) {
        throw new Error(
          `Exit code ${code} não pode significar ${previous} e ${name}.`,
        );
      }
      owners.set(code, name);
    }
  }
}

function normalizeSelectors(config: CustomMigrationProviderConfig): {
  projectIds: ReadonlySet<string>;
  projectTypes: ReadonlySet<ProjectType>;
} {
  const projectIds = new Set(
    (config.projectIds ?? []).map((value) => value.trim()).filter(Boolean),
  );
  const projectTypes = new Set(config.projectTypes ?? []);
  if (projectIds.size === 0 && projectTypes.size === 0) {
    throw new Error(
      'Provider custom precisa declarar projectIds e/ou projectTypes.',
    );
  }
  return { projectIds, projectTypes };
}

export class CustomMigrationProvider implements MigrationProvider {
  public readonly id: string;
  private readonly command: CustomMigrationCommand;
  private readonly projectIds: ReadonlySet<string>;
  private readonly projectTypes: ReadonlySet<ProjectType>;
  private readonly upToDateExitCodes: ReadonlySet<number>;
  private readonly pendingExitCodes: ReadonlySet<number>;
  private readonly unavailableExitCodes: ReadonlySet<number>;

  public constructor(
    config: CustomMigrationProviderConfig,
    private readonly runStatus: CustomMigrationStatusRunner = defaultStatusRunner,
  ) {
    const id = config.id.trim();
    if (!SAFE_PROVIDER_ID.test(id)) {
      throw new Error('ID de provider custom inválido.');
    }

    this.id = id;
    this.command = validateCommand(config.command);
    const selectors = normalizeSelectors(config);
    this.projectIds = selectors.projectIds;
    this.projectTypes = selectors.projectTypes;
    this.upToDateExitCodes = normalizedExitCodes(
      'upToDateExitCodes',
      config.upToDateExitCodes,
    );
    this.pendingExitCodes = normalizedExitCodes(
      'pendingExitCodes',
      config.pendingExitCodes,
    );
    this.unavailableExitCodes = normalizedExitCodes(
      'unavailableExitCodes',
      config.unavailableExitCodes,
    );
    if (this.upToDateExitCodes.size === 0) {
      throw new Error('Provider custom precisa provar ao menos up-to-date.');
    }
    ensureDisjoint([
      ['up-to-date', this.upToDateExitCodes],
      ['pending', this.pendingExitCodes],
      ['unavailable', this.unavailableExitCodes],
    ]);
  }

  public supports(project: Project): boolean {
    return this.projectIds.has(project.id) || this.projectTypes.has(project.type);
  }

  private statusForExitCode(exitCode: number): MigrationOverviewStatus {
    if (this.upToDateExitCodes.has(exitCode)) return 'up-to-date';
    if (this.pendingExitCodes.has(exitCode)) return 'pending';
    if (this.unavailableExitCodes.has(exitCode)) return 'unavailable';
    return 'unknown';
  }

  public async inspect(
    context: MigrationInspectionContext,
  ): Promise<MigrationOverview> {
    const observedAt = (context.now ?? (() => new Date()))().toISOString();
    const database = databaseIdentity(context.database);
    const evidence = `custom:${this.id}:status`;

    if (!this.supports(context.project)) {
      return {
        provider: this.id,
        status: 'unavailable',
        database,
        applied: [],
        pending: [],
        observedAt,
        evidence,
        warnings: ['O provider custom não foi declarado para este projeto.'],
      };
    }

    let result: CustomMigrationStatusResult;
    try {
      result = await this.runStatus(this.command, context.project.path);
    } catch {
      return {
        provider: this.id,
        status: 'unavailable',
        database,
        applied: [],
        pending: [],
        observedAt,
        evidence,
        warnings: [
          'O comando de status do provider custom não pôde ser executado.',
        ],
      };
    }

    const status = this.statusForExitCode(result.exitCode);
    return {
      provider: this.id,
      status,
      database,
      applied: [],
      pending: [],
      observedAt,
      evidence,
      warnings:
        status === 'pending'
          ? [
              'O provider declarou migrations pendentes por exit code; detalhes individuais não foram inferidos de texto livre.',
            ]
          : status === 'unknown'
            ? [
                `Exit code ${result.exitCode} não possui semântica declarada neste provider.`,
              ]
            : [],
    };
  }
}
