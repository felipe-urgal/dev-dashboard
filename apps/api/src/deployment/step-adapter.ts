import type {
  DeploymentProviderPlanStep,
  Project,
} from '@dev-dashboard/contracts';
import {
  maskSensitiveLogContent,
  type MaskedLogContent,
} from '@dev-dashboard/process-manager';

import type { ProductionCommandResult } from './command-adapter.js';
import { DeploymentError } from './errors.js';
import {
  LocalGitHubOriginResolver,
  type GitHubOriginResolver,
  type GitHubRepositoryReference,
} from './github-origin.js';
import {
  GitDeploymentOriginRevisionResolver,
  type DeploymentOriginRevisionResolver,
} from './origin-revision.js';
import {
  GitDeploymentRevisionResolver,
  type DeploymentRevisionResolver,
} from './revision.js';
import {
  VercelDeploymentAdapter,
  type VercelProductionDeployment,
  type VercelResolvedProject,
} from './vercel-adapter.js';

type DeploymentProviderTarget = DeploymentProviderPlanStep['target'];

const DEFAULT_ADOPTED_DEPLOY_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_ADOPTED_DEPLOY_POLL_INTERVAL_MS = 2_000;

export interface VercelProviderStepAdapterOptions {
  vercelAdapter?: VercelDeploymentAdapter;
  githubOriginResolver?: GitHubOriginResolver;
  originRevisionResolver?: DeploymentOriginRevisionResolver;
  revisionResolver?: DeploymentRevisionResolver;
  maskLog?: (content: string) => MaskedLogContent;
  adoptedDeployTimeoutMs?: number;
  adoptedDeployPollIntervalMs?: number;
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<boolean>;
}

interface VercelPreflightResult {
  repository: GitHubRepositoryReference;
  providerProject: VercelResolvedProject;
  existingDeployment?: VercelProductionDeployment;
}

function targetKey(target: DeploymentProviderTarget): string {
  return `${target.externalProject}\n${target.branch}\n${target.revision}`;
}

function matchesTargetDeployment(
  deployment: VercelProductionDeployment | undefined,
  target: DeploymentProviderTarget,
): deployment is VercelProductionDeployment {
  return Boolean(
    deployment &&
      deployment.branch === target.branch &&
      deployment.revision === target.revision,
  );
}

function isActiveDeployment(
  deployment: VercelProductionDeployment | undefined,
): deployment is VercelProductionDeployment {
  return Boolean(
    deployment && ['queued', 'building'].includes(deployment.state),
  );
}

function defaultSleep(
  milliseconds: number,
  signal: AbortSignal,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve(true);
    }, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

export class VercelProviderStepAdapter {
  private readonly vercelAdapter: VercelDeploymentAdapter;
  private readonly githubOriginResolver: GitHubOriginResolver;
  private readonly originRevisionResolver: DeploymentOriginRevisionResolver;
  private readonly revisionResolver: DeploymentRevisionResolver;
  private readonly maskLog: (content: string) => MaskedLogContent;
  private readonly adoptedDeployTimeoutMs: number;
  private readonly adoptedDeployPollIntervalMs: number;
  private readonly sleep: (
    milliseconds: number,
    signal: AbortSignal,
  ) => Promise<boolean>;
  private readonly preflightCache = new Map<string, VercelPreflightResult>();

  public constructor(options: VercelProviderStepAdapterOptions = {}) {
    this.vercelAdapter = options.vercelAdapter ?? new VercelDeploymentAdapter();
    this.githubOriginResolver =
      options.githubOriginResolver ?? new LocalGitHubOriginResolver();
    this.originRevisionResolver =
      options.originRevisionResolver ??
      new GitDeploymentOriginRevisionResolver();
    this.revisionResolver =
      options.revisionResolver ?? new GitDeploymentRevisionResolver();
    this.maskLog = options.maskLog ?? maskSensitiveLogContent;
    this.adoptedDeployTimeoutMs =
      options.adoptedDeployTimeoutMs ?? DEFAULT_ADOPTED_DEPLOY_TIMEOUT_MS;
    this.adoptedDeployPollIntervalMs =
      options.adoptedDeployPollIntervalMs ??
      DEFAULT_ADOPTED_DEPLOY_POLL_INTERVAL_MS;
    this.sleep = options.sleep ?? defaultSleep;
  }

