import type {
  StackCheck,
  StackRestartResult,
} from '@dev-dashboard/contracts';

import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';
import type { StackCheckService } from './stack-check-service.js';
import type { DockerComposeLifecycleService } from './docker-compose-lifecycle-service.js';
import { resolveStackComposeProject } from './stack-compose-project-resolver.js';

export class StackRestartService {
  public constructor(
    private readonly dependencies: {
      stackCheckService: Pick<StackCheckService, 'check'>;
      projectStore: Pick<ProjectStore, 'findProject'>;
      developmentEnvironmentInstanceStore: Pick<
        DevelopmentEnvironmentInstanceStore,
        'resolveForProject'
      >;
      dockerComposeLifecycleService: Pick<
        DockerComposeLifecycleService,
        'restart'
      >;
    },
  ) {}

  public async restart(
    stackId: string,
    nodeId: string,
  ): Promise<StackRestartResult> {
    let check = await this.dependencies.stackCheckService.check(stackId);
    const node = check.stack.nodes.find((candidate) => candidate.id === nodeId);

    if (!node) {
      return {
        stackId,
        nodeId,
        state: 'blocked',
        diagnostic: 'Stack node was not found in the current definition.',
        check,
      };
    }

    const blockedDependency = check.stack.dependencies
      .filter((dependency) => dependency.nodeId === nodeId)
      .map((dependency) => dependency.dependsOnNodeId)
      .find(
        (dependencyNodeId) =>
          this.nodeHealth(check, dependencyNodeId).state !== 'ready',
      );

    if (blockedDependency) {
      return {
        stackId,
        nodeId,
        state: 'blocked',
        diagnostic: `Dependency ${blockedDependency} is not ready.`,
        check,
      };
    }

    if (node.target.kind !== 'compose-service') {
      return {
        stackId,
        nodeId,
        state: 'blocked',
        diagnostic: `Stack restart has no safe adapter for ${node.target.kind} nodes.`,
        check,
      };
    }

    const resolution = resolveStackComposeProject(
      this.dependencies,
      node.target,
    );
    if (resolution.state !== 'resolved') {
      return {
        stackId,
        nodeId,
        state: 'blocked',
        diagnostic: resolution.diagnostic,
        check,
      };
    }

    try {
      const result = await this.dependencies.dockerComposeLifecycleService.restart(
        resolution.project,
        node.target.service,
      );
      check = await this.dependencies.stackCheckService.check(stackId);

      if (result.state !== 'restarted') {
        return {
          stackId,
          nodeId,
          state: 'blocked',
          diagnostic:
            result.diagnostic ??
            'Compose restart completed without proving the target is active.',
          check,
        };
      }

      return {
        stackId,
        nodeId,
        state: 'restarted',
        check,
      };
    } catch {
      check = await this.dependencies.stackCheckService.check(stackId);
      return {
        stackId,
        nodeId,
        state: 'failed',
        diagnostic:
          'Compose lifecycle failed while restarting this Stack node.',
        check,
      };
    }
  }

  private nodeHealth(check: StackCheck, nodeId: string) {
    return (
      check.health.nodes.find((node) => node.nodeId === nodeId) ?? {
        nodeId,
        state: 'unknown' as const,
        observedAt: check.health.observedAt,
        diagnostic: 'No health evidence is available for this Stack node.',
      }
    );
  }
}
