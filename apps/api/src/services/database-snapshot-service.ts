import { execFile, spawn } from 'node:child_process';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { createGunzip, createGzip } from 'node:zlib';

import type {
  DatabaseSnapshot,
  DatabaseSnapshotConfirmation,
  DatabaseSnapshotList,
  Project,
} from '@dev-dashboard/contracts';

import type { DatabaseDetectionService } from './database-detection-service.js';
import {
  connectionFor,
  dumpArguments,
  restoreArguments,
  passwordEnvironment,
  type SnapshotConnection,
} from './database-snapshot/connection.js';
import {
  DATABASE_SNAPSHOT_CONFIRMATION_TTL_MS,
  DATABASE_SNAPSHOT_MAX_BYTES,
  DATABASE_SNAPSHOT_RETENTION,
  DUMP_BINARIES,
  DUMP_TIMEOUT_MS,
  RESTORE_BINARIES,
  UUID_PATTERN,
} from './database-snapshot/constants.js';
import { DatabaseSnapshotError } from './database-snapshot/errors.js';
import {
  normalizeLabel,
  spawnFailure,
} from './database-snapshot/process-helpers.js';
import { snapshotDriver } from './database-snapshot/connection.js';

export {
  DATABASE_SNAPSHOT_RETENTION,
  DATABASE_SNAPSHOT_CONFIRMATION_TTL_MS,
  DATABASE_SNAPSHOT_MAX_BYTES,
} from './database-snapshot/constants.js';
export { DatabaseSnapshotError } from './database-snapshot/errors.js';
export type { DatabaseSnapshotErrorCode } from './database-snapshot/errors.js';

interface StoredSnapshot extends DatabaseSnapshot {
  file: string;
}

interface PendingRestore {
  token: string;
  projectId: string;
  snapshotId: string;
  expiresAt: number;
}

const execFileAsync = promisify(execFile);

export class DatabaseSnapshotService {
  private readonly pendingRestores = new Map<string, PendingRestore>();

  public constructor(
    private readonly detectionService: DatabaseDetectionService,
    private readonly stateDirectory: string,
  ) {}

  private projectDirectory(projectId: string): string {
    // O id vem do ProjectStore, mas o caminho é derivado por hash-safe slug
    // para nunca escapar do diretório de snapshots.
    const slug = projectId.replace(/[^a-zA-Z0-9._-]/g, '-');
    return path.join(this.stateDirectory, 'db-snapshots', slug);
  }

  private async readStored(projectId: string): Promise<StoredSnapshot[]> {
    const directory = this.projectDirectory(projectId);
    let entries: string[];
    try {
      entries = await readdir(directory);
    } catch {
      return [];
    }

    const snapshots: StoredSnapshot[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      try {
        const raw = await readFile(path.join(directory, entry), 'utf8');
        const parsed = JSON.parse(raw) as StoredSnapshot;
        if (!UUID_PATTERN.test(parsed.id)) continue;
        const dump = path.join(directory, `${parsed.id}.sql.gz`);
        const stats = await stat(dump);
        snapshots.push({ ...parsed, file: dump, sizeBytes: stats.size });
      } catch {
        // Metadado corrompido ou dump ausente: a entrada é ignorada.
      }
    }

    return snapshots.sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }

