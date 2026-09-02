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
  SelfUpdateHandoffError,
  SelfUpdateHandoffService,
  type SelfUpdateHandoff,
  type SelfUpdateHandoffInput,
  type SelfUpdateHandoffInspectInput,
} from '../services/self-update-handoff-service.js';
import {
  ProductionCommandAdapter,
  type ProductionCommandResult,
} from './command-adapter.js';
import { DeploymentConfirmationService } from './confirmation.js';
import { DeploymentError } from './errors.js';
import {
  GitDeploymentOriginRevisionResolver,
  type DeploymentOriginRevisionResolver,
} from './origin-revision.js';
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
  handedOff?: boolean;
}

export interface DeploymentCommandRunner {
  run(
    project: Project,
    step: DeploymentPlanStep,
    signal: AbortSignal,
    onOutput: (output: MaskedLogContent) => void,
  ): Promise<ProductionCommandResult>;
}

export interface DeploymentSelfUpdateHandoff {
  prepareAndExecute(input: SelfUpdateHandoffInput): Promise<SelfUpdateHandoff>;
  inspect(input: SelfUpdateHandoffInspectInput): Promise<SelfUpdateHandoff>;
}

export interface DeploymentServiceOptions {
  planner?: DeploymentPlanner;
  revisionResolver?: DeploymentRevisionResolver;
  originRevisionResolver?: DeploymentOriginRevisionResolver;
  confirmationService?: DeploymentConfirmationService;
  adapter?: DeploymentCommandRunner;
  selfUpdateHandoffService?: DeploymentSelfUpdateHandoff;
  store?: DeploymentStore;
  now?: () => number;
}

function selfUpdateHandoffId(deploymentId: string): string {
  return `self-update-${deploymentId}`;
}

function safeSelfUpdateMessage(error: unknown): string {
  if (error instanceof SelfUpdateHandoffError) return error.message;
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().replaceAll(/\s+/g, ' ').slice(0, 500);
  }
  return 'O handoff de self-update falhou antes de transferir a execução.';
}

export class DeploymentService {
  private readonly planner: DeploymentPlanner;
  private readonly revisionResolver: DeploymentRevisionResolver;
  private readonly originRevisionResolver: DeploymentOriginRevisionResolver;
  private readonly confirmationService: DeploymentConfirmationService;
  private readonly adapter: DeploymentCommandRunner;
  private readonly selfUpdateHandoffService: DeploymentSelfUpdateHandoff;
  private readonly store: DeploymentStore;
  private readonly now: () => number;
  private readonly readyPromise: Promise<void>;
  private active: ActiveDeployment | undefined;

  public constructor(options: DeploymentServiceOptions = {}) {
    this.now = options.now ?? Date.now;
    this.planner = options.planner ?? new DeploymentPlanner(this.now);
    this.revisionResolver =
      options.revisionResolver ?? new GitDeploymentRevisionResolver();
    this.originRevisionResolver =
      options.originRevisionResolver ??
      new GitDeploymentOriginRevisionResolver();
    this.confirmationService =
      options.confirmationService ??
      new DeploymentConfirmationService(60_000, this.now);
    this.adapter = options.adapter ?? new ProductionCommandAdapter();
    this.selfUpdateHandoffService =
      options.selfUpdateHandoffService ?? new SelfUpdateHandoffService();
    this.store = options.store ?? new DeploymentStore();
    this.readyPromise = this.store.recoverInterrupted(this.now());
  }

