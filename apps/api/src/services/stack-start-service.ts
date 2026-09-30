import type {
  StackCheck,
  StackStartResult,
  StackStartStep,
} from '@dev-dashboard/contracts';

import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';
import type { StackCheckService } from './stack-check-service.js';
import type { DockerComposeLifecycleService } from './docker-compose-lifecycle-service.js';
import { resolveStackComposeProject } from './stack-compose-project-resolver.js';
import {
  recordStackActivity,
  type StackActivityWriter,
} from './stack-activity.js';

export class StackStartService {
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
        'start'
      >;
      activityEvents?: StackActivityWriter;
    },
  ) {}

  public async start(stackId: string): Promise<StackStartResult> {
    let check = await this.dependencies.stackCheckService.check(stackId);
    const steps: StackStartStep[] = [];

    for (const nodeId of check.topology.startOrder) {
      const node = check.stack.nodes.find(
        (candidate) => candidate.id === nodeId,
      )!;
      const health = this.nodeHealth(check, nodeId);

      if (health.state === 'ready') {
        steps.push({ nodeId, state: 'already-ready' });
        continue;
      }

      if (node.target.kind !== 'compose-service') {
        const diagnostic =
          health.diagnostic ??
          `Stack start cannot safely mutate ${node.target.kind} nodes; the owning domain must make this node ready first.`;
        steps.push({
          nodeId,
          state: 'blocked',
          diagnostic,
        });
        await recordStackActivity(this.dependencies.activityEvents, {
          stack: check.stack,
          node,
          action: 'start',
          status: 'warning',
          diagnostic,
        });
        return {
          stackId,
          state: 'blocked',
          steps,
          check,
        };
      }

      const resolution = resolveStackComposeProject(
        this.dependencies,
        node.target,
      );
      if (resolution.state !== 'resolved') {
        steps.push({
          nodeId,
          state: 'blocked',
          diagnostic: resolution.diagnostic,
        });
        await recordStackActivity(this.dependencies.activityEvents, {
          stack: check.stack,
          node,
          action: 'start',
          status: 'warning',
          diagnostic: resolution.diagnostic,
        });
        return {
          stackId,
          state: 'blocked',
          steps,
          check,
        };
      }

      await recordStackActivity(this.dependencies.activityEvents, {
        stack: check.stack,
        node,
        action: 'start',
        status: 'started',
      });

      try {
        await this.dependencies.dockerComposeLifecycleService.start(
          resolution.project,
          {},
          node.target.service,
        );
      } catch {
        check = await this.dependencies.stackCheckService.check(stackId);
        const diagnostic =
          'Compose lifecycle failed while starting this Stack node.';
        steps.push({
          nodeId,
          state: 'failed',
          diagnostic,
        });
        await recordStackActivity(this.dependencies.activityEvents, {
          stack: check.stack,
          node,
          action: 'start',
          status: 'failed',
          diagnostic,
        });
        return {
          stackId,
          state: 'failed',
          steps,
          check,
        };
      }

      check = await this.dependencies.stackCheckService.check(stackId);
      const after = this.nodeHealth(check, nodeId);
      if (after.state !== 'ready') {
        const diagnostic =
          after.diagnostic ??
          `Stack node is ${after.state}; readiness was not proven after start.`;
        steps.push({
          nodeId,
          state: 'blocked',
          diagnostic,
        });
        await recordStackActivity(this.dependencies.activityEvents, {
          stack: check.stack,
          node,
          action: 'start',
          status: 'warning',
          diagnostic,
        });
        return {
          stackId,
          state: 'blocked',
          steps,
          check,
        };
      }

      steps.push({ nodeId, state: 'started' });
      await recordStackActivity(this.dependencies.activityEvents, {
        stack: check.stack,
        node,
        action: 'start',
        status: 'succeeded',
      });
    }

    return {
      stackId,
      state: 'completed',
      steps,
      check,
    };
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
