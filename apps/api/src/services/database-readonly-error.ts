export type DatabaseReadonlyErrorReason =
  | 'unsupported-driver'
  | 'remote-host'
  | 'invalid-connection'
  | 'invalid-query'
  | 'client-unavailable'
  | 'credentials-rejected'
  | 'connection-failed'
  | 'database-unavailable'
  | 'command-failed'
  | 'aborted';

export class DatabaseReadonlyError extends Error {
  public constructor(
    public readonly reason: DatabaseReadonlyErrorReason,
    message: string,
  ) {
    super(message);
    this.name = 'DatabaseReadonlyError';
  }
}
