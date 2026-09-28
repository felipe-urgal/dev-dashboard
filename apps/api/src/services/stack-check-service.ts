import type {
  DevelopmentEnvironmentLifecycle,
  ManagedProcess,
  ManagedProcessStatus,
  Stack,
  StackCheck,
  StackNodeHealth,
  StackNodeState,
} from '@dev-dashboard/contracts';
import type { ProcessManager } from '@dev-dashboard/process-manager';

import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type { StackStore } from '../store/stack-store.js';
import type { StackComposeHealthAdapter } from './stack-compose-health-adapter.js';
import { StackTopologyService } from './stack-topology-service.js';

export class StackCheckServiceError extends Error {
  public constructor(
    public readonly code: 'STACK_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'StackCheckServiceError';
  }
}

export interface StackCheckServiceOptions {
  now?: () => Date;
}

function environmentState(
  lifecycle: DevelopmentEnvironmentLifecycle,
): StackNodeState {
  switch (lifecycle) {
    case 'ready':
      return 'ready';
    case 'starting':
    case 'stopping':
      return 'starting';
    case 'stopped':
      return 'stopped';
    case 'failed':
      return 'failed';
    case 'degraded':
      return 'unknown';
  }
}

function processState(status: ManagedProcessStatus): StackNodeState {
  switch (status) {
    case 'running':
      return 'ready';
    case 'starting':
    case 'stopping':
      return 'starting';
    case 'stopped':
      return 'stopped';
    case 'failed':
      return 'failed';
  }
}

export class StackCheckService {
  private readonly topology = new StackTopologyService();
  private readonly now: () => Date;

  public constructor(
    private readonly dependencies: {
      stackStore: Pick<StackStore, 'findById'>;
      developmentEnvironmentInstanceStore: Pick<
        DevelopmentEnvironmentInstanceStore,
        'findById'
      >;
      processManager: Pick<ProcessManager, 'listProcesses'>;
      composeHealthAdapter: Pick<StackComposeHealthAdapter, 'observe'>;
    },
    options: StackCheckServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  public async check(stackId: string): Promise<StackCheck> {
    const stack = this.dependencies.stackStore.findById(stackId);
    if (!stack) {
      throw new StackCheckServiceError('STACK_NOT_FOUND', 'Stack not found.');
    }

    const observedAt = this.now().toISOString();
    const processes = await this.dependencies.processManager.listProcesses();
    const processesById = new Map(
      processes.map((process) => [process.id, process]),
    );
    const nodes = await Promise.all(
      stack.nodes.map((node) =>
        this.observeNode(stack, node.id, observedAt, processesById),
      ),
    );

    return {
      stack,
      topology: this.topology.plan(stack),
      health: this.topology.health(stack, nodes, observedAt),
    };
  }

  private async observeNode(
    stack: Stack,
    nodeId: string,
    observedAt: string,
    processesById: ReadonlyMap<string, ManagedProcess>,
  ): Promise<StackNodeHealth> {
    const node = stack.nodes.find((candidate) => candidate.id === nodeId)!;

    if (node.target.kind === 'compose-service') {
      return this.dependencies.composeHealthAdapter.observe(
        nodeId,
        node.target,
        observedAt,
      );
    }

    if (node.target.kind === 'process') {
      const process = processesById.get(node.target.processId);
      if (!process) {
        return {
          nodeId,
          state: 'unknown',
          observedAt,
          diagnostic: 'Managed process is not available.',
        };
      }

      if (
        process.projectId !== node.target.projectId ||
        process.environmentInstanceId !== node.target.environmentInstanceId
      ) {
        return {
          nodeId,
          state: 'unknown',
          observedAt,
          diagnostic:
            'Managed process ownership no longer matches the Stack definition.',
        };
      }

      return {
        nodeId,
        state: processState(process.status),
        observedAt,
      };
    }

    if (node.target.kind !== 'environment') {
      return {
        nodeId,
        state: 'unknown',
        observedAt,
        diagnostic: `No read-only health adapter is available for ${node.target.kind} nodes yet.`,
      };
    }

    const instance =
      this.dependencies.developmentEnvironmentInstanceStore.findById(
        node.target.environmentInstanceId,
      );

    if (!instance) {
      return {
        nodeId,
        state: 'unknown',
        observedAt,
        diagnostic: 'Environment Instance is no longer available.',
      };
    }

    if (instance.projectId !== node.target.projectId) {
      return {
        nodeId,
        state: 'unknown',
        observedAt,
        diagnostic:
          'Environment Instance ownership no longer matches the Stack definition.',
      };
    }

    const state = environmentState(instance.lifecycle);
    return {
      nodeId,
      state,
      observedAt,
      ...(instance.lifecycle === 'degraded'
        ? {
            diagnostic:
              'Environment Instance is degraded; readiness cannot be proven.',
          }
        : {}),
    };
  }
}
