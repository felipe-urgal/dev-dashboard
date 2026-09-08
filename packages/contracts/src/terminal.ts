export type ProjectTerminalKind = 'shell' | 'rails-console';

export interface ProjectTerminalStatus {
  kind: ProjectTerminalKind;
  /** Identidade operacional da sessão quando já resolvida pelo backend. */
  environmentInstanceId?: string;
  /** O projeto possui os sinais necessários para este tipo de sessão (ex. `rails-console` exige um projeto Rails). */
  supported: boolean;
  /** Sessões de terminal atualmente conectadas a esta Environment Instance e kind. */
  activeSessions: number;
  message: string;
}

export interface ProjectTerminalConfirmation {
  token: string;
  expiresAt: string;
  /** Vincula a confirmação ao ambiente resolvido; opcional apenas para compatibilidade de chamadas internas legadas. */
  environmentInstanceId?: string;
}
