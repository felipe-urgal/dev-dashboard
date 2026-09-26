import { requestJson } from './core';

export interface DashboardTerminalConfirmation {
  token: string;
  expiresAt: string;
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
  confirmationToken: string,
): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const query = new URLSearchParams({ confirmationToken }).toString();
  return `${protocol}//${window.location.host}/api/dashboard/terminal/connect?${query}`;
}
