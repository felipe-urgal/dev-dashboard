export type ProcessManagerErrorCode =
  | 'PROCESS_ALREADY_RUNNING'
  | 'PROCESS_NOT_FOUND'
  | 'PROCESS_IDENTITY_MISMATCH'
  | 'PROJECT_SERVER_UNSUPPORTED'
  | 'PROJECT_SCRIPT_NOT_FOUND'
  | 'INVALID_PORT'
  | 'PORT_NOT_AVAILABLE'
  | 'INVALID_LOG_LIMIT'
  | 'PROCESS_STOP_TIMEOUT';

export class ProcessManagerError extends Error {
  public readonly code: ProcessManagerErrorCode;

  public constructor(code: ProcessManagerErrorCode, message: string) {
    super(message);

    this.name = 'ProcessManagerError';
    this.code = code;
  }
}

export function isErrnoException(
  error: unknown,
): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
