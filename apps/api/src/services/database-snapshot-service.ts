import { execFile, spawn } from 'node:child_process';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { createGunzip, createGzip } from 'node:zlib';

import type {
  DatabaseSnapshot,
  DatabaseSnapshotConfirmation,
  DatabaseSnapshotDriver,
  DatabaseSnapshotList,
  Project,
} from '@dev-dashboard/contracts';

import type { DatabaseDetectionService, DetectedDatabase } from './database-detection-service.js';

export const DATABASE_SNAPSHOT_RETENTION = 10;
export const DATABASE_SNAPSHOT_CONFIRMATION_TTL_MS = 60_000;
/** Teto de segurança para não encher o disco com um dump inesperado. */
export const DATABASE_SNAPSHOT_MAX_BYTES = 512 * 1024 * 1024;
const DUMP_TIMEOUT_MS = 10 * 60_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type DatabaseSnapshotErrorCode =
  | 'DATABASE_ENVIRONMENT_NOT_FOUND'
  | 'DATABASE_SNAPSHOT_UNSUPPORTED'
  | 'DATABASE_SNAPSHOT_TOOL_MISSING'
  | 'DATABASE_SNAPSHOT_NOT_FOUND'
  | 'DATABASE_SNAPSHOT_FAILED'
  | 'DATABASE_SNAPSHOT_TOO_LARGE'
  | 'DATABASE_RESTORE_CONFIRMATION_REQUIRED'
  | 'DATABASE_RESTORE_FAILED';

export class DatabaseSnapshotError extends Error {
  public constructor(public readonly code: DatabaseSnapshotErrorCode, message: string) {
    super(message);
    this.name = 'DatabaseSnapshotError';
  }
}

interface SnapshotConnection {
  driver: DatabaseSnapshotDriver;
  host: string;
  port?: number;
  username: string;
  password: string;
  database: string;
}

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

const DUMP_BINARIES: Record<DatabaseSnapshotDriver, string> = {
  mysql: 'mysqldump',
  postgresql: 'pg_dump',
};

const RESTORE_BINARIES: Record<DatabaseSnapshotDriver, string> = {
  mysql: 'mysql',
  postgresql: 'psql',
};

function snapshotDriver(driver: string): DatabaseSnapshotDriver | null {
  const normalized = driver.toLowerCase();
  if (['mysql', 'mysql2', 'mariadb'].includes(normalized)) return 'mysql';
  if (['postgres', 'postgresql', 'postgis'].includes(normalized)) return 'postgresql';
  return null;
}

/** Traduz a falha de spawn mais comum: cliente do banco ausente no PATH. */
function spawnFailure(binary: string, error: unknown): DatabaseSnapshotError {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'ENOENT') {
    return new DatabaseSnapshotError(
      'DATABASE_SNAPSHOT_TOOL_MISSING',
      `'${binary}' não está disponível no PATH. Instale o cliente do banco para usar snapshots.`,
    );
  }
  return new DatabaseSnapshotError(
    'DATABASE_SNAPSHOT_FAILED',
    error instanceof Error ? error.message : `Falha ao executar '${binary}'.`,
  );
}

/**
 * Monta os dados de conexão a partir do que a detecção já conhece. O navegador
 * nunca envia host, usuário, senha ou banco — só o id do ambiente.
 */
function connectionFor(environment: DetectedDatabase): SnapshotConnection {
  const driver = snapshotDriver(environment.driver);
  if (!driver) {
    throw new DatabaseSnapshotError(
      'DATABASE_SNAPSHOT_UNSUPPORTED',
      `Snapshot é suportado apenas para MySQL e PostgreSQL (adaptador: ${environment.driver}).`,
    );
  }

  let username = environment.username ?? '';
  let password = '';
  let database = environment.database ?? '';
  let host = environment.host ?? 'localhost';
  let port = environment.port;

  if (environment.databaseUrl) {
    try {
      const url = new URL(environment.databaseUrl);
      if (url.username) username = decodeURIComponent(url.username);
      if (url.password) password = decodeURIComponent(url.password);
      if (url.hostname) host = url.hostname;
      if (url.port) port = Number(url.port);
      const fromPath = decodeURIComponent(url.pathname.slice(1));
      if (fromPath) database = fromPath;
    } catch {
      // A URL detectada é apenas uma das fontes; os campos avulsos seguem valendo.
    }
  }

  if (!database) {
    throw new DatabaseSnapshotError(
      'DATABASE_SNAPSHOT_UNSUPPORTED',
      'Não foi possível determinar o nome do banco de dados deste ambiente.',
    );
  }

  return { driver, host, ...(port ? { port } : {}), username, password, database };
}

function dumpArguments(connection: SnapshotConnection): string[] {
  if (connection.driver === 'mysql') {
    return [
      '-h', connection.host,
      ...(connection.port ? ['-P', String(connection.port)] : []),
      ...(connection.username ? ['-u', connection.username] : []),
      connection.database,
    ];
  }
  return [
    '-h', connection.host,
    ...(connection.port ? ['-p', String(connection.port)] : []),
    ...(connection.username ? ['-U', connection.username] : []),
    '--no-owner',
    '--no-privileges',
    connection.database,
  ];
}

function restoreArguments(connection: SnapshotConnection): string[] {
  if (connection.driver === 'mysql') {
    return [
      '-h', connection.host,
      ...(connection.port ? ['-P', String(connection.port)] : []),
      ...(connection.username ? ['-u', connection.username] : []),
      connection.database,
    ];
  }
  return [
    '-h', connection.host,
    ...(connection.port ? ['-p', String(connection.port)] : []),
    ...(connection.username ? ['-U', connection.username] : []),
    '-q',
    '-v', 'ON_ERROR_STOP=1',
    connection.database,
  ];
}

