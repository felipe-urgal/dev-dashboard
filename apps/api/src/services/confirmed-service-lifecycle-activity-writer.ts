import { createHash } from 'node:crypto';

import type { ActivityEventRepository } from '@dev-dashboard/core';
import type {
  ConfirmedLifecycleRequest,
  ConfirmedLifecycleStep,
} from '@dev-dashboard/contracts';

import type { ConfirmedLifecycleStepWriter } from './confirmed-service-lifecycle-coordinator.js';

type Dependencies = {
  activityEvents: Pick<ActivityEventRepository, 'append'>;
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
  ): Promise<void> {
    const status =
      step.state === 'completed'
        ? 'succeeded'
        : step.state === 'failed'
          ? 'failed'
          : 'warning';
    // Do not interpolate untrusted runtime error text. Keep the reference
    // for navigation and use stable action/status words for the summary.
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
      domain: 'compose',
      type: 'compose.confirmed-' + request.action,
      status,
      summary,
      resourceRef: {
        kind: 'compose-service',
        // Activity resource IDs are limited to 256 characters. Preserve short
        // identities; hash longer ones without truncation/collision by prefix.
        id:
          step.serviceRef.length <= 256
            ? step.serviceRef
            : 'compose-ref-sha256:' +
              createHash('sha256').update(step.serviceRef).digest('hex'),
      },
    });
  }
}