  public async preflight(
    project: Project,
    target: DeploymentProviderTarget,
    signal: AbortSignal,
  ): Promise<VercelPreflightResult> {
    if (signal.aborted) {
      throw new DOMException('Deployment cancelado.', 'AbortError');
    }

    const production = project.production;
    if (
      !production?.enabled ||
      production.strategy !== 'git-managed' ||
      production.provider !== 'vercel' ||
      !production.external?.project ||
      production.external.project !== target.externalProject ||
      production.branch !== target.branch
    ) {
      throw new DeploymentError(
        'DEPLOYMENT_PLAN_STALE',
        'O contrato Vercel mudou desde a confirmação; gere e confirme um novo plano.',
      );
    }

    const localRevision = await this.revisionResolver.resolve(project);
    const originRevision = await this.originRevisionResolver.resolve(
      project,
      target.branch,
      signal,
    );
    if (signal.aborted) {
      throw new DOMException('Deployment cancelado.', 'AbortError');
    }
    if (
      localRevision.branch !== target.branch ||
      localRevision.revision !== target.revision ||
      !originRevision ||
      originRevision !== target.revision
    ) {
      throw new DeploymentError(
        'DEPLOYMENT_PLAN_STALE',
        'A revisão confirmada não corresponde mais à revisão atual de origin; sincronize/publique a branch e gere um novo plano.',
      );
    }

    const key = targetKey(target);
    const previousPreflight = this.preflightCache.get(key);
    const [repository, snapshot] = await Promise.all([
      this.githubOriginResolver.resolve(project),
      this.vercelAdapter.readProduction(target.externalProject, signal),
    ]);
    if (signal.aborted) {
      throw new DOMException('Deployment cancelado.', 'AbortError');
    }

    const existingDeployment = matchesTargetDeployment(
      snapshot.deployment,
      target,
    )
      ? snapshot.deployment
      : undefined;
    const matchingDeploymentStartedDuringFlow = Boolean(
      previousPreflight && isActiveDeployment(existingDeployment),
    );
    if (
      snapshot.deployment &&
      ['queued', 'building', 'unknown'].includes(snapshot.deployment.state) &&
      !matchingDeploymentStartedDuringFlow
    ) {
      throw new DeploymentError(
        'DEPLOYMENT_PROVIDER_DEPLOYMENT_ACTIVE',
        'A Vercel já possui um deployment de produção em andamento ou com estado incerto. Aguarde a conclusão e atualize o status antes de promover outra revisão.',
      );
    }

    const result: VercelPreflightResult = {
      repository,
      providerProject: {
        id: snapshot.projectId,
        name: snapshot.projectName,
      },
      ...(existingDeployment ? { existingDeployment } : {}),
    };
    this.preflightCache.set(key, result);
    return result;
  }

