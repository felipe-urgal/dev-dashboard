import type {
  DeploymentProviderPlanStep,
  DeploymentProviderTarget,
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
  type VercelResolvedProject,
} from './vercel-adapter.js';

export interface VercelProviderStepAdapterOptions {
  vercelAdapter?: VercelDeploymentAdapter;
  githubOriginResolver?: GitHubOriginResolver;
  originRevisionResolver?: DeploymentOriginRevisionResolver;
  revisionResolver?: DeploymentRevisionResolver;
  maskLog?: (content: string) => MaskedLogContent;
}

interface VercelPreflightResult {
  repository: GitHubRepositoryReference;
  providerProject: VercelResolvedProject;
}

function targetKey(target: DeploymentProviderTarget): string {
  return `${target.externalProject}\n${target.branch}\n${target.revision}`;
}

export class VercelProviderStepAdapter {
  private readonly vercelAdapter: VercelDeploymentAdapter;
  private readonly githubOriginResolver: GitHubOriginResolver;
  private readonly originRevisionResolver: DeploymentOriginRevisionResolver;
  private readonly revisionResolver: DeploymentRevisionResolver;
  private readonly maskLog: (content: string) => MaskedLogContent;
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

    const [repository, snapshot] = await Promise.all([
      this.githubOriginResolver.resolve(project),
      this.vercelAdapter.readProduction(target.externalProject, signal),
    ]);
    if (signal.aborted) {
      throw new DOMException('Deployment cancelado.', 'AbortError');
    }
    if (
      snapshot.deployment &&
      ['queued', 'building', 'unknown'].includes(snapshot.deployment.state)
    ) {
      throw new DeploymentError(
        'DEPLOYMENT_PROVIDER_DEPLOYMENT_ACTIVE',
        'A Vercel já possui um deployment de produção em andamento ou com estado incerto. Aguarde a conclusão e atualize o status antes de promover outra revisão.',
      );
    }

    const result = {
      repository,
      providerProject: {
        id: snapshot.projectId,
        name: snapshot.projectName,
      },
    };
    this.preflightCache.set(targetKey(target), result);
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
}
