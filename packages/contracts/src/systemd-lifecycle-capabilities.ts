/** Read-only guidance. A capability status is not an execution grant. */
export type SystemdLifecycleCapabilityStatus =
  'supported' | 'permission-required' | 'unsupported' | 'unknown';

export interface SystemdLifecycleActionCapability {
  status: SystemdLifecycleCapabilityStatus;
  reason: string;
}

export interface SystemdBoundServiceCapabilities {
  bindingId: string;
  serviceRef: string;
  scope: 'user' | 'system' | 'unknown';
  state: 'running' | 'starting' | 'stopping' | 'stopped' | 'failed' | 'unknown';
  readiness: 'unknown';
  observedAt?: string;
  start: SystemdLifecycleActionCapability;
  stop: SystemdLifecycleActionCapability;
  restart: SystemdLifecycleActionCapability;
  /** No service mutation endpoint is installed for this capability view. */
  executable: false;
}

export interface SystemdProjectCapabilitiesSnapshot {
  projectId: string;
  environmentInstanceId: string;
  readAt: string;
  partial: boolean;
  services: SystemdBoundServiceCapabilities[];
}
