export type ProjectTerminalKind = 'shell' | 'rails-console';

export interface ProjectTerminalStatus {
  kind: ProjectTerminalKind;
  /** O projeto possui os sinais necessários para este tipo de sessão (ex. `rails-console` exige um projeto Rails). */
  supported: boolean;
  /** Sessões de terminal atualmente conectadas a este projeto e kind. */
  activeSessions: number;
  message: string;
}

export interface ProjectTerminalConfirmation {
  token: string;
  expiresAt: string;
}
