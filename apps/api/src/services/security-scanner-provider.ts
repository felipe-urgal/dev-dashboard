import type { Project } from '@dev-dashboard/contracts';

export type SecurityScannerAvailabilityState =
  'available' | 'missing' | 'unavailable';

export interface SecurityScannerAvailability {
  state: SecurityScannerAvailabilityState;
  observedAt: string;
  version?: string;
  diagnostic?: string;
}

export type SecurityScanExecutionState =
  'completed' | 'failed' | 'invalid-output';

export interface SecurityScanExecution<TResult> {
  state: SecurityScanExecutionState;
  observedAt: string;
  result?: TResult;
  diagnostic?: string;
}

export interface SecurityScannerProvider<TResult> {
  readonly id: string;
  availability(): Promise<SecurityScannerAvailability>;
  scan(project: Project): Promise<SecurityScanExecution<TResult>>;
}
