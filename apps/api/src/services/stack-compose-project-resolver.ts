import type { Project, StackComposeServiceTarget } from '@dev-dashboard/contracts';

import { primaryEnvironmentInstanceId } from '../store/development-environment-instance-store.js';
import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';

export type StackComposeProjectResolution =
  | { state: 'resolved'; project: Project }
  | { state: 'unavailable'; diagnostic: string };

export function resolveStackComposeProject(
  dependencies: {
    projectStore: Pick<ProjectStore, 'findProject'>;
    developmentEnvironmentInstanceStore: Pick<
      DevelopmentEnvironmentInstanceStore,
      'resolveForProject'
    >;
  },
  target: Pick<
    StackComposeServiceTarget,
    'projectId' | 'environmentInstanceId'
  >,
): StackComposeProjectResolution {
  const project = dependencies.projectStore.findProject(target.projectId);
  if (!project) {
    return {
      state: 'unavailable',
      diagnostic: 'Compose project is no longer available.',
    };
  }

  const executionContext =
    dependencies.developmentEnvironmentInstanceStore.resolveForProject(
      target.projectId,
      target.environmentInstanceId,
    );
  if (!executionContext) {
    return {
      state: 'unavailable',
      diagnostic: 'Compose Environment Instance is no longer available.',
    };
  }

  if (executionContext.runtime !== 'host') {
    return {
      state: 'unavailable',
      diagnostic: 'Compose Stack nodes currently require a host runtime.',
    };
  }

  if (
    executionContext.environmentInstanceId ===
    primaryEnvironmentInstanceId(project.id)
  ) {
    return { state: 'resolved', project };
  }

  return {
    state: 'resolved',
    project: {
      ...project,
      id: executionContext.environmentInstanceId,
      path: executionContext.cwd,
    },
  };
}
