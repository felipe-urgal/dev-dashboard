import type {
  HostServiceInventory,
  HostServiceObservation,
  ProjectServiceBinding,
  SystemdBoundServiceCapabilities,
  SystemdLifecycleActionCapability,
  SystemdProjectCapabilitiesSnapshot,
} from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';
import { primaryEnvironmentInstanceId } from '../store/development-environment-instance-store.js';
import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';
import type { ProjectServiceBindingStore } from '../store/project-service-binding-store.js';
import type { SystemdServiceInventory } from './systemd-service-inventory.js';
import type { SystemdUserLifecycleGrantPolicy } from './systemd-user-lifecycle-authorization.js';

const SAFE_USER_REF =
  /^systemd:user:[A-Za-z0-9][A-Za-z0-9_.@:-]{0,190}\.service$/;

type Dependencies = {
  projects: Pick<ProjectStore, 'findProject'>;
  environments: Pick<DevelopmentEnvironmentInstanceStore, 'findById'>;
  bindings: Pick<
    ProjectServiceBindingStore,
    'byProject' | 'byResource' | 'revision'
  >;
  inventory: Pick<SystemdServiceInventory, 'inspect'>;
  grants: Pick<SystemdUserLifecycleGrantPolicy, 'find'>;
};

const unsupported = (reason: string): SystemdLifecycleActionCapability => ({
  status: 'unsupported',
  reason,
});
const unknown = (reason: string): SystemdLifecycleActionCapability => ({
  status: 'unknown',
  reason,
});
const permissionRequired = (): SystemdLifecycleActionCapability => ({
  status: 'permission-required',
  reason: 'No current operator grant for this action, binding and revision.',
});

function scopeOf(ref: string): 'user' | 'system' | 'unknown' {
  if (ref.startsWith('systemd:user:')) return 'user';
  if (ref.startsWith('systemd:system:')) return 'system';
  return 'unknown';
}

/** Match the conservative restrictions of the internal systemd user adapter. */
function safeUserRef(ref: string): boolean {
  return (
    SAFE_USER_REF.test(ref) &&
    !ref.includes('..') &&
    !ref.includes('@.service') &&
    !/^systemd:user:dev-dashboard(?:[.@-]|\.service)/i.test(ref)
  );
}

function verifiedObservation(
  value: HostServiceObservation,
  ref: string,
): boolean {
  return (
    value.id === ref &&
    value.provider === 'systemd' &&
    value.scope === 'user' &&
    value.name === ref.slice('systemd:user:'.length) &&
    value.fragmentKind === 'persistent' &&
    (value.unitKind === 'regular' || value.unitKind === 'instance') &&
    !['masked', 'generated', 'transient', 'unknown'].includes(
      value.bootState,
    ) &&
    ((value.state === 'running' &&
      value.activeState === 'active' &&
      value.subState === 'running') ||
      (value.state === 'stopped' && value.activeState === 'inactive'))
  );
}

/**
 * GET-only capability explanation. A policy file or an observed service never
 * activates mutations; the execution gate is intentionally closed.
 */
export class SystemdLifecycleCapabilitiesService {
  private readonly now: () => Date;
  private readonly platform: NodeJS.Platform;

  public constructor(
    private readonly d: Dependencies,
    options: { now?: () => Date; platform?: NodeJS.Platform } = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.platform = options.platform ?? process.platform;
  }

  public async inspect(
    projectId: string,
    environmentInstanceId?: string,
  ): Promise<SystemdProjectCapabilitiesSnapshot> {
    const project = this.d.projects.findProject(projectId);
    if (!project) {
      throw new ApiError({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Project not found.',
      });
    }
    const environmentId =
      environmentInstanceId ?? primaryEnvironmentInstanceId(projectId);
    const environment = this.d.environments.findById(environmentId);
    if (!environment || environment.projectId !== projectId) {
      throw new ApiError({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Environment not found for project.',
      });
    }
    const bindings = this.d.bindings
      .byProject(projectId)
      .filter(
        (binding) =>
          binding.environmentInstanceId === environmentId &&
          binding.serviceRef.startsWith('systemd:'),
      );

    let inventory: HostServiceInventory | undefined;
    if (
      bindings.length > 0 &&
      environment.runtime.kind === 'host' &&
      this.platform === 'linux'
    ) {
      try {
        inventory = await this.d.inventory.inspect();
      } catch {
        // No raw systemctl messages or host paths are returned to the browser.
      }
    }

    const userComplete =
      inventory?.sources.some(
        (source) => source.scope === 'user' && source.status === 'ready',
      ) === true && inventory.truncated === false;
    const revision = this.d.bindings.revision(projectId);
    const services = bindings.map((binding) =>
      this.describe(
        binding,
        revision,
        inventory,
        userComplete,
        environment.runtime.kind,
      ),
    );
    return {
      projectId,
      environmentInstanceId: environmentId,
      readAt: this.now().toISOString(),
      partial:
        bindings.length > 0 &&
        environment.runtime.kind === 'host' &&
        this.platform === 'linux' &&
        !userComplete,
      services,
    };
  }

