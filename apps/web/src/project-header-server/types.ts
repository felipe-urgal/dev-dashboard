export interface ManagedProcessSnapshot {
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'failed';
  pid?: number | null;
  port?: number | null;
}

export interface ProcessResponse {
  process: ManagedProcessSnapshot | null;
}
