export interface ProjectServerSettings {
  projectId: string;
  port?: number;
  healthCheckPath?: string;
  environment?: string;
  updatedAt?: string;
}

export interface UpdateProjectServerSettingsInput {
  port?: number;
  healthCheckPath?: string;
  environment?: string;
}

export type ServerHealthStatus =
  | 'healthy'
  | 'degraded'
  | 'unavailable';

export interface ProjectServerHealth {
  projectId: string;
  path: string;
  pathSource: 'configured' | 'detected';
  status: ServerHealthStatus;
  httpStatus?: number;
  latencyMs?: number;
  checkedAt: string;
  message?: string;
}
