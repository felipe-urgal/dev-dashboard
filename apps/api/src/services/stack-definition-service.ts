import type { Stack } from '@dev-dashboard/contracts';

import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';
import type { StackStore } from '../store/stack-store.js';

export type StackDefinitionServiceErrorCode =
  | 'STACK_PROJECT_NOT_FOUND'
  | 'STACK_ENVIRONMENT_NOT_FOUND'
  | 'STACK_ENVIRONMENT_PROJECT_MISMATCH';

export class StackDefinitionServiceError extends Error {
  public constructor(
    public readonly code: StackDefinitionServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StackDefinitionServiceError';
  }
}

export interface StackDefinitionServiceDependencies {
  stackStore: Pick<StackStore, 'list' | 'findById' | 'save' | 'delete'>;
  projectStore: Pick<ProjectStore, 'findProject'>;
  developmentEnvironmentInstanceStore: Pick<
    DevelopmentEnvironmentInstanceStore,
    'findById'
  >;
}

export class StackDefinitionService {
  public constructor(
    private readonly dependencies: StackDefinitionServiceDependencies,
  ) {}

  public list(): Stack[] {
    return this.dependencies.stackStore.list();
  }

  public findById(stackId: string): Stack | null {
    return this.dependencies.stackStore.findById(stackId);
  }

  public save(stack: Stack): Stack {
    this.validateResourceReferences(stack);
    return this.dependencies.stackStore.save(stack);
  }

  public delete(stackId: string): boolean {
    return this.dependencies.stackStore.delete(stackId);
  }

  private validateResourceReferences(stack: Stack): void {
    for (const node of stack.nodes) {
      const project = this.dependencies.projectStore.findProject(
        node.target.projectId,
      );
      if (!project) {
        throw new StackDefinitionServiceError(
          'STACK_PROJECT_NOT_FOUND',
          `Stack node ${node.id} references an unknown project.`,
        );
      }

      const environmentInstanceId =
        'environmentInstanceId' in node.target
          ? node.target.environmentInstanceId
          : undefined;

      if (!environmentInstanceId) continue;

      const environmentInstance =
        this.dependencies.developmentEnvironmentInstanceStore.findById(
          environmentInstanceId,
        );
      if (!environmentInstance) {
        throw new StackDefinitionServiceError(
          'STACK_ENVIRONMENT_NOT_FOUND',
          `Stack node ${node.id} references an unknown environment instance.`,
        );
      }

      if (environmentInstance.projectId !== node.target.projectId) {
        throw new StackDefinitionServiceError(
          'STACK_ENVIRONMENT_PROJECT_MISMATCH',
          `Stack node ${node.id} references an environment instance owned by another project.`,
        );
      }
    }
  }
}
