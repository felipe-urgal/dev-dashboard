import { randomUUID } from 'node:crypto';

import type {
  Deployment,
  DeploymentConfirmation,
  DeploymentHistory,
  DeploymentLog,
  DeploymentPlan,
  DeploymentPlanStep,
  Project,
} from '@dev-dashboard/contracts';
import type { MaskedLogContent } from '@dev-dashboard/process-manager';

import {
  ProductionCommandAdapter,
  type ProductionCommandResult,
} from './command-adapter.js';
import { DeploymentConfirmationService } from './confirmation.js';
import { DeploymentError } from './errors.js';
import { DeploymentPlanner } from './planner.js';
import {
  GitDeploymentRevisionResolver,
  type DeploymentRevisionResolver,
} from './revision.js';
import { DeploymentStore } from './store.js';

interface ActiveDeployment {
  deploymentId: string;
  projectId: string;
  controller: AbortController;
}

export interface DeploymentCommandRunner {
  run(
    project: Project,
    step: DeploymentPlanStep,
    signal: AbortSignal,
    onOutput: (output: MaskedLogContent) => void,
  ): Promise<ProductionCommandResult>;
}

export interface DeploymentServiceOptions {
  planner?: DeploymentPlanner;
  revisionResolver?: DeploymentRevisionResolver;
  confirmationService?: DeploymentConfirmationService;
  adapter?: DeploymentCommandRunner;
  store?: DeploymentStore;
  now?: () => number;
}

export class DeploymentService {
  private readonly planner: DeploymentPlanner;
  private readonly revisionResolver: DeploymentRevisionResolver;
  private readonly confirmationService: DeploymentConfirmationService;
  private readonly adapter: DeploymentCommandRunner;
  private readonly store: DeploymentStore;
  private readonly now: () => number;
  private readonly readyPromise: Promise<void>;
  private active: ActiveDeployment | undefined;

  public constructor(options: DeploymentServiceOptions = {}) {
    this.now = options.now ?? Date.now;
    this.planner = options.planner ?? new DeploymentPlanner(this.now);
    this.revisionResolver =
      options.revisionResolver ?? new GitDeploymentRevisionResolver();
    this.confirmationService =
      options.confirmationService ??
      new DeploymentConfirmationService(60_000, this.now);
    this.adapter = options.adapter ?? new ProductionCommandAdapter();
    this.store = options.store ?? new DeploymentStore();
    this.readyPromise = this.store.recoverInterrupted(this.now());
  }

  public async plan(project: Project): Promise<DeploymentPlan> {
    await this.readyPromise;
    const revision = await this.revisionResolver.resolve(project);
    return this.planner.build(project, revision);
  }

  public async prepareConfirmation(
    project: Project,
    expectedPlanHash: string,
  ): Promise<DeploymentConfirmation> {
    const plan = await this.plan(project);
    this.assertPlanHash(plan, expectedPlanHash);
    return this.confirmationService.prepare(plan);
  }

  public async start(
    project: Project,
    expectedPlanHash: string,
    confirmationToken: string | undefined,
  ): Promise<Deployment> {
    await this.readyPromise;
    this.assertNoActiveDeployment();

    const plan = await this.plan(project);
    this.assertPlanHash(plan, expectedPlanHash);
    this.assertNoActiveDeployment();
    this.confirmationService.consume(plan, confirmationToken);

    const deployment: Deployment = {
      id: randomUUID(),
      projectId: plan.projectId,
      projectName: plan.projectName,
      provider: plan.provider,
      branch: plan.branch,
      revision: plan.revision,
      planHash: plan.planHash,
      status: 'planned',
      createdAt: new Date(this.now()).toISOString(),
      timeline: plan.steps.map((step) => ({ ...step, status: 'pending' })),
    };
    const controller = new AbortController();
    this.active = {
      deploymentId: deployment.id,
      projectId: deployment.projectId,
      controller,
    };

    try {
      await this.store.save(deployment);
    } catch (error) {
      this.active = undefined;
      throw error;
    }

    void this.execute(project, deployment, controller).catch(() => undefined);
    return structuredClone(deployment);
  }

  public async get(
    projectId: string,
    deploymentId: string,
  ): Promise<Deployment> {
    const deployment = await this.store.get(deploymentId);
    if (!deployment || deployment.projectId !== projectId) {
      throw new DeploymentError(
        'DEPLOYMENT_NOT_FOUND',
        'Deployment não encontrado para este projeto.',
      );
    }
    return deployment;
  }

  public async history(
    projectId: string,
    page = 1,
    pageSize = 20,
  ): Promise<DeploymentHistory> {
    return this.store.history(projectId, page, pageSize);
  }

  public async log(
    projectId: string,
    deploymentId: string,
  ): Promise<DeploymentLog> {
    await this.get(projectId, deploymentId);
    return this.store.log(deploymentId);
  }

  public async cancel(
    projectId: string,
    deploymentId: string,
  ): Promise<Deployment> {
    const deployment = await this.get(projectId, deploymentId);
    if (
      !this.active ||
      this.active.deploymentId !== deploymentId ||
      this.active.projectId !== projectId
    ) {
      throw new DeploymentError(
        'DEPLOYMENT_CANCEL_NOT_AVAILABLE',
        'Este deployment não está em execução e não pode ser cancelado.',
      );
    }
    this.active.controller.abort();
    return deployment;
  }

