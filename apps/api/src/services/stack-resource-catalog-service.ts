import type { StackResource } from '@dev-dashboard/contracts';
import type { ProcessManager } from '@dev-dashboard/process-manager';

import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';
import type { DockerComposeOwnershipStore } from './docker-compose-ownership-store.js';
import type { DockerComposeProvider } from './docker-compose-provider.js';
import { resolveStackComposeProject } from './stack-compose-project-resolver.js';

/**
 * Read-only catalog. All target identities come from server-owned stores and
 * Compose's structured, ownership-matched configuration.
 */
export class StackResourceCatalogService {
  public constructor(
    private readonly dependencies: {
      projectStore: Pick<ProjectStore, 'findProject'>;
      environments: Pick<
        DevelopmentEnvironmentInstanceStore,
        'list' | 'resolveForProject'
      >;
      processes: Pick<ProcessManager, 'listProcesses'>;
      compose: Pick<DockerComposeProvider, 'inspect'>;
      ownership: Pick<DockerComposeOwnershipStore, 'get'>;
    },
  ) {}

  public async list(): Promise<StackResource[]> {
    const resources: StackResource[] = [];
    const environments = this.dependencies.environments.list();
    const knownEnvironments = new Map(
      environments.map((environment) => [environment.id, environment]),
    );

    for (const environment of environments) {
      const project = this.dependencies.projectStore.findProject(
        environment.projectId,
      );
      if (!project) continue;
      const name =
        project.name +
        ' · ' +
        environment.source.kind +
        ' (' +
        environment.id +
        ')';
      resources.push({
        name: name + ' · Ambiente',
        target: {
          kind: 'environment',
          projectId: project.id,
          environmentInstanceId: environment.id,
        },
      });
      if (project.capabilities.includes('server')) {
        resources.push({
          name: name + ' · Health check do servidor',
          target: {
            kind: 'health-check',
            projectId: project.id,
            environmentInstanceId: environment.id,
            checkId: 'server',
          },
        });
      }
    }

    // Processes without a currently owned Environment Instance are not selectable.
    const processes = await this.dependencies.processes.listProcesses();
    for (const process of processes) {
      const environment = process.environmentInstanceId
        ? knownEnvironments.get(process.environmentInstanceId)
        : undefined;
      if (!environment || environment.projectId !== process.projectId) continue;
      const project = this.dependencies.projectStore.findProject(
        process.projectId,
      );
      if (!project || !process.id || process.id.length > 160) continue;
      resources.push({
        name:
          project.name +
          ' · Processo ' +
          process.kind +
          ' (' +
          process.id +
          ')',
        target: {
          kind: 'process',
          projectId: project.id,
          environmentInstanceId: environment.id,
          processId: process.id,
        },
      });
    }

    // Compose resources are offered only when the trusted runtime resolver and
    // persisted owner agree. Never accept a service name invented by the browser.
    for (const environment of environments) {
      const resolution = resolveStackComposeProject(
        {
          projectStore: this.dependencies.projectStore,
          developmentEnvironmentInstanceStore: this.dependencies.environments,
        },
        {
          projectId: environment.projectId,
          environmentInstanceId: environment.id,
        },
      );
      if (resolution.state !== 'resolved') continue;
      try {
        const owner = await this.dependencies.ownership.get(resolution.project);
        if (!owner) continue;
        const inspection = await this.dependencies.compose.inspect(
          resolution.project,
        );
        if (
          !inspection.config ||
          inspection.config.projectName !== owner.composeProjectName
        )
          continue;
        const project = this.dependencies.projectStore.findProject(
          environment.projectId,
        );
        if (!project) continue;
        for (const service of inspection.config.services) {
          if (!service.name || service.name.length > 160) continue;
          resources.push({
            name:
              project.name +
              ' · Compose ' +
              service.name +
              ' (' +
              environment.id +
              ')',
            target: {
              kind: 'compose-service',
              projectId: project.id,
              environmentInstanceId: environment.id,
              service: service.name,
            },
          });
        }
      } catch {
        // A failed resource discovery does not authorize a guessed target.
      }
    }

    const unique = new Map<string, StackResource>();
    for (const resource of resources) {
      unique.set(JSON.stringify(resource.target), resource);
    }
    return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}
