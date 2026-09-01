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
} from './github-origin.js';
import {
  GitDeploymentOriginRevisionResolver,
  type DeploymentOriginRevisionResolver,
} from './origin-revision.js';
import {
  GitDeploymentRevisionResolver,
  type DeploymentRevisionResolver,
} from './revision.js';
import { VercelDeploymentAdapter } from './vercel-adapter.js';

export interface VercelProviderStepAdapterOptions {
  vercelAdapter?: VercelDeploymentAdapter;
  githubOriginResolver?: GitHubOriginResolver;
  originRevisionResolver?: DeploymentOriginRevisionResolver;
  revisionResolver?: DeploymentRevisionResolver;
  maskLog?: (content: string) => MaskedLogContent;
}

export class VercelProviderStepAdapter {
  private readonly vercelAdapter: VercelDeploymentAdapter;
  private readonly githubOriginResolver: GitHubOriginResolver;
  private readonly originRevisionResolver: DeploymentOriginRevisionResolver;
  private readonly revisionResolver: DeploymentRevisionResolver;
  private readonly maskLog: (content: string) => MaskedLogContent;

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

  public async run(
    project: Project,
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

    const production = project.production;
    if (
      !production?.enabled ||
      production.strategy !== 'git-managed' ||
      production.provider !== 'vercel' ||
      !production.external?.project
    ) {
      throw new DeploymentError(
        'DEPLOYMENT_PRODUCTION_UNAVAILABLE',
        'A etapa provider-deploy exige um contrato git-managed/Vercel habilitado.',
      );
    }

    const localRevision = await this.revisionResolver.resolve(project);
    const originRevision = await this.originRevisionResolver.resolve(
      project,
      production.branch,
    );
    if (
      localRevision.branch !== production.branch ||
      !originRevision ||
      originRevision !== localRevision.revision
    ) {
      throw new DeploymentError(
        'DEPLOYMENT_PLAN_STALE',
        'A revisão confirmada localmente ainda não corresponde à revisão atual de origin; sincronize/publie a branch antes do deploy.',
      );
    }

    const repository = await this.githubOriginResolver.resolve(project);
    const result = await this.vercelAdapter.deployProduction(
      production.external.project,
      {
        repository,
        branch: production.branch,
        revision: originRevision,
        signal,
        onStatus: (message) => onOutput(this.maskLog(message)),
      },
    );

    return { exitCode: result.cancelled ? 1 : 0, cancelled: result.cancelled };
  }
}
