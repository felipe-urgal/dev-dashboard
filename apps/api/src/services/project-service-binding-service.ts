import type {
  ProjectServiceBinding,
  ProjectServiceBindingDraft,
  ProjectServiceBindingPreview,
  ProjectServiceBindingSuggestion,
  ProjectServiceBindingView,
  ServiceCatalogEntry,
  ServiceCatalogSnapshot,
} from '@dev-dashboard/contracts';

import { primaryEnvironmentInstanceId } from '../store/development-environment-instance-store.js';
import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';
import type { ProjectServiceBindingStore } from '../store/project-service-binding-store.js';
import type { ServiceRuntimeProfileStore } from '../store/service-runtime-profile-store.js';
import type { DockerComposeOwnershipStore } from './docker-compose-ownership-store.js';
import type { DockerComposeProvider } from './docker-compose-provider.js';
import type { ServiceCatalogService } from './service-catalog-service.js';

export class ProjectServiceBindingServiceError extends Error {
  public constructor(
    public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'BAD_REQUEST',
    message: string,
  ) {
    super(message);
    this.name = 'ProjectServiceBindingServiceError';
  }
}

interface Dependencies {
  profiles?: Pick<ServiceRuntimeProfileStore, 'byBinding'>;
  store: Pick<
    ProjectServiceBindingStore,
    'list' | 'byProject' | 'byResource' | 'revision' | 'save' | 'delete'
  >;
  projectStore: Pick<ProjectStore, 'findProject'>;
  environmentStore: Pick<DevelopmentEnvironmentInstanceStore, 'findById'>;
  catalog: Pick<ServiceCatalogService, 'inspect'>;
  composeProvider: Pick<DockerComposeProvider, 'inspect'>;
  composeOwnership: Pick<DockerComposeOwnershipStore, 'get'>;
}

function rejected(
  message: string,
  code: ProjectServiceBindingServiceError['code'] = 'BAD_REQUEST',
): never {
  throw new ProjectServiceBindingServiceError(code, message);
}

function bindingOwnedBy(
  entry: ServiceCatalogEntry,
  projectId: string,
  environmentInstanceId: string,
): boolean {
  return (
    entry.ownership === 'confirmed' &&
    entry.projectId === projectId &&
    (entry.environmentInstanceId ?? primaryEnvironmentInstanceId(projectId)) ===
      environmentInstanceId
  );
}

