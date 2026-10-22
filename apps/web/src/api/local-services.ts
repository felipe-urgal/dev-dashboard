import { requestJson } from './core';

export type LocalServiceAction = 'start' | 'stop' | 'restart';
export type LocalServiceState = 'running' | 'stopped' | 'failed' | 'unknown';
export interface LocalService {
  id: 'home-music';
  name: string;
  unit: string;
  scope: 'system';
  state: LocalServiceState;
  bootState: string;
  readiness: 'ready' | 'unhealthy' | 'unknown';
  controllable: boolean;
  reason: string | null;
  observedAt: string;
}
export interface LocalServicePlan {
  action: LocalServiceAction;
  confirmation: string;
  expectedState: LocalServiceState;
  expiresAt: string;
  service: LocalService;
}
export interface LocalServiceOutcome {
  action: LocalServiceAction;
  status: 'completed' | 'unverified';
  service: LocalService;
  message: string;
}
export interface LocalServiceLogs {
  status: 'available' | 'empty' | 'unavailable' | 'unsupported';
  content?: string;
  masked: boolean;
  truncated: boolean;
  diagnostic?: string;
}
export async function fetchLocalServices(): Promise<LocalService[]> {
  const response = await requestJson<{ services: LocalService[] }>('/api/local-services');
  return response.services;
}
export async function fetchLocalServicePlan(action: LocalServiceAction): Promise<LocalServicePlan> {
  const response = await requestJson<{ plan: LocalServicePlan }>(
    '/api/local-services/home-music/plan?action=' + encodeURIComponent(action),
  );
  return response.plan;
}
export async function applyLocalServiceAction(plan: LocalServicePlan): Promise<LocalServiceOutcome> {
  const response = await requestJson<{ outcome: LocalServiceOutcome }>(
    '/api/local-services/home-music/actions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: plan.action, confirmation: plan.confirmation }),
    },
  );
  return response.outcome;
}
export async function fetchLocalServiceLogs(): Promise<LocalServiceLogs> {
  const response = await requestJson<{ logs: LocalServiceLogs }>('/api/local-services/home-music/logs');
  return response.logs;
}
