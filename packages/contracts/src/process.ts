export type ManagedProcessKind =
  'server' | 'webpack' | 'worker' | 'test' | 'script';

export type ManagedProcessStatus =
  'starting' | 'running' | 'stopping' | 'stopped' | 'failed';

export interface ManagedProcess {
  id: string;
  projectId: string;
  workspaceId?: string;
  kind: ManagedProcessKind;
  status: ManagedProcessStatus;
  pid?: number;
  port?: number;
  host?: string;
  url?: string;
  urls?: string[];
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
  masked: boolean;
  redactionCount: number;
  updatedAt?: string;
  readAt: string;
}
