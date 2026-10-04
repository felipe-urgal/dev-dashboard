import type {
  DeploymentDriftStatus,
  DeploymentProviderAvailability,
  ProductionCommandStatusAvailability,
  ProductionCommandStatusIssueCode,
  DeploymentProviderIssueCode,
  DeploymentProviderState,
  DeploymentStepStatus,
  ProductionCommandId,
  ProductionDeploymentStatus,
  Project,
} from '@dev-dashboard/contracts';

import {
  PackageScriptProductionStatusReader,
  type CommandProductionStatusReader,
} from './command-status.js';
import { DeploymentError } from './errors.js';
import {
  GitDeploymentOriginRevisionResolver,
  type DeploymentOriginRevisionResolver,
} from './origin-revision.js';
import {
  VercelDeploymentAdapter,
  type VercelProductionSnapshot,
} from './vercel-adapter.js';

const LOCAL_OPERATION_ORDER = [
  'check',
  'migrate',
  'verify',
] as const satisfies readonly ProductionCommandId[];

const PROVIDER_AVAILABILITY_BY_ERROR = {
  DEPLOYMENT_PROVIDER_INTEGRATION_UNAVAILABLE: 'not-configured',
  DEPLOYMENT_PROVIDER_AUTH_FAILED: 'auth-error',
  DEPLOYMENT_PROVIDER_QUOTA_EXCEEDED: 'quota-limited',
  DEPLOYMENT_PROVIDER_PROJECT_NOT_FOUND: 'project-not-found',
  DEPLOYMENT_PROVIDER_UNAVAILABLE: 'unavailable',
  DEPLOYMENT_PROVIDER_RESPONSE_INVALID: 'invalid-response',
} as const satisfies Record<
  DeploymentProviderIssueCode,
  DeploymentProviderAvailability
>;

export interface ProductionDeploymentProviderReader {
  readProduction(externalProject: string): Promise<VercelProductionSnapshot>;
}

export interface ProductionDeploymentStatusServiceOptions {
  provider?: ProductionDeploymentProviderReader;
  commandReader?: CommandProductionStatusReader;
  originRevisionResolver?: DeploymentOriginRevisionResolver;
  now?: () => number;
}

function stepStatus(state: DeploymentProviderState): DeploymentStepStatus {
  switch (state) {
    case 'building':
      return 'running';
    case 'ready':
      return 'succeeded';
    case 'error':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'queued':
    case 'unknown':
      return 'pending';
  }
}

function drift(
  originRevision: string | undefined,
  productionRevision: string | undefined,
): DeploymentDriftStatus {
  if (!originRevision || !productionRevision) return 'unknown';
  return originRevision === productionRevision ? 'in-sync' : 'drift';
}

function providerIssue(error: unknown):
  | {
      code: DeploymentProviderIssueCode;
      availability: DeploymentProviderAvailability;
      message: string;
    }
  | undefined {
  if (!(error instanceof DeploymentError)) return undefined;
  if (!(error.code in PROVIDER_AVAILABILITY_BY_ERROR)) return undefined;

  const code = error.code as DeploymentProviderIssueCode;
  return {
    code,
    availability: PROVIDER_AVAILABILITY_BY_ERROR[code],
    message: error.message,
  };
}

function commandIssue(error: unknown):
  | {
      code: ProductionCommandStatusIssueCode;
      availability: ProductionCommandStatusAvailability;
      message: string;
    }
  | undefined {
  if (!(error instanceof DeploymentError)) return undefined;
  switch (error.code) {
    case 'DEPLOYMENT_COMMAND_STATUS_TIMEOUT':
      return {
        code: error.code,
        availability: 'timeout',
        message: error.message,
      };
    case 'DEPLOYMENT_COMMAND_STATUS_FAILED':
      return {
        code: error.code,
        availability: 'command-failed',
        message: error.message,
      };
    case 'DEPLOYMENT_COMMAND_STATUS_INVALID':
      return {
        code: error.code,
        availability: 'invalid-response',
        message: error.message,
      };
    case 'DEPLOYMENT_PACKAGE_MANAGER_UNSUPPORTED':
    case 'DEPLOYMENT_PRODUCTION_UNAVAILABLE':
      return {
        code: error.code,
        availability: 'unavailable',
        message: error.message,
      };
    default:
      return undefined;
  }
}

