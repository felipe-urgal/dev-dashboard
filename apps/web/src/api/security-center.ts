import { requestJson } from './core';

export type SecurityScannerAvailabilityState =
  | 'available'
  | 'missing'
  | 'unavailable';

export interface SecurityScannerAvailability {
  state: SecurityScannerAvailabilityState;
  observedAt: string;
  version?: string;
  diagnostic?: string;
}

export interface SecurityFinding {
  provider: 'trivy';
  category: 'secret' | 'misconfiguration';
  ruleId: string;
  severity: 'unknown' | 'low' | 'medium' | 'high' | 'critical';
  title: string;
  file: string;
  line?: number;
  remediation?: string;
  reference?: string;
  fingerprint: string;
  observedAt: string;
}

export interface SecurityScanResult {
  provider: 'trivy';
  observedAt: string;
  findings: SecurityFinding[];
}

export interface SecurityScanExecution {
  state: 'completed' | 'failed' | 'invalid-output';
  observedAt: string;
  result?: SecurityScanResult;
  diagnostic?: string;
}

export interface SecurityCenterAvailabilityResponse {
  provider: string;
  availability: SecurityScannerAvailability;
}

export interface SecurityCenterScanResponse {
  provider: string;
  execution: SecurityScanExecution;
}

export function fetchSecurityCenterAvailability(): Promise<SecurityCenterAvailabilityResponse> {
  return requestJson<SecurityCenterAvailabilityResponse>(
    '/api/security-center/availability',
  );
}

export function scanProjectSecurityCenter(
  projectId: string,
): Promise<SecurityCenterScanResponse> {
  return requestJson<SecurityCenterScanResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/security-center/scan`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    },
  );
}
