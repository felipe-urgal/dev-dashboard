export type ActivityDomain =
  | 'process'
  | 'test'
  | 'script'
  | 'git'
  | 'database'
  | 'compose'
  | 'deployment'
  | 'ci'
  | 'security'
  | 'agent';

export type ActivityEventStatus =
  'started' | 'succeeded' | 'failed' | 'cancelled' | 'warning';

export interface ActivityResourceRef {
  kind: string;
  id: string;
}

export interface ActivityEvent {
  id: string;
  projectId: string;
  environmentInstanceId?: string;
  domain: ActivityDomain;
  type: string;
  status?: ActivityEventStatus;
  summary: string;
  occurredAt: string;
  resourceRef?: ActivityResourceRef;
  jobId?: string;
}

export type ActivityJobStatus =
  'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface ActivityJob {
  id: string;
  projectId: string;
  environmentInstanceId?: string;
  domain: ActivityDomain;
  action: string;
  status: ActivityJobStatus;
  startedAt?: string;
  finishedAt?: string;
  resourceRef?: ActivityResourceRef;
  taskContextId?: string;
  providerId?: 'codex' | 'claude-code' | 'chatgpt-browser';
  stage?: string;
  stageStartedAt?: string;
  attempts?: number;
  timingIncomplete?: boolean;
  cancelSupported: boolean;
}

export interface ActivitySnapshot {
  generatedAt: string;
  partial: boolean;
  unavailableDomains: ActivityDomain[];
  events: ActivityEvent[];
  jobs: ActivityJob[];
}
