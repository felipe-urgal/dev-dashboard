export type ComposeServiceAction = 'start' | 'stop' | 'restart';

export interface ComposeService {
  name: string;
  image?: string;
  requiresBuild: boolean;
  ports: string[];
  dependsOn: string[];
  running: boolean;
}

export interface ProjectComposeOverview {
  configured: boolean;
  dockerAvailable: boolean;
  composeFile?: string;
  services: ComposeService[];
}

export interface ComposeServiceActionConfirmation {
  token: string;
  serviceName: string;
  action: Extract<ComposeServiceAction, 'stop' | 'restart'>;
  expiresAt: string;
}

export interface ComposeServiceActionResult {
  serviceName: string;
  action: ComposeServiceAction;
  succeeded: true;
}

export interface ComposeServiceLogs {
  serviceName: string;
  content: string;
  sizeBytes: number;
  truncated: boolean;
  masked: boolean;
  redactionCount: number;
  readAt: string;
}
