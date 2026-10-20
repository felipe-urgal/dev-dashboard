import type {
  ConfirmedLifecycleRequest,
  Project,
  ServiceLifecyclePlanNode,
} from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';
import { primaryEnvironmentInstanceId } from '../store/development-environment-instance-store.js';
import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';
import type { ConfirmedLifecycleRunner } from './confirmed-service-lifecycle-coordinator.js';
import type { DockerComposeLifecycleService } from './docker-compose-lifecycle-service.js';
import type { DockerComposeOwnershipStore } from './docker-compose-ownership-store.js';
import type { DockerComposeProvider } from './docker-compose-provider.js';

const COMPOSE_SERVICE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

type Dependencies = {
  projects: Pick<ProjectStore, 'findProject'>;
  environments: Pick<DevelopmentEnvironmentInstanceStore, 'findById'>;
  provider: Pick<DockerComposeProvider, 'inspect'>;
  ownership: Pick<DockerComposeOwnershipStore, 'get'>;
  lifecycle: Pick<DockerComposeLifecycleService, 'start' | 'stop'>;
};

function blocked(message: string): never {
  throw new ApiError({
    statusCode: 409,
    code: 'CONFLICT',
    message,
  });
}

/**
 * Internal Compose adapter for ConfirmedServiceLifecycleCoordinator.
 *
 * Calls the existing owner lifecycle; it never spawns Docker itself.
 * Deliberately not wired into an HTTP route or application service. The
 * coordinator's locks are process-local, not distributed leases.
 */
export class ConfirmedComposeLifecycleRunner implements ConfirmedLifecycleRunner {
  public constructor(private readonly dependencies: Dependencies) {}

  public async run(
    action: ConfirmedLifecycleRequest['action'],
    node: Readonly<ServiceLifecyclePlanNode>,
    request: Readonly<ConfirmedLifecycleRequest>,
  ): Promise<void> {
    if (
      node.provider !== 'compose' ||
      node.relation !== 'owned' ||
      node.consumerCount !== 1 ||
      node.disposition !== (action === 'start' ? 'willStart' : 'willStop') ||
      request.action !== action
    ) {
      blocked('This node is not an authorized Compose mutation candidate.');
    }

    const prefix = 'compose:' + request.projectId + ':';
    if (!node.serviceRef.startsWith(prefix)) {
      blocked('Compose service does not belong to the requested project.');
    }
    const service = node.serviceRef.slice(prefix.length);
    if (!COMPOSE_SERVICE_NAME.test(service)) {
      blocked('Invalid Compose service identity.');
    }

    // Other Environment Instances / worktrees require separate ownership and
    // catalog identity support. They must not implicitly use primary paths.
    if (request.environmentInstanceId !== primaryEnvironmentInstanceId(request.projectId)) {
      blocked('Confirmed Compose lifecycle currently requires the primary host environment.');
    }
    const project = this.dependencies.projects.findProject(request.projectId);
    const environment = this.dependencies.environments.findById(request.environmentInstanceId);
    if (
      !project ||
      !environment ||
      environment.projectId !== project.id ||
      environment.runtime.kind !== 'host' ||
      environment.source.kind !== 'primary' ||
      environment.source.path !== project.path
    ) {
      blocked('The Compose project/environment identity is no longer valid.');
    }

    const { config, runtime } = await this.requireOwnership(project);
    const definition = config.services.find((item) => item.name === service);
    if (!definition || !runtime.services.some((item) => item.service === service)) {
      blocked('Compose service identity is not present in the owned runtime.');
    }

    if (action === 'start') {
      // The existing owner's "compose up SERVICE" may implicitly create or
      // recreate declared depends_on services. Until it supports a verified
      // --no-deps flow, reject any such mutation to avoid hidden cascades.
      if (definition.dependsOn.length > 0) {
        blocked('Compose start could mutate implicit dependencies; no-deps support is required.');
      }
      await this.dependencies.lifecycle.start(project, {}, service);
    } else {
      // Stopping a DB under an active dependent can break another service,
      // even if no other ProjectServiceBinding explicitly refers to the DB.
      const dependents = config.services.filter((item) =>
        item.dependsOn.includes(service),
      );
      for (const dependent of dependents) {
        const observed = runtime.services.find((item) => item.service === dependent.name);
        if (!observed || !['exited', 'created', 'dead'].includes(observed.state)) {
          blocked('Compose service has active or unverified dependents.');
        }
      }
      await this.dependencies.lifecycle.stop(project, service);
    }
    // Readiness / stopped state is rechecked by the coordinator via the
    // catalog. Never infer successful execution from command completion.
  }

  private async requireOwnership(project: Project) {
    let owner: Awaited<ReturnType<Dependencies['ownership']['get']>>;
    let inspection: Awaited<ReturnType<Dependencies['provider']['inspect']>>;
    try {
      [owner, inspection] = await Promise.all([
        this.dependencies.ownership.get(project),
        this.dependencies.provider.inspect(project),
      ]);
    } catch {
      return blocked('Compose ownership or observation is currently unavailable.');
    }
    if (
      !owner ||
      owner.projectId !== project.id ||
      owner.projectPath !== project.path ||
      inspection.state !== 'available' ||
      !inspection.config ||
      !inspection.runtime ||
      !inspection.config.projectName ||
      inspection.config.projectName !== owner.composeProjectName
    ) {
      blocked('Compose runtime and persisted ownership no longer match.');
    }
    return { config: inspection.config, runtime: inspection.runtime };
  }
}
