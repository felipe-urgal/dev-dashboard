import { requestJson } from './core';

export type ReleaseReadinessState = 'pass' | 'warning' | 'block' | 'unknown';
export type ReleaseReadinessCheckId = 'git' | 'tests' | 'doctor';
export type ReleaseReadinessActionTarget =
  'synchronization' | 'tests' | 'doctor';

export interface ReleaseReadinessCheck {
  id: ReleaseReadinessCheckId;
  state: ReleaseReadinessState;
  summary: string;
  evidence: string;
  observedAt: string;
  action: {
    label: string;
    target: ReleaseReadinessActionTarget;
  };
}

export interface ReleaseReadinessSnapshot {
  state: ReleaseReadinessState;
  generatedAt: string;
  checks: ReleaseReadinessCheck[];
}

interface ReleaseReadinessResponse {
  readiness: ReleaseReadinessSnapshot;
}

export async function fetchReleaseReadiness(
  projectId: string,
): Promise<ReleaseReadinessSnapshot> {
  const response = await requestJson<ReleaseReadinessResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/release-readiness`,
  );
  return response.readiness;
}
