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