export class ProductionDeploymentStatusService {
  private readonly provider: ProductionDeploymentProviderReader;
  private readonly commandReader: CommandProductionStatusReader;
  private readonly originRevisionResolver: DeploymentOriginRevisionResolver;
  private readonly now: () => number;

  public constructor(options: ProductionDeploymentStatusServiceOptions = {}) {
    this.provider = options.provider ?? new VercelDeploymentAdapter();
    this.commandReader =
      options.commandReader ?? new PackageScriptProductionStatusReader();
    this.originRevisionResolver =
      options.originRevisionResolver ??
      new GitDeploymentOriginRevisionResolver();
    this.now = options.now ?? Date.now;
  }

  public async read(project: Project): Promise<ProductionDeploymentStatus> {
    const production = project.production;
    if (!production?.enabled || !project.capabilities.includes('production')) {
      throw new DeploymentError(
        'DEPLOYMENT_PRODUCTION_UNAVAILABLE',
        'O projeto não possui produção habilitada e válida.',
      );
    }
    if (production.strategy === 'command') {
      if (
        production.provider !== 'systemd' &&
        production.provider !== 'docker-compose'
      ) {
        throw new DeploymentError(
          'DEPLOYMENT_STRATEGY_UNSUPPORTED',
          'O status command exige provider systemd ou docker-compose.',
        );
      }

      const originRevision = await this.originRevisionResolver.resolve(
        project,
        production.branch,
      );
      const checkedAt = new Date(this.now()).toISOString();
      const base = {
        projectId: project.id,
        projectName: project.name,
        strategy: 'command' as const,
        provider: production.provider,
        branch: production.branch,
        checkedAt,
        ...(originRevision ? { originRevision } : {}),
      };

      try {
        const commandStatus = await this.commandReader.read(project);
        return {
          ...base,
          statusAvailability: 'available' as const,
          productionRevision: commandStatus.revision,
          runtimeState: commandStatus.state,
          drift: drift(originRevision, commandStatus.revision),
        };
      } catch (error) {
        const issue = commandIssue(error);
        if (!issue) throw error;
        return {
          ...base,
          statusAvailability: issue.availability,
          drift: 'unknown' as const,
          errorCode: issue.code,
          errorMessage: issue.message,
        };
      }
    }

    if (
      production.strategy !== 'git-managed' ||
      production.provider !== 'vercel'
    ) {
      throw new DeploymentError(
        'DEPLOYMENT_STRATEGY_UNSUPPORTED',
        'O status externo está disponível somente para contratos git-managed/Vercel.',
      );
    }
    if (!production.external?.project) {
      throw new DeploymentError(
        'DEPLOYMENT_PRODUCTION_UNAVAILABLE',
        'O contrato git-managed não possui external.project válido.',
      );
    }

    const originRevision = await this.originRevisionResolver.resolve(
      project,
      production.branch,
    );
    const localOperations = LOCAL_OPERATION_ORDER.filter(
      (operation) => production.commands[operation] !== undefined,
    );
    const base = {
      projectId: project.id,
      projectName: project.name,
      strategy: 'git-managed' as const,
      provider: 'vercel' as const,
      branch: production.branch,
      externalProject: production.external.project,
      ...(originRevision ? { originRevision } : {}),
      localOperations: [...localOperations],
    };

    let snapshot: VercelProductionSnapshot;
    try {
      snapshot = await this.provider.readProduction(
        production.external.project,
      );
    } catch (error) {
      const issue = providerIssue(error);
      if (!issue) throw error;
      return {
        ...base,
        providerAvailability: issue.availability,
        drift: 'unknown',
        timeline: [],
        errorCode: issue.code,
        errorMessage: issue.message,
      };
    }

    const deployment = snapshot.deployment;
    const productionRevision = deployment?.revision;
    return {
      ...base,
      providerAvailability: 'available',
      providerProjectId: snapshot.projectId,
      providerProjectName: snapshot.projectName,
      ...(productionRevision ? { productionRevision } : {}),
      drift: drift(originRevision, productionRevision),
      ...(deployment ? { deployment } : {}),
      timeline: deployment
        ? [
            {
              id: 'provider-deploy',
              phase: 'deploying',
              status: stepStatus(deployment.state),
              startedAt: deployment.createdAt,
            },
          ]
        : [],
    };
  }
}
