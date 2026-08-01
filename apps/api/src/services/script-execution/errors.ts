export type ScriptExecutionErrorCode =
  | 'SCRIPT_NOT_FOUND'
  | 'SCRIPT_DISABLED'
  | 'SCRIPT_CONFIRMATION_REQUIRED'
  | 'SCRIPT_ALREADY_RUNNING'
  | 'SCRIPT_EXECUTION_NOT_FOUND'
  | 'SCRIPT_MANAGER_AMBIGUOUS'
  | 'SCRIPT_MANAGER_NOT_FOUND'
  | 'SCRIPT_SUBSCRIBER_LIMIT';

export class ScriptExecutionError extends Error {
  public constructor(
    public readonly code: ScriptExecutionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ScriptExecutionError';
  }
}
