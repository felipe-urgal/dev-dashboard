import type {
  DevelopmentEnvironmentInstance,
  Project,
} from '@dev-dashboard/contracts';

import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';
import type {
  DevContainerCleanupInspection,
  DevContainerCleanupService,
} from './dev-container-cleanup-service.js';

type EnvironmentStore = Pick<
  DevelopmentEnvironmentInstanceStore,
  'list' | 'upsert'
>;
type Projects = Pick<ProjectStore, 'findProject'>;
type Cleanup = Pick<DevContainerCleanupService, 'inspect' | 'cleanup'>;

export interface DevContainerRecoverySummary {
  inspected: number;
  normalized: number;
  recoveryRequired: number;
  failed: number;
}

function markLifecycle(
  store: EnvironmentStore,
  instance: DevelopmentEnvironmentInstance,
  lifecycle: DevelopmentEnvironmentInstance['lifecycle'],
): void {
  if (instance.lifecycle === lifecycle) return;
  store.upsert({ ...instance, lifecycle });
}

function ownedRuntimeMatches(
  instance: DevelopmentEnvironmentInstance,
  inspection: DevContainerCleanupInspection,
): boolean {
  return (
    instance.runtime.kind === 'devcontainer' &&
    inspection.state === 'present' &&
    inspection.ownership.phase === 'owned' &&
    inspection.ownership.containerId === instance.runtime.runtimeId &&
    inspection.containerId === instance.runtime.runtimeId
  );
}

/**
 * Reconcilia somente evidência persistida pelo próprio Dashboard. Containers
 * externos nunca são assumidos. Reservas sem recurso podem ser liberadas;
 * recursos parciais presentes permanecem explícitos como recovery-required.
 */
export class DevContainerRecoveryService {
  public constructor(
    private readonly projectStore: Projects,
    private readonly environmentStore: EnvironmentStore,
    private readonly cleanupService: Cleanup,
  ) {}

  public async reconcile(): Promise<DevContainerRecoverySummary> {
    return this.reconcileMatching(() => true);
  }

  public async reconcileProject(
    projectId: string,
    environmentInstanceId?: string,
  ): Promise<DevContainerRecoverySummary> {
    return this.reconcileMatching(
      (instance) =>
        instance.projectId === projectId &&
        (!environmentInstanceId || instance.id === environmentInstanceId),
    );
  }

  private async reconcileMatching(
    matches: (instance: DevelopmentEnvironmentInstance) => boolean,
  ): Promise<DevContainerRecoverySummary> {
    const summary: DevContainerRecoverySummary = {
      inspected: 0,
      normalized: 0,
      recoveryRequired: 0,
      failed: 0,
    };

    for (const instance of this.environmentStore.list()) {
      if (
        !matches(instance) ||
        instance.lifecycle === 'degraded' ||
        (instance.runtime.kind === 'host' && instance.lifecycle === 'ready')
      ) {
        continue;
      }

      const project = this.projectStore.findProject(instance.projectId);
      if (!project) continue;
      summary.inspected += 1;
      await this.reconcileInstance(project, instance, summary);
    }

    return summary;
  }

  private async reconcileInstance(
    project: Project,
    instance: DevelopmentEnvironmentInstance,
    summary: DevContainerRecoverySummary,
  ): Promise<void> {
    let inspection: DevContainerCleanupInspection;
    try {
      inspection = await this.cleanupService.inspect(project, instance.id);
    } catch {
      markLifecycle(this.environmentStore, instance, 'failed');
      summary.failed += 1;
      return;
    }

    if (inspection.state === 'unowned') {
      if (instance.runtime.kind === 'host') {
        this.environmentStore.upsert({
          ...instance,
          runtime: { kind: 'host' },
          lifecycle: 'ready',
        });
        summary.normalized += 1;
      } else {
        markLifecycle(this.environmentStore, instance, 'failed');
        summary.recoveryRequired += 1;
      }
      return;
    }

    if (inspection.state === 'absent') {
      try {
        await this.cleanupService.cleanup(project, instance.id);
        summary.normalized += 1;
      } catch {
        markLifecycle(this.environmentStore, instance, 'failed');
        summary.failed += 1;
      }
      return;
    }

    if (ownedRuntimeMatches(instance, inspection) && inspection.running) {
      if (instance.lifecycle !== 'ready') {
        this.environmentStore.upsert({
          ...instance,
          lifecycle: 'ready',
        });
        summary.normalized += 1;
      }
      return;
    }

    if (instance.lifecycle === 'stopping') {
      try {
        await this.cleanupService.cleanup(project, instance.id);
        summary.normalized += 1;
      } catch {
        markLifecycle(this.environmentStore, instance, 'failed');
        summary.failed += 1;
      }
      return;
    }

    markLifecycle(this.environmentStore, instance, 'failed');
    summary.recoveryRequired += 1;
  }
}
