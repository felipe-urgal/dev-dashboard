import { execFile } from 'node:child_process';

import type {
  Deployment,
  DeploymentHistory,
  ProductionDeploymentStatus,
  ProductionOverview,
  ProductionOverviewHealth,
  ProductionOverviewItem,
  ProductionOverviewState,
  Project,
} from '@dev-dashboard/contracts';

import {
  GitDeploymentOriginRevisionResolver,
  type DeploymentOriginRevisionResolver,
} from './origin-revision.js';
import { ProductionDeploymentStatusService } from './production-status.js';

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 5_000;
const HISTORY_PAGE_SIZE = 50;

export interface ProductionOverviewDeploymentReader {
  history(
    projectId: string,
    page?: number,
    pageSize?: number,
  ): Promise<DeploymentHistory>;
}

export interface ProductionOverviewProviderReader {
  read(project: Project): Promise<ProductionDeploymentStatus>;
}

export interface ProductionOverviewTargetRevisionResolver {
  resolve(project: Project, branch: string): Promise<string | undefined>;
}

type ExecGit = (
  args: readonly string[],
  options: { cwd: string; timeoutMs: number },
) => Promise<{ stdout: string }>;

export interface GitProductionOverviewTargetRevisionResolverOptions {
  timeoutMs?: number;
  execGit?: ExecGit;
}

export interface ProductionOverviewServiceOptions {
  deploymentReader: ProductionOverviewDeploymentReader;
  providerReader?: ProductionOverviewProviderReader;
  targetRevisionResolver?: ProductionOverviewTargetRevisionResolver;
  originRevisionResolver?: DeploymentOriginRevisionResolver;
  now?: () => number;
  concurrency?: number;
}

function defaultExecGit(
  args: readonly string[],
  options: { cwd: string; timeoutMs: number },
): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      [...args],
      {
        cwd: options.cwd,
        encoding: 'utf8',
        maxBuffer: 64 * 1024,
        shell: false,
        timeout: options.timeoutMs,
        killSignal: 'SIGTERM',
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ stdout });
      },
    );
  });
}

function parseRevision(output: string | undefined): string | undefined {
  const revision = output?.trim();
  return revision && /^[0-9a-f]{40}$/i.test(revision) ? revision : undefined;
}

export class GitProductionOverviewTargetRevisionResolver implements ProductionOverviewTargetRevisionResolver {
  private readonly timeoutMs: number;
  private readonly execGit: ExecGit;

  public constructor(
    options: GitProductionOverviewTargetRevisionResolverOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.execGit = options.execGit ?? defaultExecGit;
  }

  public async resolve(
    project: Project,
    branch: string,
  ): Promise<string | undefined> {
    try {
      const { stdout } = await this.execGit(
        ['rev-parse', '--verify', `refs/heads/${branch}`],
        {
          cwd: project.path,
          timeoutMs: this.timeoutMs,
        },
      );
      return parseRevision(stdout);
    } catch {
      return undefined;
    }
  }
}

function mutationStepSucceeded(deployment: Deployment): boolean {
  return Boolean(
    deployment.timeline.find(
      (step) =>
        step.id === 'deploy' ||
        step.id === 'provider-deploy' ||
        step.id === 'self-update',
    )?.status === 'succeeded',
  );
}

function executionState(
  deployment: Deployment | undefined,
): ProductionOverviewState | undefined {
  if (!deployment) return undefined;
  if (
    deployment.status === 'planned' ||
    deployment.status === 'preparing' ||
    deployment.status === 'backing_up' ||
    deployment.status === 'migrating' ||
    deployment.status === 'deploying' ||
    deployment.status === 'verifying'
  ) {
    return 'running';
  }
  if (deployment.status === 'recovery_required') return 'recovery-required';
  if (deployment.status === 'failed') return 'failed';
  return undefined;
}

