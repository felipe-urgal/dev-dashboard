import type {
  StackComposeServiceTarget,
  StackNodeHealth,
  StackNodeState,
} from '@dev-dashboard/contracts';

import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';
import type { DockerComposeOwnershipStore } from './docker-compose-ownership-store.js';
import type { DockerComposeProvider } from './docker-compose-provider.js';
import type {
  ComposeServiceHealth,
  ComposeServiceRuntime,
  ComposeServiceState,
} from './docker-compose-model.js';
import { resolveStackComposeProject } from './stack-compose-project-resolver.js';

function composeRuntimeState(service: ComposeServiceRuntime): {
  state: StackNodeState;
  diagnostic?: string;
} {
  const state: ComposeServiceState = service.state;
  const health: ComposeServiceHealth = service.health;

  switch (state) {
    case 'running':
      if (health === 'healthy') return { state: 'ready' };
      if (health === 'starting') return { state: 'starting' };
      if (health === 'unhealthy') {
        return {
          state: 'failed',
          diagnostic: 'Compose service health check is unhealthy.',
        };
      }
      return {
        state: 'unknown',
        diagnostic:
          'Compose service is running, but readiness cannot be proven without healthy health evidence.',
      };
    case 'restarting':
      return { state: 'starting' };
    case 'created':
      return { state: 'stopped' };
    case 'paused':
      return {
        state: 'blocked',
        diagnostic: 'Compose service is paused.',
      };
    case 'dead':
      return {
        state: 'failed',
        diagnostic: 'Compose service container is dead.',
      };
    case 'exited':
      if (service.exitCode === 0) return { state: 'stopped' };
      if (service.exitCode !== undefined) {
        return {
          state: 'failed',
          diagnostic: `Compose service exited with code ${service.exitCode}.`,
        };
      }
      return {
        state: 'unknown',
        diagnostic:
          'Compose service exited, but no exit code is available to classify the result.',
      };
    case 'unknown':
      return {
        state: 'unknown',
        diagnostic: 'Compose service runtime state is unknown.',
      };
  }
}

export class StackComposeHealthAdapter {
  public constructor(
    private readonly dependencies: {
      projectStore: Pick<ProjectStore, 'findProject'>;
      developmentEnvironmentInstanceStore: Pick<
        DevelopmentEnvironmentInstanceStore,
        'resolveForProject'
      >;
      ownershipStore: Pick<DockerComposeOwnershipStore, 'get'>;
      provider: Pick<DockerComposeProvider, 'inspect'>;
    },
  ) {}

  public async observe(
    nodeId: string,
    target: StackComposeServiceTarget,
    observedAt: string,
  ): Promise<StackNodeHealth> {
    const resolution = resolveStackComposeProject(this.dependencies, target);
    if (resolution.state !== 'resolved') {
      return {
        nodeId,
        state: 'unknown',
        observedAt,
        diagnostic: resolution.diagnostic,
      };
    }
    const project = resolution.project;

    let ownership;
    try {
      ownership = await this.dependencies.ownershipStore.get(project);
    } catch {
      return {
        nodeId,
        state: 'unknown',
        observedAt,
        diagnostic: 'Compose ownership could not be read.',
      };
    }

    if (!ownership) {
      return {
        nodeId,
        state: 'unknown',
        observedAt,
        diagnostic: 'Compose ownership is not proven for this project.',
      };
    }

    let inspection;
    try {
      inspection = await this.dependencies.provider.inspect(project);
    } catch {
      return {
        nodeId,
        state: 'unknown',
        observedAt,
        diagnostic: 'Compose runtime inspection failed.',
      };
    }

    if (
      inspection.state !== 'available' ||
      !inspection.config ||
      !inspection.runtime
    ) {
      return {
        nodeId,
        state: 'unknown',
        observedAt,
        diagnostic:
          inspection.diagnostic ??
          'Compose runtime is not available for read-only inspection.',
      };
    }

    if (inspection.config.projectName !== ownership.composeProjectName) {
      return {
        nodeId,
        state: 'unknown',
        observedAt,
        diagnostic:
          'Observed Compose project does not match persisted ownership.',
      };
    }

    if (
      !inspection.config.services.some(
        (service) => service.name === target.service,
      )
    ) {
      return {
        nodeId,
        state: 'unknown',
        observedAt,
        diagnostic: 'Compose service is not present in the resolved config.',
      };
    }

    const runtimeService = inspection.runtime.services.find(
      (service) => service.service === target.service,
    );
    if (!runtimeService) {
      return {
        nodeId,
        state: 'unknown',
        observedAt,
        diagnostic:
          'Compose service has no runtime evidence; stopped state cannot be proven.',
      };
    }

    const mapped = composeRuntimeState(runtimeService);
    return {
      nodeId,
      state: mapped.state,
      observedAt,
      ...(mapped.diagnostic ? { diagnostic: mapped.diagnostic } : {}),
    };
  }
}
