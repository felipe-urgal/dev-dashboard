/** Read-only observation. Names/ports/labels are never ownership authority. */
export type ServiceCatalogProvider =
  'systemd' | 'docker' | 'compose' | 'managed-process';

export type ServiceCatalogState =
  'running' | 'starting' | 'stopping' | 'stopped' | 'failed' | 'unknown';

export interface ServiceCatalogEntry {
  id: string;
  provider: ServiceCatalogProvider;
  name: string;
  state: ServiceCatalogState;
  readiness: 'ready' | 'unhealthy' | 'unknown';
  ownership: 'confirmed' | 'unmanaged' | 'unknown';
  scope: string;
  projectId?: string;
  environmentInstanceId?: string;
  /** Port evidence does not constitute an ownership grant. */
  ports: number[];
  observedAt: string;
  diagnostic?: string;
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
