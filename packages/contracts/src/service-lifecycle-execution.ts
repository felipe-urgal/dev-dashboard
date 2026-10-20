import type {
  ServiceLifecycleAction,
  ServiceLifecycleDisposition,
} from './service-lifecycle-plan.js';

export interface ConfirmedLifecycleRequest {
  projectId: string;
  environmentInstanceId: string;
  action: ServiceLifecycleAction;
  expectedRevision: string;
  expectedPlanHash: string;
  /** The observation timestamp displayed with the accepted preview. */
  acceptedObservedAt: string;
}

export interface ConfirmedLifecycleStep {
  serviceRef: string;
  action: ServiceLifecycleAction;
  state: 'completed' | 'failed' | 'unverified';
  dispositionBefore: ServiceLifecycleDisposition;
  diagnostic?: string;
}

export interface ConfirmedLifecycleResult {
  projectId: string;
  environmentInstanceId: string;
  action: ServiceLifecycleAction;
  status: 'completed' | 'failed' | 'partial';
  steps: ConfirmedLifecycleStep[];
  diagnostic?: string;
}
