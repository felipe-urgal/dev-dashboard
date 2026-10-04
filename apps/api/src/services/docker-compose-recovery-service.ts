import type { Project } from '@dev-dashboard/contracts';

import {
  primaryEnvironmentInstanceId,
  type DevelopmentEnvironmentInstanceStore,
} from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';
import type { DockerComposeLifecycleService } from './docker-compose-lifecycle-service.js';
import type { DockerComposeOwnershipStore } from './docker-compose-ownership-store.js';
import type { DockerComposeProvider } from './docker-compose-provider.js';

type ProjectStoreView = Pick<ProjectStore, 'findProject'>;
type EnvironmentStore = Pick<DevelopmentEnvironmentInstanceStore, 'list'>;

export interface DockerComposeRecoveryResult {
  inspected: number;
  reconciled: number;
  unavailable: number;
}

function scopedProject(
  project: Project,
  environmentInstanceId: string,
  cwd: string,
): Project {
  if (environmentInstanceId === primaryEnvironmentInstanceId(project.id)) {
    return project;
  }
  return { ...project, id: environmentInstanceId, path: cwd };
}

export class DockerComposeRecoveryService {
  public constructor(
    private readonly projectStore: ProjectStoreView,
    private readonly environmentStore: EnvironmentStore,
    private readonly ownershipStore: Pick<DockerComposeOwnershipStore, 'get'>,
    private readonly provider: Pick<DockerComposeProvider, 'inspect'>,
    private readonly lifecycle: Pick<
      DockerComposeLifecycleService,
      'reconcile'
    >,
  ) {}

  public async reconcile(): Promise<DockerComposeRecoveryResult> {
    let inspected = 0;
    let reconciled = 0;
    let unavailable = 0;

    for (const instance of this.environmentStore.list()) {
      if (instance.runtime.kind !== 'host') continue;
      const project = this.projectStore.findProject(instance.projectId);
      if (!project) continue;

      const target = scopedProject(project, instance.id, instance.source.path);
      try {
        const ownership = await this.ownershipStore.get(target);
        if (!ownership) continue;

        inspected += 1;
        const inspection = await this.provider.inspect(target);
        const result = await this.lifecycle.reconcile(target, inspection);
        if (result.state === 'unavailable') unavailable += 1;
        else reconciled += 1;
      } catch {
        unavailable += 1;
      }
    }

    return { inspected, reconciled, unavailable };
  }
}
