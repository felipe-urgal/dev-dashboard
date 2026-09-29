import type {
  ManagedProcess,
  StackCheck,
  StackStopResult,
  StackStopStep,
} from '@dev-dashboard/contracts';
import type { ProcessManager } from '@dev-dashboard/process-manager';

import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';
import type { StackCheckService } from './stack-check-service.js';
import type { DockerComposeLifecycleService } from './docker-compose-lifecycle-service.js';
import { resolveStackComposeProject } from './stack-compose-project-resolver.js';

export class StackStopService {
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
        'stop'
      >;
      processManager: Pick<
        ProcessManager,
        'listProcesses' | 'stopServer' | 'stopWorker' | 'stopTest'
      >;
    },
  ) {}

  public async stop(stackId: string): Promise<StackStopResult> {
    let check = await this.dependencies.stackCheckService.check(stackId);
    const steps: StackStopStep[] = [];

    for (const nodeId of check.topology.stopOrder) {
      const node = check.stack.nodes.find(
        (candidate) => candidate.id === nodeId,
      )!;
      const health = this.nodeHealth(check, nodeId);

      if (health.state === 'stopped') {
        steps.push({ nodeId, state: 'already-stopped' });
        continue;
      }

      if (node.target.kind === 'environment') {
        steps.push({
          nodeId,
          state: 'retained',
          diagnostic:
            'Environment Instance is an execution context and is not stopped by Stack lifecycle.',
        });
        continue;
      }

      if (node.target.kind === 'health-check') {
        steps.push({
          nodeId,
          state: 'retained',
          diagnostic:
            'Health check nodes are read-only and have no mutable stop operation.',
        });
        continue;
      }

      if (node.target.kind === 'compose-service') {
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
          const result =
            await this.dependencies.dockerComposeLifecycleService.stop(
              resolution.project,
              node.target.service,
            );
          check = await this.dependencies.stackCheckService.check(stackId);

          if (result.state !== 'stopped') {
            steps.push({
              nodeId,
              state: 'blocked',
              diagnostic:
                result.diagnostic ??
                'Compose stop completed without proving the service is stopped.',
            });
            return {
              stackId,
              state: 'blocked',
              steps,
              check,
            };
          }

          steps.push({ nodeId, state: 'stopped' });
          continue;
        } catch {
          check = await this.dependencies.stackCheckService.check(stackId);
          steps.push({
            nodeId,
            state: 'failed',
            diagnostic:
              'Compose lifecycle failed while stopping this Stack node.',
          });
          return {
            stackId,
            state: 'failed',
            steps,
            check,
          };
        }
      }

      const process = await this.findOwnedProcess(node.target.processId);
      if (!process) {
        steps.push({
          nodeId,
          state: 'blocked',
          diagnostic:
            'Managed process ownership could not be proven for this Stack node.',
        });
        return {
          stackId,
          state: 'blocked',
          steps,
          check,
        };
      }

      if (
        process.projectId !== node.target.projectId ||
        process.environmentInstanceId !== node.target.environmentInstanceId
      ) {
        steps.push({
          nodeId,
          state: 'blocked',
          diagnostic:
            'Managed process ownership no longer matches the Stack definition.',
        });
        return {
          stackId,
          state: 'blocked',
          steps,
          check,
        };
      }

      if (process.status === 'stopped') {
        steps.push({ nodeId, state: 'already-stopped' });
        continue;
      }

      try {
        const stopped = await this.stopManagedProcess(process);
        if (!stopped) {
          steps.push({
            nodeId,
            state: 'blocked',
            diagnostic:
              'This managed process kind has no safe Stack stop adapter.',
          });
          return {
            stackId,
            state: 'blocked',
            steps,
            check,
          };
        }

        check = await this.dependencies.stackCheckService.check(stackId);
        if (
          stopped.id !== node.target.processId ||
          stopped.status !== 'stopped'
        ) {
          steps.push({
            nodeId,
            state: 'blocked',
            diagnostic:
              'Process Manager did not prove the explicit Stack process stopped.',
          });
          return {
            stackId,
            state: 'blocked',
            steps,
            check,
          };
        }

        steps.push({ nodeId, state: 'stopped' });
      } catch {
        check = await this.dependencies.stackCheckService.check(stackId);
        steps.push({
          nodeId,
          state: 'failed',
          diagnostic: 'Process Manager failed while stopping this Stack node.',
        });
        return {
          stackId,
          state: 'failed',
          steps,
          check,
        };
      }
    }

    check = await this.dependencies.stackCheckService.check(stackId);
    return {
      stackId,
      state: 'completed',
      steps,
      check,
    };
  }

  private async findOwnedProcess(
    processId: string,
  ): Promise<ManagedProcess | null> {
    const processes = await this.dependencies.processManager.listProcesses();
    return processes.find((process) => process.id === processId) ?? null;
  }

  private stopManagedProcess(
    process: ManagedProcess,
  ): Promise<ManagedProcess> | null {
    switch (process.kind) {
      case 'server':
        return this.dependencies.processManager.stopServer(
          process.projectId,
          process.environmentInstanceId,
        );
      case 'worker':
      case 'webpack':
        return this.dependencies.processManager.stopWorker(
          process.projectId,
          process.kind,
          process.environmentInstanceId,
        );
      case 'test':
        return this.dependencies.processManager.stopTest(
          process.projectId,
          process.environmentInstanceId,
        );
      case 'script':
        return null;
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