function passwordEnvironment(connection: SnapshotConnection): NodeJS.ProcessEnv {
  if (!connection.password) return {};
  return connection.driver === 'mysql'
    ? { MYSQL_PWD: connection.password }
    : { PGPASSWORD: connection.password };
}

function normalizeLabel(value: string): string {
  const normalized = value
    .toLocaleLowerCase('en')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return normalized || 'manual';
}

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

    return snapshots.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  private async currentBranch(projectPath: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', ['branch', '--show-current'], {
        cwd: projectPath,
        encoding: 'utf8',
        timeout: 5_000,
      });
      return stdout.trim();
    } catch {
      return '';
    }
  }

  public async list(project: Project): Promise<DatabaseSnapshotList> {
    const environments = await this.detectionService.detect(project);
    const supportedEnvironmentIds = environments
      .filter((environment) => snapshotDriver(environment.driver) !== null && Boolean(environment.database))
      .map((environment) => environment.id);

    const stored = await this.readStored(project.id);
    return {
      snapshots: stored.map(({ file: _file, ...snapshot }) => snapshot),
      total: stored.length,
      retentionLimit: DATABASE_SNAPSHOT_RETENTION,
      supportedEnvironmentIds,
    };
  }

  public async create(project: Project, environmentId: string): Promise<DatabaseSnapshot> {
    const environment = (await this.detectionService.detect(project))
      .find((candidate) => candidate.id === environmentId);
    if (!environment) {
      throw new DatabaseSnapshotError('DATABASE_ENVIRONMENT_NOT_FOUND', 'Configuração de banco não encontrada.');
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

    await writeFile(path.join(directory, `${id}.json`), JSON.stringify(snapshot, null, 2), { mode: 0o600 });
    await this.applyRetention(project.id);
    return snapshot;
  }

  private async runDump(binary: string, connection: SnapshotConnection, file: string): Promise<void> {
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
        pipeline(child.stdout, createGzip(), createWriteStream(file, { mode: 0o600 })),
        new Promise<void>((resolve, reject) => {
          child.once('error', (error) => reject(spawnFailure(binary, error)));
          child.once('close', (code) => {
            if (tooLarge) {
              reject(new DatabaseSnapshotError(
                'DATABASE_SNAPSHOT_TOO_LARGE',
                'O dump excedeu o limite de 512 MB e foi interrompido.',
              ));
              return;
            }
            if (code === 0) resolve();
            else reject(new DatabaseSnapshotError('DATABASE_SNAPSHOT_FAILED', stderr.trim() || `${binary} terminou com código ${code}.`));
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

  public async prepareRestore(project: Project, snapshotId: string): Promise<DatabaseSnapshotConfirmation> {
    const snapshot = (await this.readStored(project.id)).find((item) => item.id === snapshotId);
    if (!snapshot) {
      throw new DatabaseSnapshotError('DATABASE_SNAPSHOT_NOT_FOUND', 'Snapshot não encontrado.');
    }

    this.pruneExpiredRestores();
    const token = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + DATABASE_SNAPSHOT_CONFIRMATION_TTL_MS;
    this.pendingRestores.set(token, { token, projectId: project.id, snapshotId, expiresAt });

    return { token, snapshotId, expiresAt: new Date(expiresAt).toISOString() };
  }

  private consumeConfirmation(projectId: string, snapshotId: string, token: string): void {
    this.pruneExpiredRestores();
    const pending = this.pendingRestores.get(token);
    const expected = pending
      && pending.projectId === projectId
      && pending.snapshotId === snapshotId
      && pending.expiresAt > Date.now();

    if (!pending || !expected) {
      throw new DatabaseSnapshotError(
        'DATABASE_RESTORE_CONFIRMATION_REQUIRED',
        'Confirmação inválida ou expirada. Peça a restauração novamente.',
      );
    }

    const provided = Buffer.from(token);
    const stored = Buffer.from(pending.token);
    if (provided.length !== stored.length || !timingSafeEqual(provided, stored)) {
      throw new DatabaseSnapshotError(
        'DATABASE_RESTORE_CONFIRMATION_REQUIRED',
        'Confirmação inválida ou expirada. Peça a restauração novamente.',
      );
    }

    // Confirmação é de uso único.
    this.pendingRestores.delete(token);
  }

  public async restore(project: Project, snapshotId: string, confirmationToken: string): Promise<void> {
    const snapshot = (await this.readStored(project.id)).find((item) => item.id === snapshotId);
    if (!snapshot) {
      throw new DatabaseSnapshotError('DATABASE_SNAPSHOT_NOT_FOUND', 'Snapshot não encontrado.');
    }

    this.consumeConfirmation(project.id, snapshotId, confirmationToken);

    const environment = (await this.detectionService.detect(project))
      .find((candidate) => candidate.id === snapshot.environmentId);
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

  private async runRestore(binary: string, connection: SnapshotConnection, file: string): Promise<void> {
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
            else reject(new DatabaseSnapshotError('DATABASE_RESTORE_FAILED', stderr.trim() || `${binary} terminou com código ${code}.`));
          });
        }),
      ]);
    } catch (error) {
      if (error instanceof DatabaseSnapshotError) throw error;
      throw new DatabaseSnapshotError(
        'DATABASE_RESTORE_FAILED',
        error instanceof Error ? error.message : 'Falha ao restaurar o snapshot.',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
