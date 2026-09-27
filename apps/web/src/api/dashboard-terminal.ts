import { requestJson } from './core';

export interface DashboardTerminalConfirmation {
  token: string;
  expiresAt: string;
}

export interface DashboardTerminalReconnectCredentials {
  sessionId: string;
  reconnectToken: string;
}

export function prepareDashboardTerminalConfirmation(): Promise<DashboardTerminalConfirmation> {
  return requestJson<{ confirmation: DashboardTerminalConfirmation }>(
    '/api/dashboard/terminal/confirmations',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
  ).then((response) => response.confirmation);
}

export function dashboardTerminalWebSocketUrl(
  credentials:
    { confirmationToken: string } | DashboardTerminalReconnectCredentials,
): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const query = new URLSearchParams();
  if ('confirmationToken' in credentials) {
    query.set('confirmationToken', credentials.confirmationToken);
  } else {
    query.set('sessionId', credentials.sessionId);
    query.set('reconnectToken', credentials.reconnectToken);
  }
  return `${protocol}//${window.location.host}/api/dashboard/terminal/connect?${query.toString()}`;
}