function healthEvidence(
  project: Project,
  history: readonly Deployment[],
  productionRevision: string | undefined,
): { health: ProductionOverviewHealth; healthCheckedAt?: string } {
  if (project.production?.strategy === 'self-update') {
    const deployment = history.find(
      (item) =>
        item.revision === productionRevision && mutationStepSucceeded(item),
    );
    const selfUpdate = deployment?.timeline.find(
      (step) => step.id === 'self-update',
    );
    return selfUpdate?.status === 'succeeded'
      ? {
          health: 'verified',
          ...(selfUpdate.finishedAt
            ? { healthCheckedAt: selfUpdate.finishedAt }
            : {}),
        }
      : { health: 'unknown' };
  }

  if (!project.production?.health) return { health: 'not-configured' };
  if (!productionRevision) return { health: 'unknown' };

  const deployment = history.find(
    (item) =>
      item.revision === productionRevision && mutationStepSucceeded(item),
  );
  const verify = deployment?.timeline.find((step) => step.id === 'verify');

  if (verify?.status === 'succeeded') {
    return {
      health: 'verified',
      ...(verify.finishedAt ? { healthCheckedAt: verify.finishedAt } : {}),
    };
  }
  if (verify?.status === 'failed') {
    return {
      health: 'verify-failed',
      ...(verify.finishedAt ? { healthCheckedAt: verify.finishedAt } : {}),
    };
  }
  return { health: 'unknown' };
}

function blockedMessage(project: Project): string {
  const blockedBy = project.production?.blockedBy ?? [];
  if (blockedBy.length > 0) return `Bloqueadores: ${blockedBy.join(', ')}.`;
  return 'O contrato de produção está bloqueado ou desabilitado.';
}

function historyForCurrentContract(
  project: Project,
  history: readonly Deployment[],
): Deployment[] {
  const production = project.production;
  if (!production) return [];
  return history.filter(
    (deployment) =>
      deployment.branch === production.branch &&
      deployment.provider === production.provider,
  );
}

export class ProductionOverviewService {
  private readonly deploymentReader: ProductionOverviewDeploymentReader;
  private readonly providerReader: ProductionOverviewProviderReader;
  private readonly targetRevisionResolver: ProductionOverviewTargetRevisionResolver;
  private readonly originRevisionResolver: DeploymentOriginRevisionResolver;
  private readonly now: () => number;
  private readonly concurrency: number;

  public constructor(options: ProductionOverviewServiceOptions) {
    this.deploymentReader = options.deploymentReader;
    this.providerReader =
      options.providerReader ?? new ProductionDeploymentStatusService();
    this.targetRevisionResolver =
      options.targetRevisionResolver ??
      new GitProductionOverviewTargetRevisionResolver();
    this.originRevisionResolver =
      options.originRevisionResolver ??
      new GitDeploymentOriginRevisionResolver();
    this.now = options.now ?? Date.now;
    this.concurrency = Math.max(
      1,
      Math.min(options.concurrency ?? DEFAULT_CONCURRENCY, 8),
    );
  }

  public async read(projects: readonly Project[]): Promise<ProductionOverview> {
    const orderedProjects = [...projects].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    const items = new Array<ProductionOverviewItem>(orderedProjects.length);
    let cursor = 0;

    const worker = async (): Promise<void> => {
      while (cursor < orderedProjects.length) {
        const index = cursor;
        cursor += 1;
        items[index] = await this.readProject(orderedProjects[index]!);
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(this.concurrency, orderedProjects.length) },
        () => worker(),
      ),
    );

