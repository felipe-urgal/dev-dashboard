import type {
  ServiceCatalogEntry,
  ServiceCatalogSnapshot,
} from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';
import type { ProjectStore } from '../store/project-store.js';
import type {
  ConfirmedLifecycleJob,
  ConfirmedLifecycleJobJournal,
} from './confirmed-lifecycle-job-journal.js';
import type { ServiceCatalogService } from './service-catalog-service.js';

export interface LifecycleReconciliationNode {
  serviceRef: string;
  journalState: 'not-attempted' | 'in-flight' | 'completed' | 'failed' | 'unverified';
  observedState: ServiceCatalogEntry['state'] | 'missing';
  readiness: ServiceCatalogEntry['readiness'];
  assessment: 'matches-target' | 'diverged' | 'unverifiable';
  diagnostic: string;
}

export interface LifecycleReconciliationReport {
  jobId: string;
  projectId: string;
  environmentInstanceId: string;
  action: ConfirmedLifecycleJob['action'];
  journalStatus: ConfirmedLifecycleJob['status'];
  stage: ConfirmedLifecycleJob['stage'];
  inFlightRef?: string;
  startedAt: string;
  updatedAt: string;
  observedAt?: string;
  observationComplete: boolean;
  reconciliationRequired: boolean;
  possibleActiveExecution: boolean;
  safeToRetry: false;
  nodes: LifecycleReconciliationNode[];
  diagnostics: string[];
}

export interface LifecycleJobSummary {
  id: string;
  environmentInstanceId: string;
  action: ConfirmedLifecycleJob['action'];
  status: ConfirmedLifecycleJob['status'];
  stage: ConfirmedLifecycleJob['stage'];
  startedAt: string;
  reconciliationRequired: boolean;
  inFlightRef?: string;
  completedSteps: number;
}

interface Dependencies {
  journal: Pick<ConfirmedLifecycleJobJournal, 'get' | 'list'>;
  projects: Pick<ProjectStore, 'findProject'>;
  catalog: Pick<ServiceCatalogService, 'inspect'>;
}

function notFound(): never {
  throw new ApiError({
    statusCode: 404,
    code: 'NOT_FOUND',
    message: 'Lifecycle job not found for project.',
  });
}

function complete(snapshot: ServiceCatalogSnapshot): boolean {
  return snapshot.status === 'ready' &&
    !snapshot.truncated &&
    snapshot.providers.every((provider) => provider.status === 'ready');
}

/**
 * Observational reconciliation, never an execution or recovery permission.
 * A matching current state does not prove which process caused it, or whether
 * an older API instance is still inside a long-running Compose mutation.
 */
export class ConfirmedLifecycleReconciliationService {
  public constructor(private readonly deps: Dependencies) {}

  public list(projectId: string): LifecycleJobSummary[] {
    if (!this.deps.projects.findProject(projectId)) notFound();
    return this.deps.journal.list(projectId).slice(0, 100).map((job) => ({
      id: job.id,
      environmentInstanceId: job.environmentInstanceId,
      action: job.action,
      status: job.status,
      stage: job.stage,
      startedAt: job.startedAt,
      reconciliationRequired: job.reconciliationRequired || job.status === 'running',
      ...(job.inFlightRef ? { inFlightRef: job.inFlightRef } : {}),
      completedSteps: job.steps.filter((step) => step.state === 'completed').length,
    }));
  }

  public async inspect(
    projectId: string,
    jobId: string,
  ): Promise<LifecycleReconciliationReport> {
    if (!this.deps.projects.findProject(projectId)) notFound();
    const job = this.deps.journal.get(jobId);
    // The project check also prevents cross-project job existence leaks.
    if (!job || job.projectId !== projectId) notFound();

    let snapshot: ServiceCatalogSnapshot | null = null;
    try {
      snapshot = await this.deps.catalog.inspect();
    } catch {
      // Observation failure is a diagnostic, never evidence for a retry.
    }
    const observationComplete = snapshot !== null && complete(snapshot);
    const entries = new Map<string, ServiceCatalogEntry[]>();
    for (const entry of snapshot?.entries ?? []) {
      const existing = entries.get(entry.id) ?? [];
      existing.push(entry);
      entries.set(entry.id, existing);
    }

    const nodes: LifecycleReconciliationNode[] = job.plannedRefs.map((ref) => {
      const written = job.steps.find((step) => step.serviceRef === ref);
      const journalState = job.inFlightRef === ref ? 'in-flight'
        : written?.state ?? 'not-attempted';
      const matches = entries.get(ref) ?? [];
      const entry = matches.length === 1 ? matches[0] : undefined;
      const observedState = entry?.state ?? 'missing';
      const readiness = entry?.readiness ?? 'unknown';
      const owned = entry?.ownership === 'confirmed' &&
        entry.projectId === job.projectId &&
        (entry.environmentInstanceId === undefined ||
          entry.environmentInstanceId === job.environmentInstanceId);
      let assessment: LifecycleReconciliationNode['assessment'] = 'unverifiable';
      let diagnostic = 'Current service state or ownership cannot be established.';

      if (observationComplete && entry && owned) {
        const matchesTarget = job.action === 'start'
          ? entry.state === 'running' && entry.readiness === 'ready'
          : entry.state === 'stopped';
        const knownOpposite = job.action === 'start'
          ? entry.state === 'stopped'
          : entry.state === 'running' && entry.readiness === 'ready';
        if (matchesTarget) {
          assessment = 'matches-target';
          diagnostic = 'Current state matches the target, but execution history is not proven.';
        } else if (knownOpposite) {
          assessment = 'diverged';
          diagnostic = 'Current state does not match the requested target.';
        } else {
          diagnostic = 'Service state or readiness is not conclusive.';
        }
      } else if (matches.length > 1) {
        diagnostic = 'Catalog contains ambiguous service identities.';
      } else if (!observationComplete) {
        diagnostic = 'Provider or port observations are incomplete.';
      } else if (!entry) {
        diagnostic = 'Service is missing from the current catalog.';
      } else if (!owned) {
        diagnostic = 'Recorded project/environment ownership is not confirmed.';
      }
      return {
        serviceRef: ref,
        journalState,
        observedState,
        readiness,
        assessment,
        diagnostic,
      };
    });

    const diagnostics: string[] = [];
    if (!observationComplete) {
      diagnostics.push('Observations are incomplete or unavailable; manual verification is required.');
    }
    if (job.status === 'running') {
      diagnostics.push('The original process may still be active. Do not retry or remove its locks.');
    }
    if (job.inFlightRef) {
      diagnostics.push('An operation may have reached the provider before its result was recorded.');
    }
    if (nodes.some((node) => node.assessment !== 'matches-target')) {
      diagnostics.push('One or more resource states require manual investigation.');
    }
    // Even matching observations are not permission to release a lease/retry.
    diagnostics.push('No actions were performed. Check all active API instances, leases and dependent services before manual recovery.');

    return {
      jobId: job.id,
      projectId: job.projectId,
      environmentInstanceId: job.environmentInstanceId,
      action: job.action,
      journalStatus: job.status,
      stage: job.stage,
      ...(job.inFlightRef ? { inFlightRef: job.inFlightRef } : {}),
      startedAt: job.startedAt,
      updatedAt: job.updatedAt,
      ...(snapshot ? { observedAt: snapshot.observedAt } : {}),
      observationComplete,
      reconciliationRequired: job.reconciliationRequired ||
        job.status === 'running' ||
        nodes.some((node) => node.assessment !== 'matches-target'),
      possibleActiveExecution: job.status === 'running',
      safeToRetry: false,
      nodes,
      diagnostics,
    };
  }
}