  public async plan(project: Project): Promise<DeploymentPlan> {
    await this.readyPromise;
    const current = await this.revisionResolver.resolve(project);
    if (project.production?.strategy !== 'self-update') {
      return this.planner.build(project, current);
    }

    const targetRevision = await this.originRevisionResolver.resolve(
      project,
      project.production.branch,
    );
    if (!targetRevision) {
      throw new DeploymentError(
        'DEPLOYMENT_REVISION_UNAVAILABLE',
        'Não foi possível resolver origin/main para planejar o self-update.',
      );
    }
    return this.planner.build(project, {
      branch: current.branch,
      revision: targetRevision,
    });
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

  public async retryVerify(
    project: Project,
    deploymentId: string,
  ): Promise<Deployment> {
    await this.readyPromise;
    const deployment = await this.get(project.id, deploymentId);
    const verifyIndex = this.verifyRetryIndex(deployment);

    const currentPlan = await this.plan(project);
    if (
      currentPlan.branch !== deployment.branch ||
      currentPlan.revision !== deployment.revision ||
      currentPlan.provider !== deployment.provider
    ) {
      throw new DeploymentError(
        'DEPLOYMENT_PLAN_STALE',
        'Branch, revisão ou contrato de produção mudou; prepare um novo deployment.',
      );
    }

    this.assertNoActiveDeployment();
    await this.assertLatestDeployment(project.id, deployment.id);
    this.assertNoActiveDeployment();

    const startedAt = new Date(this.now()).toISOString();
    const retryingTimeline = deployment.timeline.map((step, index) => {
      if (index !== verifyIndex) return step;
      const retryingStep = {
        ...step,
        status: 'running' as const,
        startedAt,
      };
      delete retryingStep.finishedAt;
      delete retryingStep.exitCode;
      return retryingStep;
    });
    const retrying: Deployment = {
      ...deployment,
      status: 'verifying',
      currentStepId: 'verify',
      timeline: retryingTimeline,
    };
    delete retrying.finishedAt;
    delete retrying.failurePoint;
    delete retrying.errorCode;
    delete retrying.errorMessage;

    const controller = new AbortController();
    this.active = {
      deploymentId: retrying.id,
      projectId: retrying.projectId,
      controller,
    };

    try {
      await this.store.save(retrying);
    } catch (error) {
      this.active = undefined;
      throw error;
    }

    void this.executeVerifyRetry(
      project,
      retrying,
      verifyIndex,
      controller,
    ).catch(() => undefined);
    return structuredClone(retrying);
  }

  public async get(
    projectId: string,
    deploymentId: string,
  ): Promise<Deployment> {
    await this.readyPromise;
    const deployment = await this.store.get(deploymentId);
    if (!deployment || deployment.projectId !== projectId) {
      throw new DeploymentError(
        'DEPLOYMENT_NOT_FOUND',
        'Deployment não encontrado para este projeto.',
      );
    }
    return this.reconcileSelfUpdate(deployment);
  }

  public async history(
    projectId: string,
    page = 1,
    pageSize = 20,
  ): Promise<DeploymentHistory> {
    await this.readyPromise;
    const history = await this.store.history(projectId, page, pageSize);
    return {
      ...history,
      items: await Promise.all(
        history.items.map((deployment) => this.reconcileSelfUpdate(deployment)),
      ),
    };
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
      this.active.projectId !== projectId ||
      this.active.handedOff
    ) {
      throw new DeploymentError(
        'DEPLOYMENT_CANCEL_NOT_AVAILABLE',
        'Este deployment não está sob controle da API atual e não pode ser cancelado.',
      );
    }
    this.active.controller.abort();
    return deployment;
  }

