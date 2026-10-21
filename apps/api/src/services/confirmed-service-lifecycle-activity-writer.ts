import { createHash } from 'node:crypto';

import type { ActivityEventRepository } from '@dev-dashboard/core';
import type {
  ConfirmedLifecycleRequest,
  ConfirmedLifecycleStep,
} from '@dev-dashboard/contracts';

import type { ConfirmedLifecycleStepWriter } from './confirmed-service-lifecycle-coordinator.js';
import type { ConfirmedLifecycleJobJournal } from './confirmed-lifecycle-job-journal.js';

const JOB_UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

function unverifiedJob(): never {
  throw new Error('Lifecycle audit Job identity could not be verified.');
}

type Dependencies = {
  activityEvents: Pick<ActivityEventRepository, 'append'>;
  /** Required when a durable job identity is supplied by the coordinator. */
  jobs?: Pick<ConfirmedLifecycleJobJournal, 'get'>;
};

/**
 * Writes a bounded, redacted step result into the existing Activity
 * repository. The coordinator calls this after an owner-owned mutation;
 * event failures must never automatically retry that mutation.
 *
 * Correlation uses the existing durable Job identity; no execution or replay.
 */
export class ConfirmedServiceLifecycleActivityWriter implements ConfirmedLifecycleStepWriter {
  public constructor(private readonly dependencies: Dependencies) {}

  public async append(
    step: ConfirmedLifecycleStep,
    request: ConfirmedLifecycleRequest,
    jobId?: string,
  ): Promise<void> {
    // Never trust a caller-supplied UUID by itself. Only attribute an event
    // to a persisted, matching Job after its step is durably recorded.
    let correlatedJobId: string | undefined;
    if (jobId !== undefined) {
      if (!JOB_UUID.test(jobId) || step.action !== request.action) {
        unverifiedJob();
      }
      let job: ReturnType<NonNullable<Dependencies['jobs']>['get']> | undefined;
      try {
        job = this.dependencies.jobs?.get(jobId);
      } catch {
        unverifiedJob();
      }
      if (
        !job ||
        job.projectId !== request.projectId ||
        job.environmentInstanceId !== request.environmentInstanceId ||
        job.action !== request.action ||
        job.expectedRevision !== request.expectedRevision ||
        job.expectedPlanHash !== request.expectedPlanHash ||
        job.status !== 'running' ||
        job.stage !== 'verifying' ||
        job.inFlightRef !== undefined ||
        job.reconciliationRequired ||
        !job.plannedRefs.includes(step.serviceRef) ||
        job.steps.length === 0 ||
        // Only the most recently persisted step may be attributed to this
        // running Job. A previous step or a future/forged ref cannot be
        // replayed as new audit evidence.
        job.steps.at(-1)?.serviceRef !== step.serviceRef ||
        job.steps.at(-1)?.action !== step.action ||
        job.steps.at(-1)?.state !== step.state ||
        job.steps.at(-1)?.dispositionBefore !== step.dispositionBefore ||
        job.steps.filter((written) => written.serviceRef === step.serviceRef)
          .length !== 1
      ) {
        unverifiedJob();
      }
      correlatedJobId =
        (step.serviceRef.startsWith('systemd:user:')
          ? 'systemd-user-confirmed:'
          : 'compose-confirmed:') + job.id;
    }
    const status =
      step.state === 'completed'
        ? 'succeeded'
        : step.state === 'failed'
          ? 'failed'
          : 'warning';
    // Do not interpolate untrusted runtime error text. Keep the reference
    // for navigation and use stable action/status words for the summary.
    const systemdUser = step.serviceRef.startsWith('systemd:user:');
    const summary =
      'Lifecycle ' +
      request.action +
      ': ' +
      (step.state === 'completed'
        ? 'verified'
        : step.state === 'failed'
          ? 'owner failed'
          : 'unverified');
    await this.dependencies.activityEvents.append({
      projectId: request.projectId,
      environmentInstanceId: request.environmentInstanceId,
      domain: systemdUser ? 'security' : 'compose',
      type:
        (systemdUser ? 'systemd.user.confirmed-' : 'compose.confirmed-') +
        request.action,
      status,
      summary,
      ...(correlatedJobId ? { jobId: correlatedJobId } : {}),
      resourceRef: {
        kind: systemdUser ? 'systemd-user-unit' : 'compose-service',
        // Activity resource IDs are limited to 256 characters. Preserve short
        // identities; hash longer ones without truncation/collision by prefix.
        id:
          step.serviceRef.length <= 256
            ? step.serviceRef
            : (systemdUser ? 'systemd-ref-sha256:' : 'compose-ref-sha256:') +
              createHash('sha256').update(step.serviceRef).digest('hex'),
      },
    });
  }
}
