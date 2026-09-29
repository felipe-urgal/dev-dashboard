import type {
  StackHealthCheckTarget,
  StackNodeHealth,
  StackNodeState,
} from '@dev-dashboard/contracts';
import type {
  ProcessManager,
  ProjectServerSettingsRepository,
} from '@dev-dashboard/process-manager';

import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';
import type { ServerHealthCheckService } from './server-health-check-service.js';

const SERVER_HEALTH_CHECK_ID = 'server';

function healthState(status: 'healthy' | 'degraded' | 'unavailable'): {
  state: StackNodeState;
  diagnostic?: string;
} {
  switch (status) {
    case 'healthy':
      return { state: 'ready' };
    case 'degraded':
      return {
        state: 'unknown',
        diagnostic:
          'Server health check is degraded; readiness cannot be proven.',
      };
    case 'unavailable':
      return {
        state: 'failed',
        diagnostic: 'Server health check is unavailable.',
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
      serverSettingsRepository: Pick<ProjectServerSettingsRepository, 'find'>;
      serverHealthCheckService: Pick<ServerHealthCheckService, 'check'>;
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

    const [process, settings] = await Promise.all([
      this.dependencies.processManager.getServerProcess(
        target.projectId,
        target.environmentInstanceId,
      ),
      this.dependencies.serverSettingsRepository.find(target.projectId),
    ]);

    if (!process || process.status !== 'running') {
      return {
        nodeId,
        state: 'unknown',
        observedAt,
        diagnostic:
          'Server health check requires an owned running server process.',
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

    const port = process.port ?? settings.port;
    if (port === undefined) {
      return {
        nodeId,
        state: 'unknown',
        observedAt,
        diagnostic: 'Server health check has no known port.',
      };
    }

    if (!settings.healthCheckPath) {
      return {
        nodeId,
        state: 'unknown',
        observedAt,
        diagnostic: 'Server health check path is not configured.',
      };
    }

    const health = await this.dependencies.serverHealthCheckService.check({
      projectId: target.projectId,
      port,
      healthCheckPath: settings.healthCheckPath,
    });
    const mapped = healthState(health.status);

    return {
      nodeId,
      state: mapped.state,
      observedAt,
      ...(mapped.diagnostic
        ? {
            diagnostic: health.message
              ? `${mapped.diagnostic} ${health.message}`
              : mapped.diagnostic,
          }
        : {}),
    };
  }
}
