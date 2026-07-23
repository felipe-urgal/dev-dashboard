export type ManagedProcessKind =
  'server' | 'webpack' | 'worker' | 'test' | 'script';

export type ManagedProcessStatus =
  'starting' | 'running' | 'stopping' | 'stopped' | 'failed';

export interface ManagedProcess {
  id: string;
  projectId: string;
  kind: ManagedProcessKind;
  status: ManagedProcessStatus;
  pid?: number;
  port?: number;
  command?: string;
  args?: string[];
  cwd?: string;
  logPath?: string;
  startedAt?: string;
  stoppedAt?: string;
  exitCode?: number;
}

export interface ProcessLogSnapshot {
  projectId: string;
  processId: string;
  content: string;
  sizeBytes: number;
  truncated: boolean;
  updatedAt?: string;
  readAt: string;
}
