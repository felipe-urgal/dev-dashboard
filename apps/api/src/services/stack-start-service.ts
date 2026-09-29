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
        steps.push({
          nodeId,
          state: 'blocked',
          diagnostic:
            health.diagnostic ??
            `Stack start cannot safely mutate ${node.target.kind} nodes; the owning domain must make this node ready first.`,
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
        return {
          stackId,
          state: 'blocked',
          steps,
          check,
        };
      }

      try {
        await this.dependencies.dockerComposeLifecycleService.start(
          resolution.project,
          {},
          node.target.service,
        );
      } catch {
        check = await this.dependencies.stackCheckService.check(stackId);
        steps.push({
          nodeId,
          state: 'failed',
          diagnostic:
            'Compose lifecycle failed while starting this Stack node.',
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
        steps.push({
          nodeId,
          state: 'blocked',
          diagnostic:
            after.diagnostic ??
            `Stack node is ${after.state}; readiness was not proven after start.`,
        });
        return {
          stackId,
          state: 'blocked',
          steps,
          check,
        };
      }

      steps.push({ nodeId, state: 'started' });
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
