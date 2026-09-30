import type { StackCheck, StackRestartResult } from '@dev-dashboard/contracts';

import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';
import type { StackCheckService } from './stack-check-service.js';
import type { DockerComposeLifecycleService } from './docker-compose-lifecycle-service.js';
import { resolveStackComposeProject } from './stack-compose-project-resolver.js';
import {
  recordStackActivity,
  type StackActivityWriter,
} from './stack-activity.js';

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
      activityEvents?: StackActivityWriter;
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
      const diagnostic = `Dependency ${blockedDependency} is not ready.`;
      await recordStackActivity(this.dependencies.activityEvents, {
        stack: check.stack,
        node,
        action: 'restart',
        status: 'warning',
        diagnostic,
      });
      return {
        stackId,
        nodeId,
        state: 'blocked',
        diagnostic,
        check,
      };
    }

    if (node.target.kind !== 'compose-service') {
      const diagnostic = `Stack restart has no safe adapter for ${node.target.kind} nodes.`;
      await recordStackActivity(this.dependencies.activityEvents, {
        stack: check.stack,
        node,
        action: 'restart',
        status: 'warning',
        diagnostic,
      });
      return {
        stackId,
        nodeId,
        state: 'blocked',
        diagnostic,
        check,
      };
    }

    const resolution = resolveStackComposeProject(
      this.dependencies,
      node.target,
    );
    if (resolution.state !== 'resolved') {
      await recordStackActivity(this.dependencies.activityEvents, {
        stack: check.stack,
        node,
        action: 'restart',
        status: 'warning',
        diagnostic: resolution.diagnostic,
      });
      return {
        stackId,
        nodeId,
        state: 'blocked',
        diagnostic: resolution.diagnostic,
        check,
      };
    }

    await recordStackActivity(this.dependencies.activityEvents, {
      stack: check.stack,
      node,
      action: 'restart',
      status: 'started',
    });

    try {
      const result =
        await this.dependencies.dockerComposeLifecycleService.restart(
          resolution.project,
          node.target.service,
        );
      check = await this.dependencies.stackCheckService.check(stackId);

      if (result.state !== 'restarted') {
        const diagnostic =
          result.diagnostic ??
          'Compose restart completed without proving the target is active.';
        await recordStackActivity(this.dependencies.activityEvents, {
          stack: check.stack,
          node,
          action: 'restart',
          status: 'warning',
          diagnostic,
        });
        return {
          stackId,
          nodeId,
          state: 'blocked',
          diagnostic,
          check,
        };
      }

      await recordStackActivity(this.dependencies.activityEvents, {
        stack: check.stack,
        node,
        action: 'restart',
        status: 'succeeded',
      });
      return {
        stackId,
        nodeId,
        state: 'restarted',
        check,
      };
    } catch {
      check = await this.dependencies.stackCheckService.check(stackId);
      const diagnostic =
        'Compose lifecycle failed while restarting this Stack node.';
      await recordStackActivity(this.dependencies.activityEvents, {
        stack: check.stack,
        node,
        action: 'restart',
        status: 'failed',
        diagnostic,
      });
      return {
        stackId,
        nodeId,
        state: 'failed',
        diagnostic,
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
