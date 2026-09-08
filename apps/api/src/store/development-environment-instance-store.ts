import type {
  DevelopmentEnvironmentInstance,
  ExecutionContext,
  Project,
} from '@dev-dashboard/contracts';

import type { ProjectStore } from './project-store.js';

const PRIMARY_INSTANCE_ID_PREFIX = 'environment:primary:';

type ProjectStoreView = Pick<ProjectStore, 'findProject' | 'listProjects'>;

export function primaryEnvironmentInstanceId(projectId: string): string {
  return `${PRIMARY_INSTANCE_ID_PREFIX}${projectId}`;
}

function primaryInstanceForProject(
  project: Project,
): DevelopmentEnvironmentInstance {
  return {
    id: primaryEnvironmentInstanceId(project.id),
    projectId: project.id,
    source: {
      kind: 'primary',
      path: project.path,
    },
    runtime: {
      kind: 'host',
    },
    lifecycle: 'ready',
  };
}

export class DevelopmentEnvironmentInstanceStore {
  public constructor(private readonly projectStore: ProjectStoreView) {}

  public list(): DevelopmentEnvironmentInstance[] {
    return this.projectStore
      .listProjects()
      .map((project) => primaryInstanceForProject(project));
  }

  public listByProjectId(projectId: string): DevelopmentEnvironmentInstance[] {
    const primary = this.findPrimaryByProjectId(projectId);
    return primary ? [primary] : [];
  }

  public findPrimaryByProjectId(
    projectId: string,
  ): DevelopmentEnvironmentInstance | null {
    const project = this.projectStore.findProject(projectId);
    return project ? primaryInstanceForProject(project) : null;
  }

  public findById(
    environmentInstanceId: string,
  ): DevelopmentEnvironmentInstance | null {
    if (!environmentInstanceId.startsWith(PRIMARY_INSTANCE_ID_PREFIX)) {
      return null;
    }

    const projectId = environmentInstanceId.slice(
      PRIMARY_INSTANCE_ID_PREFIX.length,
    );
    const instance = this.findPrimaryByProjectId(projectId);

    return instance?.id === environmentInstanceId ? instance : null;
  }

  public resolveExecutionContext(
    environmentInstanceId: string,
  ): ExecutionContext | null {
    const instance = this.findById(environmentInstanceId);
    if (!instance) return null;

    return {
      projectId: instance.projectId,
      environmentInstanceId: instance.id,
      cwd: instance.source.path,
      runtime: instance.runtime.kind,
    };
  }
}
