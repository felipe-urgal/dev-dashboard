import type { Project } from '@dev-dashboard/contracts';

import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
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
  | 'runtime-not-host'
  | 'discovery-not-ready'
  | 'initialize-command-declared'
  | 'compose-ownership-required'
  | 'configuration-kind-unknown';

export type DevContainerLifecycleLimitation =
  'cleanup-adapter-pending' | 'post-create-hooks-deferred';

export interface DevContainerLifecyclePreflight {
  projectId: string;
  operation: 'create';
  state: DevContainerLifecyclePreflightState;
  reason: DevContainerLifecyclePreflightReason;
  observedAt: string;
  environmentInstanceId: string;
  runtime: 'host' | 'devcontainer';
  executionEnabled: false;
  requiresConfirmation: boolean;
  discoveryState?: DevContainerInspectionState;
  configSource?: DevContainerConfigurationSource;
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

    if (executionContext.runtime !== 'host') {
      return {
        projectId: project.id,
        operation: 'create',
        state: 'blocked',
        reason: 'runtime-not-host',
        observedAt: this.now().toISOString(),
        environmentInstanceId: executionContext.environmentInstanceId,
        runtime: executionContext.runtime,
        executionEnabled: false,
        requiresConfirmation: false,
        limitations: ['cleanup-adapter-pending'],
        diagnostic:
          'A criação inicial de Dev Container só pode ser planejada a partir de uma Environment Instance host.',
      };
    }

    let inspection: DevContainerInspection;
    try {
      inspection = await this.discovery.inspect(
        scopedProject(project, executionContext.cwd),
      );
    } catch {
      return {
        projectId: project.id,
        operation: 'create',
        state: 'unavailable',
        reason: 'discovery-not-ready',
        observedAt: this.now().toISOString(),
        environmentInstanceId: executionContext.environmentInstanceId,
        runtime: executionContext.runtime,
        executionEnabled: false,
        requiresConfirmation: false,
        limitations: ['cleanup-adapter-pending'],
        diagnostic:
          'O discovery de Dev Container falhou; o lifecycle permanece indisponível.',
      };
    }

    const base = {
      projectId: project.id,
      operation: 'create' as const,
      observedAt: inspection.observedAt,
      environmentInstanceId: executionContext.environmentInstanceId,
      runtime: executionContext.runtime,
      executionEnabled: false as const,
      discoveryState: inspection.state,
      ...(inspection.configSource
        ? { configSource: inspection.configSource }
        : {}),
      ...(inspection.cliVersion ? { cliVersion: inspection.cliVersion } : {}),
    };

    if (inspection.state !== 'available' || !inspection.configuration) {
      return {
        ...base,
        state: 'unavailable',
        reason: 'discovery-not-ready',
        requiresConfirmation: false,
        limitations: ['cleanup-adapter-pending'],
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
        limitations: ['cleanup-adapter-pending'],
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
        limitations: ['cleanup-adapter-pending'],
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
        limitations: ['cleanup-adapter-pending'],
        diagnostic:
          'O tipo da configuração não foi comprovado; o lifecycle não pode assumir como criar ou limpar o runtime.',
      };
    }

    return {
      ...common,
      state: 'review',
      reason: 'review-required',
      requiresConfirmation: true,
      limitations: [
        'cleanup-adapter-pending',
        ...(hasPostCreateHooks(lifecycleHooks)
          ? (['post-create-hooks-deferred'] as const)
          : []),
      ],
      diagnostic:
        'A configuração pode avançar para revisão humana, mas a execução permanece desabilitada até existir ownership/cleanup completo e confirmação explícita.',
    };
  }
}