  public close(): void {
    this.active?.controller.abort();
  }

  private async execute(
    project: Project,
    initial: Deployment,
    controller: AbortController,
  ): Promise<void> {
    let deployment: Deployment = {
      ...initial,
      startedAt: new Date(this.now()).toISOString(),
    };
    let irreversibleCompleted = false;
    let currentIrreversible = false;
    let logQueue = Promise.resolve();

    try {
      for (let index = 0; index < deployment.timeline.length; index += 1) {
        const planStep = deployment.timeline[index]!;
        if (controller.signal.aborted) {
          deployment = this.cancelled(
            deployment,
            irreversibleCompleted,
            false,
          );
          await this.store.save(deployment);
          return;
        }

        currentIrreversible = planStep.irreversible;
        const startedAt = new Date(this.now()).toISOString();
        deployment = {
          ...deployment,
          status: planStep.phase,
          currentStepId: planStep.id,
          timeline: deployment.timeline.map((step, stepIndex) =>
            stepIndex === index
              ? { ...step, status: 'running', startedAt }
              : step,
          ),
        };
        await this.store.save(deployment);

        const result = await this.adapter.run(
          project,
          planStep,
          controller.signal,
          (output) => {
            logQueue = logQueue
              .then(() => this.store.appendLog(deployment.id, output))
              .catch(() => undefined);
          },
        );
        await logQueue;

        if (result.cancelled || controller.signal.aborted) {
          deployment = this.cancelled(
            deployment,
            irreversibleCompleted,
            currentIrreversible,
            index,
          );
          await this.store.save(deployment);
          return;
        }
        if (result.exitCode !== 0) {
          throw new DeploymentError(
            'DEPLOYMENT_COMMAND_FAILED',
            `A etapa ${planStep.id} terminou com código ${result.exitCode}.`,
          );
        }

        const finishedAt = new Date(this.now()).toISOString();
        deployment = {
          ...deployment,
          timeline: deployment.timeline.map((step, stepIndex) =>
            stepIndex === index
              ? {
                  ...step,
                  status: 'succeeded',
                  finishedAt,
                  exitCode: result.exitCode,
                }
              : step,
          ),
        };
        await this.store.save(deployment);
        irreversibleCompleted ||= planStep.irreversible;
        currentIrreversible = false;
      }

      deployment = {
        ...deployment,
        status: 'succeeded',
        finishedAt: new Date(this.now()).toISOString(),
      };
      await this.store.save(deployment);
    } catch (error) {
      await logQueue.catch(() => undefined);
      const afterIrreversible = irreversibleCompleted || currentIrreversible;
      const finishedAt = new Date(this.now()).toISOString();
      const currentStepId = deployment.currentStepId;
      const deploymentError =
        error instanceof DeploymentError
          ? error
          : new DeploymentError(
              'DEPLOYMENT_COMMAND_FAILED',
              'A execução da etapa de produção falhou.',
            );
      deployment = {
        ...deployment,
        status: afterIrreversible ? 'recovery_required' : 'failed',
        finishedAt,
        failurePoint: afterIrreversible
          ? 'after-irreversible'
          : 'before-irreversible',
        errorCode: deploymentError.code,
        errorMessage: deploymentError.message,
        timeline: deployment.timeline.map((step) =>
          step.id === currentStepId && step.status === 'running'
            ? { ...step, status: 'failed', finishedAt }
            : step,
        ),
      };
      await this.store.save(deployment);
    } finally {
      if (this.active?.deploymentId === deployment.id) this.active = undefined;
    }
  }

  private cancelled(
    deployment: Deployment,
    irreversibleCompleted: boolean,
    currentIrreversible: boolean,
    currentIndex?: number,
  ): Deployment {
    const risky = irreversibleCompleted || currentIrreversible;
    const finishedAt = new Date(this.now()).toISOString();
    return {
      ...deployment,
      status: risky ? 'recovery_required' : 'cancelled',
      finishedAt,
      ...(risky
        ? {
            failurePoint: 'after-irreversible' as const,
            errorCode: 'DEPLOYMENT_CANCELLED_AFTER_IRREVERSIBLE',
            errorMessage:
              'A execução foi cancelada após iniciar uma etapa irreversível; recuperação manual pode ser necessária.',
          }
        : {}),
      timeline: deployment.timeline.map((step, index) =>
        (currentIndex === undefined && step.status === 'running') ||
        index === currentIndex
          ? { ...step, status: 'cancelled', finishedAt }
          : step,
      ),
    };
  }

  private assertPlanHash(plan: DeploymentPlan, expectedPlanHash: string): void {
    if (plan.planHash !== expectedPlanHash) {
      throw new DeploymentError(
        'DEPLOYMENT_PLAN_STALE',
        'O plano de deployment mudou; gere e confirme um novo plano antes de executar.',
      );
    }
  }

  private assertNoActiveDeployment(): void {
    if (this.active) {
      throw new DeploymentError(
        'DEPLOYMENT_ALREADY_RUNNING',
        'Já existe um deployment em execução. A política atual permite somente um deployment por vez.',
      );
    }
  }
}