  private describe(
    binding: ProjectServiceBinding,
    revision: string,
    inventory: HostServiceInventory | undefined,
    userComplete: boolean,
    runtimeKind: string,
  ): SystemdBoundServiceCapabilities {
    const scope = scopeOf(binding.serviceRef);
    const matches =
      inventory?.services.filter(
        (service) => service.id === binding.serviceRef,
      ) ?? [];
    const observation = matches.length === 1 ? matches[0] : undefined;
    const view: SystemdBoundServiceCapabilities = {
      bindingId: binding.id,
      serviceRef: binding.serviceRef,
      scope,
      state: observation?.state ?? 'unknown',
      readiness: 'unknown',
      ...(observation ? { observedAt: observation.observedAt } : {}),
      start: unsupported('Lifecycle execution is not enabled.'),
      stop: unsupported('Lifecycle execution is not enabled.'),
      restart: unsupported('Restart requires a dedicated confirmed plan.'),
      executable: false,
    };

    const both = (capability: SystemdLifecycleActionCapability) => {
      view.start = capability;
      view.stop = capability;
      view.restart = capability;
    };
    if (scope !== 'user') {
      both(unsupported('System units and unsupported scopes are read-only.'));
      return view;
    }
    if (this.platform !== 'linux') {
      both(unsupported('Systemd lifecycle is available on Linux only.'));
      return view;
    }
    if (runtimeKind !== 'host') {
      both(
        unsupported(
          'Host systemd units cannot be operated from Dev Containers.',
        ),
      );
      return view;
    }
    if (!safeUserRef(binding.serviceRef)) {
      both(unsupported('Unit identity is not eligible for lifecycle.'));
      return view;
    }
    if (
      !binding.enabled ||
      binding.relation !== 'required' ||
      !binding.requiredForStart
    ) {
      both(
        unsupported('An enabled required binding is needed for this service.'),
      );
      return view;
    }
    const consumers = this.d.bindings.byResource(binding.serviceRef);
    if (
      consumers.length !== 1 ||
      consumers[0]?.id !== binding.id ||
      consumers[0].projectId !== binding.projectId ||
      consumers[0].environmentInstanceId !== binding.environmentInstanceId
    ) {
      both(unsupported('Service has another consumer or ambiguous ownership.'));
      return view;
    }
    if (!userComplete || !observation) {
      both(unknown('Systemd user observation is incomplete or stale.'));
      return view;
    }
    if (!verifiedObservation(observation, binding.serviceRef)) {
      both(
        unsupported(
          'Systemd unit or runtime state is not safely controllable.',
        ),
      );
      return view;
    }
    const action = (
      name: 'start' | 'stop',
    ): SystemdLifecycleActionCapability => {
      if (name === 'start' && observation.state !== 'stopped') {
        return unsupported('Start requires a verified stopped unit.');
      }
      if (name === 'stop' && observation.state !== 'running') {
        return unsupported('Stop requires a verified running unit.');
      }
      const grant = this.d.grants.find({
        projectId: binding.projectId,
        environmentInstanceId: binding.environmentInstanceId,
        serviceRef: binding.serviceRef,
        action: name,
        expectedRevision: revision,
        // The policy ignores planHash; an actual operation must validate it.
        planHash: '0'.repeat(64),
      });
      if (
        !grant ||
        grant.bindingId !== binding.id ||
        grant.bindingRevision !== revision
      )
        return permissionRequired();
      return unsupported(
        'An executable, confirmed lifecycle plan is not available.',
      );
    };
    view.start = action('start');
    view.stop = action('stop');
    return view;
  }
}
