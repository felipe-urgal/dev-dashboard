import type { Project } from '@dev-dashboard/contracts';

import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type {
  DevContainerOwnershipRecord,
  DevContainerOwnershipStore,
} from './dev-container-ownership-store.js';
import type {
  DevContainerConfigurationKind,
  DevContainerConfigurationSource,
  DevContainerDiscoveryService,
  DevContainerLifecycleHook,
  DevContainerInspection,
  DevContainerInspectionState,
} from './dev-container-discovery-service.js';

const POST_CREATE_HOOKS = new Set<DevContainerLifecycleHook>([
  'onCreateCommand',
  'updateContentCommand',
  'postCreateCommand',
  'postStartCommand',
  'postAttachCommand',
]);

export type DevContainerLifecyclePreflightState =
  'review' | 'blocked' | 'unavailable';

export type DevContainerLifecyclePreflightReason =
  | 'review-required'
  | 'rebuild-ownership-required'
  | 'discovery-not-ready'
  | 'initialize-command-declared'
  | 'compose-ownership-required'
  | 'configuration-kind-unknown';

export type DevContainerLifecycleLimitation = 'post-create-hooks-deferred';

export interface DevContainerLifecyclePreflight {
  projectId: string;
  operation: 'create' | 'rebuild';
  state: DevContainerLifecyclePreflightState;
  reason: DevContainerLifecyclePreflightReason;
  observedAt: string;
  environmentInstanceId: string;
  runtime: 'host' | 'devcontainer';
  /** Evidência interna; o schema HTTP não expõe este campo. */
  runtimeId?: string;
  /** Evidência interna; o schema HTTP não expõe este campo. */
  ownershipToken?: string;
  executionEnabled: false;
  requiresConfirmation: boolean;
  discoveryState?: DevContainerInspectionState;
  configSource?: DevContainerConfigurationSource;
  configurationHash?: string;
  cliVersion?: string;
  configuration?: {
    kind: DevContainerConfigurationKind;
    name?: string;
    service?: string;
    lifecycleHooks: DevContainerLifecycleHook[];
  };
  limitations: DevContainerLifecycleLimitation[];
  diagnostic: string;
}

export interface DevContainerLifecyclePreflightInput {
  environmentInstanceId?: string;
}

export type DevContainerLifecyclePlanningErrorCode =
  'DEV_CONTAINER_ENVIRONMENT_NOT_FOUND';

export class DevContainerLifecyclePlanningError extends Error {
  public constructor(
    public readonly code: DevContainerLifecyclePlanningErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DevContainerLifecyclePlanningError';
  }
}

type DiscoveryReader = Pick<DevContainerDiscoveryService, 'inspect'>;
type EnvironmentResolver = Pick<
  DevelopmentEnvironmentInstanceStore,
  'resolveForProject'
>;
type OwnershipReader = Pick<DevContainerOwnershipStore, 'get'>;

function scopedProject(project: Project, cwd: string): Project {
  return { ...project, path: cwd };
}

function hasPostCreateHooks(
  hooks: readonly DevContainerLifecycleHook[],
): boolean {
  return hooks.some((hook) => POST_CREATE_HOOKS.has(hook));
}

export class DevContainerLifecyclePlanningService {
  public constructor(
    private readonly discovery: DiscoveryReader,
    private readonly environmentInstanceStore: EnvironmentResolver,
    private readonly now: () => Date = () => new Date(),
    private readonly ownershipStore?: OwnershipReader,
  ) {}