export class ProjectServiceBindingService {
  private readonly now: () => Date;
  public constructor(
    private readonly d: Dependencies,
    options: { now?: () => Date } = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  private project(projectId: string) {
    const project = this.d.projectStore.findProject(projectId);
    if (!project) rejected('Project not found.', 'NOT_FOUND');
    return project;
  }

  private environment(
    projectId: string,
    environmentInstanceId?: string,
  ): string {
    this.project(projectId);
    const id = environmentInstanceId ?? primaryEnvironmentInstanceId(projectId);
    const environment = this.d.environmentStore.findById(id);
    if (!environment || environment.projectId !== projectId) {
      rejected(
        'Environment instance does not belong to this project.',
        'NOT_FOUND',
      );
    }
    if (environment.runtime.kind !== 'host') {
      rejected(
        'Host services cannot be linked to a Dev Container environment.',
        'CONFLICT',
      );
    }
    return id;
  }

  private async observed(): Promise<ServiceCatalogSnapshot> {
    try {
      return await this.d.catalog.inspect();
    } catch {
      return rejected('Service catalog unavailable.', 'CONFLICT');
    }
  }

  private async suggestions(
    projectId: string,
    environmentInstanceId: string,
    catalog: ServiceCatalogSnapshot,
  ): Promise<ProjectServiceBindingSuggestion[]> {
    if (environmentInstanceId !== primaryEnvironmentInstanceId(projectId))
      return [];
    const project = this.project(projectId);
    try {
      const owner = await this.d.composeOwnership.get(project);
      if (!owner) return [];
      const inspection = await this.d.composeProvider.inspect(project);
      if (
        !inspection.config ||
        !inspection.runtime ||
        inspection.state !== 'available' ||
        inspection.config.projectName !== owner.composeProjectName
      )
        return [];
      const available = new Set(
        catalog.entries
          .filter((e) => bindingOwnedBy(e, projectId, environmentInstanceId))
          .map((e) => e.id),
      );
      const result: ProjectServiceBindingSuggestion[] = [];
      for (const service of inspection.config.services) {
        const serviceRef = 'compose:' + projectId + ':' + service.name;
        if (!available.has(serviceRef)) continue;
        for (const dependency of service.dependsOn) {
          const dependsOnServiceRef = 'compose:' + projectId + ':' + dependency;
          if (
            !available.has(dependsOnServiceRef) ||
            serviceRef === dependsOnServiceRef
          )
            continue;
          result.push({
            serviceRef,
            dependsOnServiceRef,
            source: 'compose',
            observedAt: inspection.observedAt,
          });
        }
      }
      return result.slice(0, 100);
    } catch {
      return [];
    }
  }

  public async preview(
    projectId: string,
    environmentInstanceId?: string,
  ): Promise<ProjectServiceBindingPreview> {
    const id = this.environment(projectId, environmentInstanceId);
    const catalog = await this.observed();
    return {
      projectId,
      environmentInstanceId: id,
      candidates: catalog.entries.map((e) => ({
        serviceRef: e.id,
        name: e.name,
        provider: e.provider,
        ownership: e.ownership,
        linkableAsOwned: bindingOwnedBy(e, projectId, id),
      })),
      suggestions: await this.suggestions(projectId, id, catalog),
      partial: catalog.status !== 'ready' || catalog.truncated,
      ...(catalog.status !== 'ready' || catalog.truncated
        ? {
            diagnostic:
              'Catalog is incomplete; missing resources cannot be adopted.',
          }
        : {}),
    };
  }

  private view(
    binding: ProjectServiceBinding,
    observed: ReadonlySet<string>,
  ): ProjectServiceBindingView {
    const orphaned =
      !this.d.projectStore.findProject(binding.projectId) ||
      this.d.environmentStore.findById(binding.environmentInstanceId)
        ?.projectId !== binding.projectId;
    const consumers = this.d.store.byResource(binding.serviceRef);
    return {
      ...binding,
      availability: orphaned
        ? 'orphaned'
        : observed.has(binding.serviceRef)
          ? 'observed'
          : 'stale',
      shared:
        new Set(
          consumers.map(
            (item) => item.projectId + '\0' + item.environmentInstanceId,
          ),
        ).size > 1,
      consumerCount: new Set(
        consumers.map(
          (item) => item.projectId + '\0' + item.environmentInstanceId,
        ),
      ).size,
    };
  }

  public async list(projectId: string) {
    this.project(projectId);
    const catalog = await this.observed();
    const observed = new Set(catalog.entries.map((e) => e.id));
    return {
      revision: this.d.store.revision(projectId),
      bindings: this.d.store
        .byProject(projectId)
        .map((b) => this.view(b, observed)),
      partial: catalog.status !== 'ready' || catalog.truncated,
    };
  }

  public async consumers(serviceRef: string) {
    if (!serviceRef || serviceRef.length > 512)
      rejected('Invalid service reference.');
    const catalog = await this.observed();
    const observed = new Set(catalog.entries.map((e) => e.id));
    return {
      serviceRef,
      bindings: this.d.store
        .byResource(serviceRef)
        .map((b) => this.view(b, observed)),
      partial: catalog.status !== 'ready' || catalog.truncated,
    };
  }

  public async save(
    projectId: string,
    input: ProjectServiceBindingDraft,
    expectedRevision: string,
    id?: string,
  ) {
    const environmentInstanceId = this.environment(
      projectId,
      input.environmentInstanceId,
    );
    if (!/^[a-f0-9]{64}$/.test(expectedRevision)) rejected('Invalid revision.');
    const catalog = await this.observed();
    const entries = new Map(catalog.entries.map((e) => [e.id, e]));
    const observed = entries.get(input.serviceRef);
    if (!observed)
      rejected('Resource is not present in the observed catalog.', 'CONFLICT');
    if (
      input.relation === 'owned' &&
      !bindingOwnedBy(observed, projectId, environmentInstanceId)
    ) {
      rejected(
        'Resource ownership is not proven for this environment.',
        'CONFLICT',
      );
    }
    if (input.requiredForStart && input.relation === 'observed') {
      rejected('An observed-only service cannot be required for start.');
    }

    const unique = new Set<string>();
    for (const dependency of input.dependencies) {
      if (
        unique.has(dependency.serviceRef) ||
        dependency.serviceRef === input.serviceRef
      ) {
        rejected(
          'Dependencies must be unique and cannot reference themselves.',
        );
      }
      unique.add(dependency.serviceRef);
      if (!entries.has(dependency.serviceRef)) {
        rejected(
          'Dependency is not present in the observed catalog.',
          'CONFLICT',
        );
      }
    }

    const suggestions = input.dependencies.some((d) => d.source === 'compose')
      ? await this.suggestions(projectId, environmentInstanceId, catalog)
      : [];
    for (const dependency of input.dependencies.filter(
      (d) => d.source === 'compose',
    )) {
      if (
        !suggestions.some(
          (candidate) =>
            candidate.serviceRef === input.serviceRef &&
            candidate.dependsOnServiceRef === dependency.serviceRef,
        )
      ) {
        rejected(
          'Compose dependency is not confirmed by provider evidence.',
          'CONFLICT',
        );
      }
    }

    // Reject cycles even when a dependency is shared by multiple projects.
    const graph = new Map<string, Set<string>>();
    for (const binding of this.d.store.list()) {
      if (id && binding.id === id) continue;
      const edges = graph.get(binding.serviceRef) ?? new Set<string>();
      for (const dependency of binding.dependencies)
        edges.add(dependency.serviceRef);
      graph.set(binding.serviceRef, edges);
    }
    const edges = graph.get(input.serviceRef) ?? new Set<string>();
    for (const dependency of input.dependencies)
      edges.add(dependency.serviceRef);
    graph.set(input.serviceRef, edges);
    const visited = new Set<string>();
    const pending = new Set<string>();
    const walk = (serviceRef: string): void => {
      if (pending.has(serviceRef))
        rejected('Dependency cycle detected.', 'CONFLICT');
      if (visited.has(serviceRef)) return;
      pending.add(serviceRef);
      for (const dependency of graph.get(serviceRef) ?? []) walk(dependency);
      pending.delete(serviceRef);
      visited.add(serviceRef);
    };
    for (const serviceRef of graph.keys()) walk(serviceRef);
    // Environment could have been removed while observations were fetched.
    this.environment(projectId, environmentInstanceId);

    // No external/unknown discovery can create management rights. A declared
    // relation never grants the ability to start/stop the observed resource.
    const draft: ProjectServiceBindingDraft & {
      environmentInstanceId: string;
    } = {
      ...input,
      environmentInstanceId,
      dependencies: input.dependencies.map((dependency) => {
        if (dependency.source !== 'compose') {
          return {
            serviceRef: dependency.serviceRef,
            source: 'manual' as const,
          };
        }
        const evidence = suggestions.find(
          (item) =>
            item.serviceRef === input.serviceRef &&
            item.dependsOnServiceRef === dependency.serviceRef,
        );
        return {
          serviceRef: dependency.serviceRef,
          source: 'compose' as const,
          observedAt: evidence!.observedAt,
        };
      }),
    };
    const saved = this.d.store.save(
      projectId,
      draft,
      expectedRevision,
      this.now(),
      id,
    );
    return { binding: saved, revision: this.d.store.revision(projectId) };
  }

  public remove(projectId: string, id: string, expectedRevision: string) {
    this.project(projectId);
    if (this.d.profiles?.byBinding(id).length) {
      rejected('Binding belongs to a runtime profile. Update the profile first.', 'CONFLICT');
    }
    this.d.store.delete(projectId, id, expectedRevision);
    return { revision: this.d.store.revision(projectId) };
  }
}
