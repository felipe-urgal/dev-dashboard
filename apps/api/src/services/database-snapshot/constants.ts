import type { DatabaseSnapshotDriver } from '@dev-dashboard/contracts';

export const DATABASE_SNAPSHOT_RETENTION = 10;
export const DATABASE_SNAPSHOT_CONFIRMATION_TTL_MS = 60_000;
/** Teto de segurança para não encher o disco com um dump inesperado. */
export const DATABASE_SNAPSHOT_MAX_BYTES = 512 * 1024 * 1024;
export const DUMP_TIMEOUT_MS = 10 * 60_000;
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const DUMP_BINARIES: Record<DatabaseSnapshotDriver, string> = {
  mysql: 'mysqldump',
  postgresql: 'pg_dump',
};

export const RESTORE_BINARIES: Record<DatabaseSnapshotDriver, string> = {
  mysql: 'mysql',
  postgresql: 'psql',
};