  public close(): void {
    if (!this.active?.handedOff) this.active?.controller.abort();
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
    let handedOff = false;

    try {
      for (let index = 0; index < deployment.timeline.length; index += 1) {
        const planStep = deployment.timeline[index]!;
        if (controller.signal.aborted) {
          deployment = this.cancelled(deployment, irreversibleCompleted, false);
          await this.store.save(deployment);
          return;
        }

        await this.assertRevisionUnchanged(project, deployment);

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

        if (planStep.id === 'self-update') {
          if (project.production?.strategy !== 'self-update') {
            currentIrreversible = false;
            throw new DeploymentError(
              'DEPLOYMENT_PLAN_STALE',
              'O contrato deixou de ser self-update depois da confirmação.',
            );
          }
          try {
            await this.selfUpdateHandoffService.prepareAndExecute({
              handoffId: selfUpdateHandoffId(deployment.id),
              projectId: deployment.projectId,
              targetRevision: deployment.revision,
              planHash: deployment.planHash,
            });
          } catch (error) {
            currentIrreversible = false;
            throw new DeploymentError(
              'DEPLOYMENT_SELF_UPDATE_FAILED',
              safeSelfUpdateMessage(error),
            );
          }

          handedOff = true;
          if (this.active?.deploymentId === deployment.id) {
            this.active.handedOff = true;
          }
          return;
        }

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
      const finishedAt = new Date(this.now()).toISOString();
      const currentStepId = deployment.currentStepId;
      const deploymentError =
        error instanceof DeploymentError
          ? error
          : new DeploymentError(
              'DEPLOYMENT_COMMAND_FAILED',
              'A execução da etapa de produção falhou.',
            );
      const privilegeBlockedBeforeMutation =
        deploymentError.code === 'DEPLOYMENT_PRIVILEGE_REQUIRED' &&
        !irreversibleCompleted;
      const afterIrreversible =
        irreversibleCompleted ||
        (currentIrreversible && !privilegeBlockedBeforeMutation);
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
      if (!handedOff && this.active?.deploymentId === deployment.id) {
        this.active = undefined;
      }
    }
  }

  private async reconcileSelfUpdate(
    deployment: Deployment,
  ): Promise<Deployment> {
    const selfUpdateIndex = deployment.timeline.findIndex(
      (step) => step.id === 'self-update',
    );
    if (selfUpdateIndex < 0 || deployment.status === 'succeeded') {
      return deployment;
    }

    let handoff: SelfUpdateHandoff;
    try {
      handoff = await this.selfUpdateHandoffService.inspect({
        handoffId: selfUpdateHandoffId(deployment.id),
        projectId: deployment.projectId,
        targetRevision: deployment.revision,
        planHash: deployment.planHash,
      });
    } catch {
      return deployment;
    }

    if (
      handoff.status === 'accepted' ||
      handoff.status === 'applying' ||
      handoff.status === 'restarting' ||
      handoff.status === 'verifying'
    ) {
      const running = {
        ...deployment,
        status: 'deploying' as const,
        currentStepId: 'self-update' as const,
        timeline: deployment.timeline.map((step, index) => {
          if (index !== selfUpdateIndex) return step;
          const next = {
            ...step,
            status: 'running' as const,
            startedAt: step.startedAt ?? handoff.createdAt,
          };
          delete next.finishedAt;
          delete next.exitCode;
          return next;
        }),
      };
      delete running.finishedAt;
      delete running.failurePoint;
      delete running.errorCode;
      delete running.errorMessage;
      await this.store.save(running);
      return running;
    }

    if (handoff.status === 'prepared') {
      if (deployment.errorCode !== 'DEPLOYMENT_INTERRUPTED') return deployment;
      return this.finishSelfUpdate(deployment, selfUpdateIndex, {
        status: 'failed',
        code: 'SELF_UPDATE_HANDOFF_NOT_ACCEPTED',
        message:
          'A API reiniciou antes que o self-update agent comprovasse ownership do handoff.',
        finishedAt: handoff.updatedAt,
      });
    }

    const result = handoff.result;
    if (!result) return deployment;

    if (handoff.status === 'succeeded') {
      if (result.appliedRevision !== deployment.revision) {
        return this.finishSelfUpdate(deployment, selfUpdateIndex, {
          status: 'recovery_required',
          code: 'SELF_UPDATE_APPLIED_REVISION_MISMATCH',
          message:
            'O worker concluiu, mas a revision aplicada não corresponde à revision confirmada.',
          finishedAt: result.finishedAt,
        });
      }
      return this.finishSelfUpdate(deployment, selfUpdateIndex, {
        status: 'succeeded',
        code: result.code,
        message: result.message,
        finishedAt: result.finishedAt,
      });
    }

    return this.finishSelfUpdate(deployment, selfUpdateIndex, {
      status:
        handoff.status === 'recovery_required' ? 'recovery_required' : 'failed',
      code: result.code,
      message: result.message,
      finishedAt: result.finishedAt,
    });
  }

  private async finishSelfUpdate(
    deployment: Deployment,
    selfUpdateIndex: number,
    result: {
      status: 'succeeded' | 'failed' | 'recovery_required';
      code: string;
      message: string;
      finishedAt: string;
    },
  ): Promise<Deployment> {
    const succeeded = result.status === 'succeeded';
    const next: Deployment = {
      ...deployment,
      status: result.status,
      currentStepId: 'self-update',
      finishedAt: result.finishedAt,
      ...(succeeded
        ? {}
        : {
            failurePoint:
              result.status === 'recovery_required'
                ? ('after-irreversible' as const)
                : ('before-irreversible' as const),
            errorCode: result.code,
            errorMessage: result.message,
          }),
      timeline: deployment.timeline.map((step, index) =>
        index === selfUpdateIndex
          ? {
              ...step,
              status: succeeded ? ('succeeded' as const) : ('failed' as const),
              finishedAt: result.finishedAt,
              exitCode: succeeded ? 0 : 1,
            }
          : step,
      ),
    };
    if (succeeded) {
      delete next.failurePoint;
      delete next.errorCode;
      delete next.errorMessage;
    }

    const changed =
      deployment.status !== next.status ||
      deployment.finishedAt !== next.finishedAt ||
      deployment.errorCode !== next.errorCode;
    if (changed) {
      await this.store.save(next);
      await this.store.appendLog(deployment.id, {
        content: `[self-update] ${result.message}\n`,
        masked: false,
        redactionCount: 0,
      });
    }
    return next;
  }

  private async executeVerifyRetry(
    project: Project,
    initial: Deployment,
    verifyIndex: number,
    controller: AbortController,
  ): Promise<void> {
    let deployment = initial;
    let logQueue = Promise.resolve();
    let verifyExitCode: number | undefined;
    const verifyStep = deployment.timeline[verifyIndex]!;

    try {
      await this.assertRevisionUnchanged(project, deployment);
      const result = await this.adapter.run(
        project,
        verifyStep,
        controller.signal,
        (output) => {
          logQueue = logQueue
            .then(() => this.store.appendLog(deployment.id, output))
            .catch(() => undefined);
        },
      );
      await logQueue;
      verifyExitCode = result.exitCode;

      if (result.cancelled || controller.signal.aborted) {
        const finishedAt = new Date(this.now()).toISOString();
        deployment = {
          ...deployment,
          status: 'recovery_required',
          finishedAt,
          failurePoint: 'after-irreversible',
          errorCode: 'DEPLOYMENT_VERIFY_RETRY_CANCELLED',
          errorMessage:
            'A nova verificação foi cancelada. O deploy já ocorreu; nenhuma etapa de mutação foi repetida.',
          timeline: deployment.timeline.map((step, index) =>
            index === verifyIndex
              ? {
                  ...step,
                  status: 'cancelled',
                  finishedAt,
                  ...(verifyExitCode === undefined
                    ? {}
                    : { exitCode: verifyExitCode }),
                }
              : step,
          ),
        };
        await this.store.save(deployment);
        return;
      }

      if (result.exitCode !== 0) {
        throw new DeploymentError(
          'DEPLOYMENT_COMMAND_FAILED',
          `A etapa verify terminou com código ${result.exitCode}.`,
        );
      }

      const finishedAt = new Date(this.now()).toISOString();
      deployment = {
        ...deployment,
        status: 'succeeded',
        finishedAt,
        timeline: deployment.timeline.map((step, index) =>
          index === verifyIndex
            ? {
                ...step,
                status: 'succeeded',
                finishedAt,
                exitCode: result.exitCode,
              }
            : step,
        ),
      };
      delete deployment.failurePoint;
      delete deployment.errorCode;
      delete deployment.errorMessage;
      await this.store.save(deployment);
    } catch (error) {
      await logQueue.catch(() => undefined);
      const finishedAt = new Date(this.now()).toISOString();
      const deploymentError =
        error instanceof DeploymentError
          ? error
          : new DeploymentError(
              'DEPLOYMENT_COMMAND_FAILED',
              'A nova verificação de produção falhou.',
            );
      deployment = {
        ...deployment,
        status: 'recovery_required',
        finishedAt,
        failurePoint: 'after-irreversible',
        errorCode: deploymentError.code,
        errorMessage: deploymentError.message,
        timeline: deployment.timeline.map((step, index) =>
          index === verifyIndex && step.status === 'running'
            ? {
                ...step,
                status: 'failed',
                finishedAt,
                ...(verifyExitCode === undefined
                  ? {}
                  : { exitCode: verifyExitCode }),
              }
            : step,
        ),
      };
      await this.store.save(deployment);
    } finally {
      if (this.active?.deploymentId === deployment.id) this.active = undefined;
    }
  }

  private verifyRetryIndex(deployment: Deployment): number {
    if (
      deployment.status !== 'recovery_required' &&
      deployment.status !== 'failed' &&
      deployment.status !== 'cancelled'
    ) {
      throw new DeploymentError(
        'DEPLOYMENT_VERIFY_RETRY_NOT_AVAILABLE',
        'A verificação só pode ser repetida depois que o deploy terminou e somente o verify falhou ou foi cancelado.',
      );
    }

    const verifyIndex = deployment.timeline.findIndex(
      (step) => step.id === 'verify',
    );
    const verifyStep = deployment.timeline[verifyIndex];
    const deployStep = deployment.timeline.find(
      (step) => step.id === 'deploy' || step.id === 'provider-deploy',
    );
    const previousStepsSucceeded =
      verifyIndex > 0 &&
      deployment.timeline
        .slice(0, verifyIndex)
        .every((step) => step.status === 'succeeded');
    const verifyRetryable =
      verifyStep &&
      !verifyStep.mutating &&
      !verifyStep.irreversible &&
      (verifyStep.status === 'failed' || verifyStep.status === 'cancelled');

    if (
      verifyIndex !== deployment.timeline.length - 1 ||
      deployStep?.status !== 'succeeded' ||
      !previousStepsSucceeded ||
      !verifyRetryable
    ) {
      throw new DeploymentError(
        'DEPLOYMENT_VERIFY_RETRY_NOT_AVAILABLE',
        'Esta execução não está no estado seguro para repetir somente o verify. Revise timeline, log e política de recuperação.',
      );
    }

    return verifyIndex;
  }

  private async assertLatestDeployment(
    projectId: string,
    deploymentId: string,
  ): Promise<void> {
    const latest = await this.store.history(projectId, 1, 1);
    if (latest.items[0]?.id !== deploymentId) {
      throw new DeploymentError(
        'DEPLOYMENT_VERIFY_RETRY_NOT_AVAILABLE',
        'Somente o deployment mais recente do projeto pode repetir o verify.',
      );
    }
  }

  private async assertRevisionUnchanged(
    project: Project,
    deployment: Deployment,
  ): Promise<void> {
    const current = await this.revisionResolver.resolve(project);
    if (project.production?.strategy === 'self-update') {
      const target = await this.originRevisionResolver.resolve(
        project,
        deployment.branch,
      );
      if (
        current.branch !== deployment.branch ||
        target !== deployment.revision
      ) {
        throw new DeploymentError(
          'DEPLOYMENT_PLAN_STALE',
          'Branch local ou origin/main mudou durante o self-update; gere e confirme um novo plano.',
        );
      }
      return;
    }

    if (
      current.revision !== deployment.revision ||
      current.branch !== deployment.branch
    ) {
      throw new DeploymentError(
        'DEPLOYMENT_PLAN_STALE',
        'Branch ou revisão mudou durante o deployment; a execução foi interrompida antes da próxima etapa.',
      );
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
