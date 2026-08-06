import type { ProjectTextRange } from './project-files.js';

export type ProjectLanguageServerKind = 'javascript-typescript' | 'ruby';

export type ProjectLanguageServerState =
  'unavailable' | 'idle' | 'starting' | 'ready' | 'failed';

export type ProjectRailsRuntimeState = 'unavailable' | 'disabled' | 'enabled';

export interface ProjectRailsLanguageServerStatus {
  /** O projeto é Rails e a gem `ruby-lsp-rails` já está resolvida no bundle. */
  addonAvailable: boolean;
  /** Introspecção em tempo de execução (inicializa a aplicação Rails). */
  runtimeState: ProjectRailsRuntimeState;
  message: string;
}

export interface ProjectLanguageServerStatus {
  kind: ProjectLanguageServerKind;
  supported: boolean;
  available: boolean;
  state: ProjectLanguageServerState;
  activeConnections: number;
  message: string;
  lastStartedAt?: string;
  rails?: ProjectRailsLanguageServerStatus;
}

export interface ProjectRailsRuntimeConfirmation {
  token: string;
  expiresAt: string;
}

export interface ProjectSymbolLocation {
  path: string;
  range: ProjectTextRange;
}