  public async plan(
    project: Project,
    input: DevContainerLifecyclePreflightInput = {},
  ): Promise<DevContainerLifecyclePreflight> {
    const executionContext = this.environmentInstanceStore.resolveForProject(
      project.id,
      input.environmentInstanceId,
    );
    if (!executionContext) {
      throw new DevContainerLifecyclePlanningError(
        'DEV_CONTAINER_ENVIRONMENT_NOT_FOUND',
        'Ambiente de desenvolvimento não encontrado ou indisponível para este projeto.',
      );
    }

    const operation: DevContainerLifecyclePreflight['operation'] =
      executionContext.runtime === 'devcontainer' ? 'rebuild' : 'create';
    let ownedRuntime: DevContainerOwnershipRecord | undefined;

    if (operation === 'rebuild') {
      try {
        ownedRuntime = await this.ownershipStore?.get({
          projectId: project.id,
          environmentInstanceId: executionContext.environmentInstanceId,
          projectPath: executionContext.cwd,
        });
      } catch {
        ownedRuntime = undefined;
      }

      if (
        !ownedRuntime ||
        ownedRuntime.phase !== 'owned' ||
        !ownedRuntime.containerId ||
        ownedRuntime.containerId !== executionContext.runtimeId
      ) {
        return {
          projectId: project.id,
          operation,
          state: 'blocked',
          reason: 'rebuild-ownership-required',
          observedAt: this.now().toISOString(),
          environmentInstanceId: executionContext.environmentInstanceId,
          runtime: executionContext.runtime,
          ...(executionContext.runtimeId
            ? { runtimeId: executionContext.runtimeId }
            : {}),
          executionEnabled: false,
          requiresConfirmation: false,
          limitations: [],
          diagnostic:
            'Rebuild exige um Dev Container atual com ownership comprovado para esta Environment Instance.',
        };
      }
    }

    let inspection: DevContainerInspection;
    try {
      inspection = await this.discovery.inspect(
        scopedProject(project, executionContext.cwd),
      );
    } catch {
      return {
        projectId: project.id,
        operation,
        state: 'unavailable',
        reason: 'discovery-not-ready',
        observedAt: this.now().toISOString(),
        environmentInstanceId: executionContext.environmentInstanceId,
        runtime: executionContext.runtime,
        ...(executionContext.runtimeId
          ? { runtimeId: executionContext.runtimeId }
          : {}),
        ...(ownedRuntime
          ? { ownershipToken: ownedRuntime.ownershipToken }
          : {}),
        executionEnabled: false,
        requiresConfirmation: false,
        limitations: [],
        diagnostic:
          'O discovery de Dev Container falhou; o lifecycle permanece indisponível.',
      };
    }

    const base = {
      projectId: project.id,
      operation,
      observedAt: inspection.observedAt,
      environmentInstanceId: executionContext.environmentInstanceId,
      runtime: executionContext.runtime,
      ...(executionContext.runtimeId
        ? { runtimeId: executionContext.runtimeId }
        : {}),
      ...(ownedRuntime ? { ownershipToken: ownedRuntime.ownershipToken } : {}),
      executionEnabled: false as const,
      discoveryState: inspection.state,
      ...(inspection.configSource
        ? { configSource: inspection.configSource }
        : {}),
      ...(inspection.configurationHash
        ? { configurationHash: inspection.configurationHash }
        : {}),
      ...(inspection.cliVersion ? { cliVersion: inspection.cliVersion } : {}),
    };

    if (
      inspection.state !== 'available' ||
      !inspection.configuration ||
      !inspection.configurationHash
    ) {
      return {
        ...base,
        state: 'unavailable',
        reason: 'discovery-not-ready',
        requiresConfirmation: false,
        limitations: [],
        diagnostic:
          inspection.diagnostic ??
          'O discovery não comprovou uma configuração Dev Container utilizável.',
      };
    }

    const configuration = {
      kind: inspection.configuration.kind,
      ...(inspection.configuration.name
        ? { name: inspection.configuration.name }
        : {}),
      ...(inspection.configuration.service
        ? { service: inspection.configuration.service }
        : {}),
      lifecycleHooks: [...inspection.configuration.lifecycleHooks],
    };
    const lifecycleHooks = configuration.lifecycleHooks;
    const common = {
      ...base,
      configuration,
    };

    if (lifecycleHooks.includes('initializeCommand')) {
      return {
        ...common,
        state: 'blocked',
        reason: 'initialize-command-declared',
        requiresConfirmation: false,
        limitations: [],
        diagnostic:
          'A configuração declara initializeCommand, que pode executar no host durante a inicialização e ainda não possui uma autorização segura neste lifecycle.',
      };
    }

    if (configuration.kind === 'compose') {
      return {
        ...common,
        state: 'blocked',
        reason: 'compose-ownership-required',
        requiresConfirmation: false,
        limitations: [],
        diagnostic:
          'Dev Containers baseados em Compose permanecem bloqueados até compartilhar ownership com o domínio Docker Compose e evitar stacks duplicadas.',
      };
    }

    if (configuration.kind === 'unknown') {
      return {
        ...common,
        state: 'blocked',
        reason: 'configuration-kind-unknown',
        requiresConfirmation: false,
        limitations: [],
        diagnostic:
          'O tipo da configuração não foi comprovado; o lifecycle não pode assumir como criar ou limpar o runtime.',
      };
    }

    return {
      ...common,
      state: 'review',
      reason: 'review-required',
      requiresConfirmation: true,
      limitations: hasPostCreateHooks(lifecycleHooks)
        ? ['post-create-hooks-deferred']
        : [],
      diagnostic:
        operation === 'rebuild'
          ? 'O Dev Container owned pode avançar para revisão de rebuild. A execução continua bloqueada até confirmação explícita.'
          : 'A configuração pode avançar para revisão humana. A execução pública permanece desabilitada enquanto o executor interno é qualificado e ainda exige confirmação explícita.',
    };
  }
}