  private async currentBranch(projectPath: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['branch', '--show-current'],
        {
          cwd: projectPath,
          encoding: 'utf8',
          timeout: 5_000,
        },
      );
      return stdout.trim();
    } catch {
      return '';
    }
  }

  public async list(project: Project): Promise<DatabaseSnapshotList> {
    const environments = await this.detectionService.detect(project);
    const supportedEnvironmentIds = environments
      .filter(
        (environment) =>
          snapshotDriver(environment.driver) !== null &&
          Boolean(environment.database),
      )
      .map((environment) => environment.id);

    const stored = await this.readStored(project.id);
    return {
      snapshots: stored.map(({ file: _file, ...snapshot }) => snapshot),
      total: stored.length,
      retentionLimit: DATABASE_SNAPSHOT_RETENTION,
      supportedEnvironmentIds,
    };
  }

  public async create(
    project: Project,
    environmentId: string,
  ): Promise<DatabaseSnapshot> {
    const environment = (await this.detectionService.detect(project)).find(
      (candidate) => candidate.id === environmentId,
    );
    if (!environment) {
      throw new DatabaseSnapshotError(
        'DATABASE_ENVIRONMENT_NOT_FOUND',
        'Configuração de banco não encontrada.',
      );
    }

    const connection = connectionFor(environment);
    const binary = DUMP_BINARIES[connection.driver];
    const directory = this.projectDirectory(project.id);
    await mkdir(directory, { recursive: true, mode: 0o700 });

    const id = randomUUID();
    const file = path.join(directory, `${id}.sql.gz`);
    const label = normalizeLabel(await this.currentBranch(project.path));

    try {
      await this.runDump(binary, connection, file);
    } catch (error) {
      await rm(file, { force: true });
      if (error instanceof DatabaseSnapshotError) throw error;
      throw new DatabaseSnapshotError(
        'DATABASE_SNAPSHOT_FAILED',
        error instanceof Error ? error.message : 'Falha ao gerar o snapshot.',
      );
    }

    const stats = await stat(file);
    const snapshot: DatabaseSnapshot = {
      id,
      environmentId,
      environment: environment.environment,
      driver: connection.driver,
      database: connection.database,
      label,
      createdAt: new Date().toISOString(),
      sizeBytes: stats.size,
    };

    await writeFile(
      path.join(directory, `${id}.json`),
      JSON.stringify(snapshot, null, 2),
      { mode: 0o600 },
    );
    await this.applyRetention(project.id);
    return snapshot;
  }

  private async runDump(
    binary: string,
    connection: SnapshotConnection,
    file: string,
  ): Promise<void> {
    const child = spawn(binary, dumpArguments(connection), {
      shell: false,
      env: { ...process.env, ...passwordEnvironment(connection) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      // Mensagens de erro do cliente podem repetir credenciais: guardamos só o
      // suficiente para diagnosticar e nunca ecoamos o comando montado.
      if (stderr.length < 4_000) stderr += chunk.toString('utf8');
    });

    let written = 0;
    let tooLarge = false;
    child.stdout.on('data', (chunk: Buffer) => {
      written += chunk.length;
      if (written > DATABASE_SNAPSHOT_MAX_BYTES && !tooLarge) {
        tooLarge = true;
        child.kill('SIGKILL');
      }
    });

    const timer = setTimeout(() => child.kill('SIGKILL'), DUMP_TIMEOUT_MS);
    try {
      await Promise.all([
        pipeline(
          child.stdout,
          createGzip(),
          createWriteStream(file, { mode: 0o600 }),
        ),
        new Promise<void>((resolve, reject) => {
          child.once('error', (error) => reject(spawnFailure(binary, error)));
          child.once('close', (code) => {
            if (tooLarge) {
              reject(
                new DatabaseSnapshotError(
                  'DATABASE_SNAPSHOT_TOO_LARGE',
                  'O dump excedeu o limite de 512 MB e foi interrompido.',
                ),
              );
              return;
            }
            if (code === 0) resolve();
            else
              reject(
                new DatabaseSnapshotError(
                  'DATABASE_SNAPSHOT_FAILED',
                  stderr.trim() || `${binary} terminou com código ${code}.`,
                ),
              );
          });
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async applyRetention(projectId: string): Promise<void> {
    const stored = await this.readStored(projectId);
    const directory = this.projectDirectory(projectId);
    for (const snapshot of stored.slice(DATABASE_SNAPSHOT_RETENTION)) {
      await rm(path.join(directory, `${snapshot.id}.sql.gz`), { force: true });
      await rm(path.join(directory, `${snapshot.id}.json`), { force: true });
    }
  }

  private pruneExpiredRestores(): void {
    const now = Date.now();
    for (const [token, pending] of this.pendingRestores) {
      if (pending.expiresAt <= now) this.pendingRestores.delete(token);
    }
  }

  public async prepareRestore(
    project: Project,
    snapshotId: string,
  ): Promise<DatabaseSnapshotConfirmation> {
    const snapshot = (await this.readStored(project.id)).find(
      (item) => item.id === snapshotId,
    );
    if (!snapshot) {
      throw new DatabaseSnapshotError(
        'DATABASE_SNAPSHOT_NOT_FOUND',
        'Snapshot não encontrado.',
      );
    }

    this.pruneExpiredRestores();
    const token = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + DATABASE_SNAPSHOT_CONFIRMATION_TTL_MS;
    this.pendingRestores.set(token, {
      token,
      projectId: project.id,
      snapshotId,
      expiresAt,
    });

    return { token, snapshotId, expiresAt: new Date(expiresAt).toISOString() };
  }

  private consumeConfirmation(
    projectId: string,
    snapshotId: string,
    token: string,
  ): void {
    this.pruneExpiredRestores();
    const pending = this.pendingRestores.get(token);
    const expected =
      pending &&
      pending.projectId === projectId &&
      pending.snapshotId === snapshotId &&
      pending.expiresAt > Date.now();

    if (!pending || !expected) {
      throw new DatabaseSnapshotError(
        'DATABASE_RESTORE_CONFIRMATION_REQUIRED',
        'Confirmação inválida ou expirada. Peça a restauração novamente.',
      );
    }

    const provided = Buffer.from(token);
    const stored = Buffer.from(pending.token);
    if (
      provided.length !== stored.length ||
      !timingSafeEqual(provided, stored)
    ) {
      throw new DatabaseSnapshotError(
        'DATABASE_RESTORE_CONFIRMATION_REQUIRED',
        'Confirmação inválida ou expirada. Peça a restauração novamente.',
      );
    }

    // Confirmação é de uso único.
    this.pendingRestores.delete(token);
  }

  public async restore(
    project: Project,
    snapshotId: string,
    confirmationToken: string,
  ): Promise<void> {
    const snapshot = (await this.readStored(project.id)).find(
      (item) => item.id === snapshotId,
    );
    if (!snapshot) {
      throw new DatabaseSnapshotError(
        'DATABASE_SNAPSHOT_NOT_FOUND',
        'Snapshot não encontrado.',
      );
    }

    this.consumeConfirmation(project.id, snapshotId, confirmationToken);

    const environment = (await this.detectionService.detect(project)).find(
      (candidate) => candidate.id === snapshot.environmentId,
    );
    if (!environment) {
      throw new DatabaseSnapshotError(
        'DATABASE_ENVIRONMENT_NOT_FOUND',
        'O ambiente de banco deste snapshot não existe mais.',
      );
    }

    const connection = connectionFor(environment);
    const binary = RESTORE_BINARIES[connection.driver];
    await this.runRestore(binary, connection, snapshot.file);
  }

  private async runRestore(
    binary: string,
    connection: SnapshotConnection,
    file: string,
  ): Promise<void> {
    const child = spawn(binary, restoreArguments(connection), {
      shell: false,
      env: { ...process.env, ...passwordEnvironment(connection) },
      stdio: ['pipe', 'ignore', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 4_000) stderr += chunk.toString('utf8');
    });

    const timer = setTimeout(() => child.kill('SIGKILL'), DUMP_TIMEOUT_MS);
    try {
      await Promise.all([
        pipeline(createReadStream(file), createGunzip(), child.stdin),
        new Promise<void>((resolve, reject) => {
          child.once('error', (error) => reject(spawnFailure(binary, error)));
          child.once('close', (code) => {
            if (code === 0) resolve();
            else
              reject(
                new DatabaseSnapshotError(
                  'DATABASE_RESTORE_FAILED',
                  stderr.trim() || `${binary} terminou com código ${code}.`,
                ),
              );
          });
        }),
      ]);
    } catch (error) {
      if (error instanceof DatabaseSnapshotError) throw error;
      throw new DatabaseSnapshotError(
        'DATABASE_RESTORE_FAILED',
        error instanceof Error
          ? error.message
          : 'Falha ao restaurar o snapshot.',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
