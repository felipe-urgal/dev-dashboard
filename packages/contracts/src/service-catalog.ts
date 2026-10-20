/** Read-only observation. Names/ports/labels are never ownership authority. */
export type ServiceCatalogProvider =
  'systemd' | 'docker' | 'compose' | 'managed-process';

export type ServiceCatalogState =
  'running' | 'starting' | 'stopping' | 'stopped' | 'failed' | 'unknown';

/** Evidence is descriptive; it is never an authorization or an ownership claim. */
export interface ServiceObservationCapabilities {
  observe: 'supported';
  start: 'unsupported';
  stop: 'unsupported';
  restart: 'unsupported';
  'boot-policy': 'unsupported';
}

export interface ServiceObservationEvidence {
  source: 'systemd' | 'docker-cli' | 'compose-owner' | 'process-manager';
  /** Provider-owned, opaque identity (no shell, PID, file path or credentials). */
  identity: string;
}

export interface ServiceObservation {
  id: string;
  displayName: string;
  provider: ServiceCatalogProvider;
  scope: 'user' | 'system' | 'host' | 'environment';
  state: ServiceCatalogState;
  readiness: 'ready' | 'unhealthy' | 'unknown';
  enabledAtBoot?: import('./host-service.js').HostServiceBootState;
  ports: number[];
  observedAt: string;
  evidence: ServiceObservationEvidence;
  /** Catalog capabilities do not authorize lifecycle mutations. */
  capabilities: ServiceObservationCapabilities;
  diagnostic?: string;
}

export interface ServiceCatalogEntry extends ServiceObservation {
  name: string;
  ownership: 'confirmed' | 'unmanaged' | 'unknown';
  projectId?: string;
  environmentInstanceId?: string;
}

export interface ServiceCatalogProviderStatus {
  provider: ServiceCatalogProvider | 'ports';
  status: 'ready' | 'partial' | 'unavailable' | 'unsupported';
  diagnostic?: string;
}

export interface ServiceCatalogPortEvidence {
  port: number;
  address: string;
  conflict: boolean;
  /** Only Process Manager identity can confirm a process reference. */
  managedProcessId?: string;
}

export interface ServiceCatalogSnapshot {
  status: 'ready' | 'partial' | 'unavailable' | 'unsupported';
  observedAt: string;
  entries: ServiceCatalogEntry[];
  ports: ServiceCatalogPortEvidence[];
  providers: ServiceCatalogProviderStatus[];
  truncated: boolean;
}
