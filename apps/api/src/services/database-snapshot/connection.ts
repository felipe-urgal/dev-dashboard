import type { DatabaseSnapshotDriver } from '@dev-dashboard/contracts';

import type { DetectedDatabase } from '../database-detection-service.js';
import { DatabaseSnapshotError } from './errors.js';

export interface SnapshotConnection {
  driver: DatabaseSnapshotDriver;
  host: string;
  port?: number;
  username: string;
  password: string;
  database: string;
}

export function snapshotDriver(driver: string): DatabaseSnapshotDriver | null {
  const normalized = driver.toLowerCase();
  if (['mysql', 'mysql2', 'mariadb'].includes(normalized)) return 'mysql';
  if (['postgres', 'postgresql', 'postgis'].includes(normalized))
    return 'postgresql';
  return null;
}

/**
 * Monta os dados de conexão a partir do que a detecção já conhece. O navegador
 * nunca envia host, usuário, senha ou banco — só o id do ambiente.
 */
export function connectionFor(
  environment: DetectedDatabase,
): SnapshotConnection {
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

  return {
    driver,
    host,
    ...(port ? { port } : {}),
    username,
    password,
    database,
  };
}

export function dumpArguments(connection: SnapshotConnection): string[] {
  if (connection.driver === 'mysql') {
    return [
      '-h',
      connection.host,
      ...(connection.port ? ['-P', String(connection.port)] : []),
      ...(connection.username ? ['-u', connection.username] : []),
      connection.database,
    ];
  }
  return [
    '-h',
    connection.host,
    ...(connection.port ? ['-p', String(connection.port)] : []),
    ...(connection.username ? ['-U', connection.username] : []),
    '--no-owner',
    '--no-privileges',
    connection.database,
  ];
}

export function restoreArguments(connection: SnapshotConnection): string[] {
  if (connection.driver === 'mysql') {
    return [
      '-h',
      connection.host,
      ...(connection.port ? ['-P', String(connection.port)] : []),
      ...(connection.username ? ['-u', connection.username] : []),
      connection.database,
    ];
  }
  return [
    '-h',
    connection.host,
    ...(connection.port ? ['-p', String(connection.port)] : []),
    ...(connection.username ? ['-U', connection.username] : []),
    '-q',
    '-v',
    'ON_ERROR_STOP=1',
    connection.database,
  ];
}

export function passwordEnvironment(
  connection: SnapshotConnection,
): NodeJS.ProcessEnv {
  if (!connection.password) return {};
  return connection.driver === 'mysql'
    ? { MYSQL_PWD: connection.password }
    : { PGPASSWORD: connection.password };
}
