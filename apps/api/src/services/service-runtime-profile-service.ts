import type {
  ServiceRuntimeProfileDraft,
  ServiceRuntimeProfileView,
} from '@dev-dashboard/contracts';

import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';
import type { ProjectServiceBindingStore } from '../store/project-service-binding-store.js';
import type { ServiceRuntimeProfileStore } from '../store/service-runtime-profile-store.js';

export class ServiceRuntimeProfileServiceError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'BAD_REQUEST',
    message: string,
  ) {
    super(message);
    this.name = 'ServiceRuntimeProfileServiceError';
  }
}

type Dependencies = {
  profiles: Pick<
    ServiceRuntimeProfileStore,
    'byProject' | 'revision' | 'save' | 'delete'
  >;
  projects: Pick<ProjectStore, 'findProject'>;
  environments: Pick<DevelopmentEnvironmentInstanceStore, 'findById'>;
  bindings: Pick<ProjectServiceBindingStore, 'byProject' | 'revision'>;
};

function reject(
  code: ServiceRuntimeProfileServiceError['code'],
  message: string,
): never {
  throw new ServiceRuntimeProfileServiceError(code, message);
}

/** Declarative configuration only; does not touch Compose, processes or systemd. */
export class ServiceRuntimeProfileService {
  constructor(
    private readonly d: Dependencies,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private checkEnvironment(
    projectId: string,
    environmentInstanceId: string,
  ): void {
    if (!this.d.projects.findProject(projectId))
      reject('NOT_FOUND', 'Project not found.');
    const env = this.d.environments.findById(environmentInstanceId);
    if (!env || env.projectId !== projectId)
      reject('NOT_FOUND', 'Environment does not belong to this project.');
    if (env.runtime.kind !== 'host')
      reject(
        'CONFLICT',
        'Host service profiles are unavailable inside a Dev Container.',
      );
  }

  private view(
    projectId: string,
    profile: ReturnType<Dependencies['profiles']['byProject']>[number],
  ): ServiceRuntimeProfileView {
    const bindings = new Map(
      this.d.bindings
        .byProject(projectId)
        .map((binding) => [binding.id, binding]),
    );
    return {
      ...profile,
      staleBindingIds: profile.bindingIds.filter((id) => {
        const binding = bindings.get(id);
        return (
          !binding ||
          !binding.enabled ||
          binding.environmentInstanceId !== profile.environmentInstanceId
        );
      }),
    };
  }

  list(projectId: string, environmentInstanceId: string) {
    this.checkEnvironment(projectId, environmentInstanceId);
    const profiles = this.d.profiles
      .byProject(projectId)
      .filter(
        (profile) => profile.environmentInstanceId === environmentInstanceId,
      )
      .map((profile) => this.view(projectId, profile));
    return {
      projectId,
      environmentInstanceId,
      revision: this.d.profiles.revision(projectId),
      bindingsRevision: this.d.bindings.revision(projectId),
      /** No profile: existing dashboard behavior and all enabled bindings remain unchanged. */
      fallback: profiles.length === 0,
      profiles,
    };
  }

  save(
    projectId: string,
    draft: ServiceRuntimeProfileDraft,
    expectedRevision: string,
    expectedBindingsRevision: string,
    id?: string,
  ) {
    this.checkEnvironment(projectId, draft.environmentInstanceId);
    if (expectedBindingsRevision !== this.d.bindings.revision(projectId))
      reject(
        'CONFLICT',
        'Service bindings changed. Refresh before editing the profile.',
      );
    if (new Set(draft.bindingIds).size !== draft.bindingIds.length)
      reject('BAD_REQUEST', 'Binding IDs must be unique.');
    const bindings = new Map(
      this.d.bindings
        .byProject(projectId)
        .map((binding) => [binding.id, binding]),
    );
    for (const bindingId of draft.bindingIds) {
      const binding = bindings.get(bindingId);
      if (
        !binding ||
        !binding.enabled ||
        binding.environmentInstanceId !== draft.environmentInstanceId
      ) {
        reject(
          'CONFLICT',
          'Profile references a missing, disabled or foreign-environment binding.',
        );
      }
    }
    const profile = this.d.profiles.save(
      projectId,
      draft,
      expectedRevision,
      this.now(),
      id,
    );
    return {
      profile: this.view(projectId, profile),
      revision: this.d.profiles.revision(projectId),
      bindingsRevision: this.d.bindings.revision(projectId),
    };
  }

  remove(
    projectId: string,
    environmentInstanceId: string,
    id: string,
    expectedRevision: string,
  ) {
    this.checkEnvironment(projectId, environmentInstanceId);
    const profile = this.d.profiles
      .byProject(projectId)
      .find((item) => item.id === id);
    if (!profile || profile.environmentInstanceId !== environmentInstanceId)
      reject('NOT_FOUND', 'Profile not found for this environment.');
    this.d.profiles.delete(projectId, id, expectedRevision);
    return { revision: this.d.profiles.revision(projectId) };
  }
}
