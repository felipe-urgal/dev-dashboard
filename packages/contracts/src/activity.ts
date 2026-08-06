export type ActivityOrigin = 'script' | 'test' | 'server';

export type ActivityStatus =
  'running' | 'succeeded' | 'failed' | 'cancelled' | 'unknown';

export interface ActivityBase {
  id: string;
  projectId: string;
  workspaceId?: string;
  label: string;
  status: ActivityStatus;
  startedAt: string;
  finishedAt?: string;
}

export interface ScriptActivityReference {
  executionId: string;
  actionId: string;
}

export interface ProcessActivityReference {
  processId: string;
}

export interface ScriptActivity extends ActivityBase {
  origin: 'script';
  reference: ScriptActivityReference;
}

export interface TestActivity extends ActivityBase {
  origin: 'test';
  reference: ProcessActivityReference;
}

export interface ServerActivity extends ActivityBase {
  origin: 'server';
  reference: ProcessActivityReference;
}

export type Activity = ScriptActivity | TestActivity | ServerActivity;

export interface ActivitySummary {
  running: number;
  succeeded: number;
  failed: number;
  total: number;
}

export interface ActivityList {
  items: Activity[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  summary: ActivitySummary;
}
