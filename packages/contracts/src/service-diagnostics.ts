import type { ActivityEvent, ActivityJob } from './activity.js';
import type {
  ServiceCatalogProvider,
  ServiceCatalogState,
} from './service-catalog.js';

export type ServiceDiagnosticsStatus =
  'available' | 'empty' | 'unavailable' | 'unsupported';

/** One on-demand read, never a stored log or a lifecycle authorization. */
export interface ServiceDiagnosticsSnapshot {
  serviceRef: string;
  projectId: string;
  environmentInstanceId: string;
  provider: ServiceCatalogProvider;
  source: 'journal' | 'compose' | 'process' | 'none';
  status: ServiceDiagnosticsStatus;
  state: ServiceCatalogState | 'unknown';
  readiness: 'ready' | 'unhealthy' | 'unknown';
  observedAt?: string;
  readAt: string;
  /** Snapshot age, not proof of continued runtime health. */
  stale: boolean;
  partial: boolean;
  masked: boolean;
  truncated: boolean;
  content?: string;
  diagnostic?: string;
  /** Existing bounded Activity/Jobs references, not duplicate log storage. */
  events: ActivityEvent[];
  jobs: ActivityJob[];
}
