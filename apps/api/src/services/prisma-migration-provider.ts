import { execFile } from 'node:child_process';
import { lstatSync, mkdirSync, realpathSync } from 'node:fs';
import path from 'node:path';

import type { Project } from '@dev-dashboard/contracts';

import type {
  MigrationInspectionContext,
  MigrationOverview,
  MigrationProvider,
} from './migration-provider.js';

const COMMAND_TIMEOUT_MS = 10_000;
const COMMAND_MAX_BUFFER_BYTES = 512 * 1024;
const SAFE_DATABASE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const SCHEMA_CANDIDATES = ['prisma/schema.prisma', 'schema.prisma'] as const;

export interface PrismaStatusResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type PrismaStatusRunner = (
  projectPath: string,
  schemaFile: string,
) => Promise<PrismaStatusResult>;

function databaseIdentity(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized && SAFE_DATABASE_ID.test(normalized) ? normalized : 'primary';
}

function safeSchema(projectPath: string): string | undefined {
  let root: string;
  try {
    root = realpathSync(projectPath);
  } catch {
    return undefined;
  }

  for (const relative of SCHEMA_CANDIDATES) {
    const candidate = path.resolve(root, relative);
    try {
      const stat = lstatSync(candidate);
      if (!stat.isFile() || stat.isSymbolicLink()) continue;
      const real = realpathSync(candidate);
      if (!real.startsWith(`${root}${path.sep}`)) continue;
      return path.relative(root, real).replaceAll('\\', '/');
    } catch {
      // Candidato ausente: tenta a próxima convenção conhecida.
    }
  }
  return undefined;
}

function defaultStatusRunner(
  projectPath: string,
  schemaFile: string,
): Promise<PrismaStatusResult> {
  return new Promise((resolve, reject) => {
    execFile(
      'npx',
      ['--no-install', 'prisma', 'migrate', 'status', '--schema', schemaFile],
      {
        cwd: projectPath,
        encoding: 'utf8',
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: COMMAND_MAX_BUFFER_BYTES,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error && typeof (error as { code?: unknown }).code === 'string') {
          reject(error);
          return;
        }
        const code = error && typeof (error as { code?: unknown }).code === 'number'
          ? (error as { code: number }).code
          : error
            ? 1
            : 0;
        resolve({ exitCode: code, stdout, stderr });
      },
    );
  });
}

function hasPrismaConnectionError(result: PrismaStatusResult): boolean {
  const text = `${result.stdout}\n${result.stderr}`;
  return /\bP1001\b/u.test(text);
}

export class PrismaMigrationProvider implements MigrationProvider {
  public readonly id = 'prisma';

  public constructor(private readonly runStatus: PrismaStatusRunner = defaultStatusRunner) {}

  public supports(project: Project): boolean {
    return project.type === 'node' && safeSchema(project.path) !== undefined;
  }

  public async inspect(
    context: MigrationInspectionContext,
  ): Promise<MigrationOverview> {
    const observedAt = (context.now ?? (() => new Date()))().toISOString();
    const database = databaseIdentity(context.database);
    const schemaFile = context.project.type === 'node'
      ? safeSchema(context.project.path)
      : undefined;

    if (!schemaFile) {
      return {
        provider: this.id,
        status: 'unavailable',
        database,
        applied: [],
        pending: [],
        observedAt,
        evidence: 'Prisma schema não detectado.',
        warnings: ['O provider Prisma não se aplica a este projeto.'],
      };
    }

    let result: PrismaStatusResult;
    try {
      result = await this.runStatus(context.project.path, schemaFile);
    } catch {
      return {
        provider: this.id,
        status: 'unavailable',
        database,
        applied: [],
        pending: [],
        observedAt,
        evidence: 'prisma migrate status',
        warnings: ['Prisma CLI não pôde ser executado neste ambiente.'],
      };
    }

    if (result.exitCode === 0) {
      return {
        provider: this.id,
        status: 'up-to-date',
        database,
        applied: [],
        pending: [],
        observedAt,
        evidence: 'prisma migrate status',
        warnings: [],
      };
    }

    if (hasPrismaConnectionError(result)) {
      return {
        provider: this.id,
        status: 'unavailable',
        database,
        applied: [],
        pending: [],
        observedAt,
        evidence: 'prisma migrate status',
        warnings: ['O banco configurado pelo Prisma não está alcançável.'],
      };
    }

    return {
      provider: this.id,
      status: 'unknown',
      database,
      applied: [],
      pending: [],
      observedAt,
      evidence: 'prisma migrate status',
      warnings: [
        'Prisma migrate status terminou sem prova suficiente para classificar migrations pendentes com segurança.',
      ],
    };
  }
}

// Mantém o módulo sem efeitos colaterais de criação de diretório; referência usada
// apenas para impedir otimizações/tooling de sugerirem filesystem mutável neste provider.
void mkdirSync;