    return {
      generatedAt: new Date(this.now()).toISOString(),
      items,
    };
  }

  private async readProject(project: Project): Promise<ProductionOverviewItem> {
    const production = project.production;
    const base = {
      projectId: project.id,
      projectName: project.name,
      ...(project.workspaceId ? { workspaceId: project.workspaceId } : {}),
      ...(production?.strategy ? { strategy: production.strategy } : {}),
      ...(production?.provider ? { provider: production.provider } : {}),
      ...(production?.branch ? { branch: production.branch } : {}),
    };

    if (project.productionWarning) {
      return {
        ...base,
        state: 'blocked',
        health: 'not-configured',
        errorCode: project.productionWarning.code,
        errorMessage: project.productionWarning.message,
      };
    }

    if (!production || !project.capabilities.includes('production')) {
      return {
        ...base,
        state: 'not-configured',
        health: 'not-configured',
      };
    }

    if (!production.enabled || production.strategy === 'disabled') {
      return {
        ...base,
        state: 'blocked',
        health: production.health ? 'unknown' : 'not-configured',
        ...(production.reasonCode ? { errorCode: production.reasonCode } : {}),
        errorMessage: blockedMessage(project),
      };
    }

    let history: DeploymentHistory;
    try {
      history = await this.deploymentReader.history(
        project.id,
        1,
        HISTORY_PAGE_SIZE,
      );
    } catch {
      return {
        ...base,
        state: 'unknown',
        health: production.health ? 'unknown' : 'not-configured',
        errorCode: 'PRODUCTION_OVERVIEW_HISTORY_UNAVAILABLE',
        errorMessage: 'Não foi possível ler o histórico local de produção.',
      };
    }

    const currentHistory = historyForCurrentContract(project, history.items);
    const latest = currentHistory[0];
    const latestExecutionState = executionState(latest);
    const deploymentFields = latest
      ? {
          deploymentId: latest.id,
          deploymentStatus: latest.status,
        }
      : {};

    if (
      production.strategy === 'git-managed' &&
      production.provider === 'vercel'
    ) {
      return this.readGitManagedProject(
        project,
        base,
        currentHistory,
        latestExecutionState,
        deploymentFields,
      );
    }

    if (
      production.strategy === 'command' ||
      production.strategy === 'self-update'
    ) {
      const targetRevision =
        production.strategy === 'self-update'
          ? await this.originRevisionResolver.resolve(
              project,
              production.branch,
            )
          : await this.targetRevisionResolver.resolve(
              project,
              production.branch,
            );
      const productionDeployment = currentHistory.find(mutationStepSucceeded);
      const productionRevision = productionDeployment?.revision;
      const health = healthEvidence(
        project,
        currentHistory,
        productionRevision,
      );

      let state = latestExecutionState;
      if (!state) {
        state =
          targetRevision && productionRevision
            ? targetRevision === productionRevision
              ? 'in-sync'
              : 'drift'
            : 'unknown';
      }

      return {
        ...base,
        ...deploymentFields,
        state,
        ...health,
        ...(targetRevision ? { targetRevision } : {}),
        ...(productionRevision ? { productionRevision } : {}),
        ...(latest?.errorCode ? { errorCode: latest.errorCode } : {}),
        ...(latest?.errorMessage ? { errorMessage: latest.errorMessage } : {}),
      };
    }

    return {
      ...base,
      ...deploymentFields,
      state: 'blocked',
      health: production.health ? 'unknown' : 'not-configured',
      errorCode: 'DEPLOYMENT_STRATEGY_UNSUPPORTED',
      errorMessage: 'A estratégia de produção não é suportada pelo overview.',
    };
  }

  private async readGitManagedProject(
    project: Project,
    base: Pick<
      ProductionOverviewItem,
      | 'projectId'
      | 'projectName'
      | 'workspaceId'
      | 'strategy'
      | 'provider'
      | 'branch'
    >,
    history: readonly Deployment[],
    latestExecutionState: ProductionOverviewState | undefined,
    deploymentFields: Pick<
      ProductionOverviewItem,
      'deploymentId' | 'deploymentStatus'
    >,
  ): Promise<ProductionOverviewItem> {
    let status: ProductionDeploymentStatus;
    try {
      status = await this.providerReader.read(project);
    } catch {
      return {
        ...base,
        ...deploymentFields,
        state: latestExecutionState ?? 'unknown',
        health: project.production?.health ? 'unknown' : 'not-configured',
        errorCode: 'PRODUCTION_OVERVIEW_PROVIDER_UNAVAILABLE',
        errorMessage: 'Não foi possível ler o status externo de produção.',
      };
    }

    const targetRevision = status.originRevision;
    const productionRevision = status.productionRevision;
    const health = healthEvidence(project, history, productionRevision);

    let state = latestExecutionState;
    if (!state) {
      const providerState = status.deployment?.state;
      if (providerState === 'queued' || providerState === 'building') {
        state = 'running';
      } else if (providerState === 'error') {
        state = 'failed';
      } else if (status.providerAvailability !== 'available') {
        state =
          status.providerAvailability === 'not-configured'
            ? 'not-configured'
            : 'unknown';
      } else if (providerState !== 'ready') {
        state = 'unknown';
      } else if (status.drift === 'drift') {
        state = 'drift';
      } else if (status.drift === 'in-sync') {
        state = 'in-sync';
      } else {
        state = 'unknown';
      }
    }

    return {
      ...base,
      ...deploymentFields,
      state,
      ...health,
      providerAvailability: status.providerAvailability,
      ...(targetRevision
        ? { targetRevision, originRevision: targetRevision }
        : {}),
      ...(productionRevision ? { productionRevision } : {}),
      ...(status.errorCode ? { errorCode: status.errorCode } : {}),
      ...(status.errorMessage ? { errorMessage: status.errorMessage } : {}),
    };
  }
}
