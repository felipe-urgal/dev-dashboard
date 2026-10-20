import type { ActivityEventRepository } from '@dev-dashboard/core';

import type {
  ConfirmedLifecycleReconciliationService,
  LifecycleReconciliationReport,
} from './confirmed-lifecycle-reconciliation-service.js';
import type {
  ResourceLeaseEvidence,
  ServiceResourceLeaseInspector,
} from './service-resource-lease-inspector.js';

export interface LifecycleRecoveryEvidence {
  jobId: string;
  projectId: string;
  environmentInstanceId: string;
  checkedAt: string;
  reconciliation: LifecycleReconciliationReport;
  leases: ResourceLeaseEvidence[];
  /** None of these observations prove the absence of other API instances. */
  otherInstancesExcluded: false;
  manualReviewRequired: true;
  safeToRetry: false;
  leaseReleaseAuthorized: false;
  diagnostics: string[];
}

type Dependencies = {
  reconciliation: Pick<ConfirmedLifecycleReconciliationService, 'inspect'>;
  leases: Pick<ServiceResourceLeaseInspector, 'inspect'>;
  activity: Pick<ActivityEventRepository, 'append'>;
};

export class ConfirmedLifecycleRecoveryReviewService {
  private readonly now: () => Date;

  public constructor(
    private readonly deps: Dependencies,
    options: { now?: () => Date } = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  public async inspect(
    projectId: string,
    jobId: string,
  ): Promise<LifecycleRecoveryEvidence> {
    // Validates project/job ownership before consulting lease data.
    const reconciliation = await this.deps.reconciliation.inspect(
      projectId,
      jobId,
    );
    const physicalKeys = [
      'environment:' + projectId + ':' + reconciliation.environmentInstanceId,
      ...reconciliation.nodes.map((node) => 'resource:' + node.serviceRef),
    ];
    for (const node of reconciliation.nodes) {
      if (node.serviceRef.startsWith('compose:' + projectId + ':')) {
        physicalKeys.push('compose-project:' + projectId);
      }
    }
    let leases: ResourceLeaseEvidence[];
    try {
      leases = this.deps.leases.inspect(physicalKeys);
    } catch {
      leases = [...new Set(physicalKeys)].map((resourceKey) => ({
        resourceKey,
        status: 'unverifiable',
        ownerProcess: 'unknown',
        diagnostic: 'Lease inspection is unavailable.',
      }));
    }

    const diagnostics = [
      'Local PID checks cannot prove that an API instance has stopped or completed a mutation.',
      'Locks in other state directories, remote hosts or external tools cannot be excluded.',
      'Do not clear leases, retry, terminate a process or mark this job completed based on this report.',
    ];
    if (leases.some((lease) => lease.status !== 'absent')) {
      diagnostics.push(
        'One or more local resource leases are present or unverifiable.',
      );
    }

    return {
      jobId,
      projectId,
      environmentInstanceId: reconciliation.environmentInstanceId,
      checkedAt: this.now().toISOString(),
      reconciliation,
      leases,
      otherInstancesExcluded: false,
      manualReviewRequired: true,
      safeToRetry: false,
      leaseReleaseAuthorized: false,
      diagnostics,
    };
  }

  /**
   * Audit that evidence was viewed, NOT that recovery is approved or complete.
   * This cannot mutate the journal, a lease, a service or the owner process.
   */
  public async recordReview(
    projectId: string,
    jobId: string,
  ): Promise<{
    recorded: true;
    safeToRetry: false;
    leaseReleaseAuthorized: false;
  }> {
    const evidence = await this.inspect(projectId, jobId);
    await this.deps.activity.append({
      projectId: evidence.projectId,
      environmentInstanceId: evidence.environmentInstanceId,
      domain: 'compose',
      type: 'compose.lifecycle-recovery-reviewed',
      status: 'warning',
      summary:
        'Recovery evidence reviewed; no retry, release or completion authorized.',
      jobId: 'compose-confirmed:' + jobId,
      resourceRef: {
        kind: 'docker-compose-lifecycle',
        id: jobId,
      },
    });
    return {
      recorded: true,
      safeToRetry: false,
      leaseReleaseAuthorized: false,
    };
  }
}