  public async run(
    _project: Project,
    step: DeploymentProviderPlanStep,
    signal: AbortSignal,
    onOutput: (output: MaskedLogContent) => void,
  ): Promise<ProductionCommandResult> {
    if (step.id !== 'provider-deploy') {
      throw new DeploymentError(
        'DEPLOYMENT_PRODUCTION_UNAVAILABLE',
        'A etapa externa informada não é reconhecida pelo adapter Vercel.',
      );
    }
    if (signal.aborted) return { exitCode: 1, cancelled: true };

    const key = targetKey(step.target);
    const preflight = this.preflightCache.get(key);
    this.preflightCache.delete(key);
    if (!preflight) {
      throw new DeploymentError(
        'DEPLOYMENT_PRODUCTION_UNAVAILABLE',
        'O preflight Vercel confirmado não está disponível para esta etapa; gere e confirme um novo plano.',
      );
    }

    if (preflight.existingDeployment?.state === 'ready') {
      onOutput(
        this.maskLog(
          `Vercel: a revisão confirmada já está READY em ${preflight.existingDeployment.url}; reutilizando o deployment ${preflight.existingDeployment.id}.\n`,
        ),
      );
      return { exitCode: 0, cancelled: false };
    }

    if (isActiveDeployment(preflight.existingDeployment)) {
      return this.waitForExistingDeployment(
        step.target,
        preflight.existingDeployment,
        signal,
        onOutput,
      );
    }

    const result = await this.vercelAdapter.deployProduction(
      step.target.externalProject,
      {
        repository: preflight.repository,
        providerProject: preflight.providerProject,
        branch: step.target.branch,
        revision: step.target.revision,
        signal,
        onStatus: (message) => onOutput(this.maskLog(message)),
      },
    );

    return { exitCode: result.cancelled ? 1 : 0, cancelled: result.cancelled };
  }

  private async waitForExistingDeployment(
    target: DeploymentProviderTarget,
    initialDeployment: VercelProductionDeployment,
    signal: AbortSignal,
    onOutput: (output: MaskedLogContent) => void,
  ): Promise<ProductionCommandResult> {
    onOutput(
      this.maskLog(
        `Vercel: a revisão confirmada já iniciou o deployment ${initialDeployment.id}; acompanhando o deployment existente sem criar outro.\n`,
      ),
    );

    const deadline = Date.now() + this.adoptedDeployTimeoutMs;
    let deployment = initialDeployment;
    let lastState: VercelProductionDeployment['state'] | undefined;

    while (Date.now() < deadline) {
      if (signal.aborted) return { exitCode: 1, cancelled: true };
      if (!matchesTargetDeployment(deployment, target)) {
        throw new DeploymentError(
          'DEPLOYMENT_PROVIDER_DEPLOYMENT_ACTIVE',
          'A Vercel passou a apontar para outro deployment durante a promoção. Atualize o status antes de continuar.',
        );
      }

      if (deployment.state !== lastState) {
        onOutput(this.maskLog(`Vercel: ${deployment.state}\n`));
        lastState = deployment.state;
      }

      if (deployment.state === 'ready') {
        onOutput(
          this.maskLog(
            `Vercel pronta: ${deployment.url}; deployment existente reutilizado.\n`,
          ),
        );
        return { exitCode: 0, cancelled: false };
      }
      if (deployment.state === 'error' || deployment.state === 'cancelled') {
        throw new DeploymentError(
          'DEPLOYMENT_PROVIDER_UNAVAILABLE',
          'O deployment de produção já iniciado para a revisão confirmada não concluiu com sucesso na Vercel.',
        );
      }
      if (deployment.state === 'unknown') {
        throw new DeploymentError(
          'DEPLOYMENT_PROVIDER_UNAVAILABLE',
          'A Vercel retornou estado incerto para o deployment já iniciado da revisão confirmada.',
        );
      }

      const continued = await this.sleep(
        this.adoptedDeployPollIntervalMs,
        signal,
      );
      if (!continued || signal.aborted) {
        return { exitCode: 1, cancelled: true };
      }

      const snapshot = await this.vercelAdapter.readProduction(
        target.externalProject,
        signal,
      );
      if (!snapshot.deployment) {
        throw new DeploymentError(
          'DEPLOYMENT_PROVIDER_UNAVAILABLE',
          'A Vercel deixou de retornar o deployment de produção já iniciado para a revisão confirmada.',
        );
      }
      deployment = snapshot.deployment;
    }

    throw new DeploymentError(
      'DEPLOYMENT_PROVIDER_UNAVAILABLE',
      'A Vercel não concluiu o deployment já iniciado dentro do tempo limite configurado.',
    );
  }
}
