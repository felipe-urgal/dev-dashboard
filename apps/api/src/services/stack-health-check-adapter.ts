import type {
  ManagedProcessStatus,
  StackHealthCheckTarget,
  StackNodeHealth,
  StackNodeState,
} from '@dev-dashboard/contracts';
import type { ProcessManager } from '@dev-dashboard/process-manager';

import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';

const SERVER_HEALTH_CHECK_ID = 'server';

function processState(status: ManagedProcessStatus): {
  state: StackNodeState;
  diagnostic?: string;
} {
  switch (status) {
    case 'running':
      return { state: 'ready' };
    case 'starting':
      return { state: 'starting' };
    case 'stopping':
    case 'stopped':
      return { state: 'stopped' };
    case 'failed':
      return {
        state: 'failed',
        diagnostic: 'Server process failed.',
      };
  }
}

export class StackHealthCheckAdapter {
  public constructor(
    private readonly dependencies: {
      projectStore: Pick<ProjectStore, 'findProject'>;
      developmentEnvironmentInstanceStore: Pick<
        DevelopmentEnvironmentInstanceStore,
        'findById'
      >;
      processManager: Pick<ProcessManager, 'getServerProcess'>;
    },
  ) {}

  public async observe(
    nodeId: string,
    target: StackHealthCheckTarget,
    observedAt: string,
  ): Promise<StackNodeHealth> {
    if (target.checkId !== SERVER_HEALTH_CHECK_ID) {
      return {
        nodeId,
        state: 'unknown',
        observedAt,
        diagnostic: `Unknown health check id: ${target.checkId}.`,
      };
    }

    const project = this.dependencies.projectStore.findProject(
      target.projectId,
    );
    if (!project) {
      return {
        nodeId,
        state: 'unknown',
        observedAt,
        diagnostic: 'Health check project is no longer available.',
      };
    }

    if (!target.environmentInstanceId) {
      return {
        nodeId,
        state: 'unknown',
        observedAt,
        diagnostic:
          'Server health check requires an explicit Environment Instance.',
      };
    }

    const environmentInstance =
      this.dependencies.developmentEnvironmentInstanceStore.findById(
        target.environmentInstanceId,
      );
    if (!environmentInstance) {
      return {
        nodeId,
        state: 'unknown',
        observedAt,
        diagnostic: 'Health check Environment Instance is no longer available.',
      };
    }

    if (environmentInstance.projectId !== target.projectId) {
      return {
        nodeId,
        state: 'unknown',
        observedAt,
        diagnostic:
          'Health check Environment Instance ownership no longer matches the Stack definition.',
      };
    }

    const process = await this.dependencies.processManager.getServerProcess(
      target.projectId,
      target.environmentInstanceId,
    );

    if (!process) {
      return {
        nodeId,
        state: 'unknown',
        observedAt,
        diagnostic: 'Server health check requires an owned server process.',
      };
    }

    if (
      process.projectId !== target.projectId ||
      process.environmentInstanceId !== target.environmentInstanceId
    ) {
      return {
        nodeId,
        state: 'unknown',
        observedAt,
        diagnostic:
          'Server process ownership no longer matches the Stack definition.',
      };
    }

    const mapped = processState(process.status);

    return {
      nodeId,
      state: mapped.state,
      observedAt,
      ...(mapped.diagnostic ? { diagnostic: mapped.diagnostic } : {}),
    };
  }
}
