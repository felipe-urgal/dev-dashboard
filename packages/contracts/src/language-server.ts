export type ProjectLanguageServerKind = 'javascript-typescript';

export type ProjectLanguageServerState =
  | 'unavailable'
  | 'idle'
  | 'starting'
  | 'ready'
  | 'failed';

export interface ProjectLanguageServerStatus {
  kind: ProjectLanguageServerKind;
  supported: boolean;
  available: boolean;
  state: ProjectLanguageServerState;
  activeConnections: number;
  message: string;
  lastStartedAt?: string;
}
