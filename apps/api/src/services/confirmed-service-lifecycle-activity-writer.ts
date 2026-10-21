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
 * This is not yet a durable job identity or reattach mechanism.
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
      const job = this.dependencies.jobs?.get(jobId);
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
        job.plannedRefs.length !== 1 ||
        job.plannedRefs[0] !== step.serviceRef ||
        job.steps.length !== 1 ||
        job.steps[0]?.serviceRef !== step.serviceRef ||
        job.steps[0].action !== step.action ||
        job.steps[0].state !== step.state ||
        job.steps[0].dispositionBefore !== step.dispositionBefore
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
