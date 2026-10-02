import { randomUUID } from 'node:crypto';

import type { ActivityJob, Project } from '@dev-dashboard/contracts';
import type { AppendActivityEventInput } from '@dev-dashboard/core';

import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type {
  DevContainerCleanupService,
} from './dev-container-cleanup-service.js';
import type { DevContainerStartService } from './dev-container-start-service.js';
import type { DevContainerStopConfirmationService } from './dev-container-stop-confirmation-service.js';

export type DevContainerLifecycleExecutionOperation =
  | 'create'
  | 'rebuild'
  | 'stop'
  | 'recover';

export type DevContainerLifecycleExecutionStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface DevContainerLifecycleExecutionSnapshot {
  id: string;
  projectId: string;
  environmentInstanceId: string;
  operation: DevContainerLifecycleExecutionOperation;
  status: DevContainerLifecycleExecutionStatus;
  stage: string;
  cancelSupported: boolean;
  startedAt: string;
  finishedAt?: string;
  diagnostic?: string;
}

export type DevContainerLifecycleExecutionErrorCode =
  | 'DEV_CONTAINER_EXECUTION_ENVIRONMENT_NOT_FOUND'
  | 'DEV_CONTAINER_EXECUTION_ALREADY_RUNNING'
  | 'DEV_CONTAINER_EXECUTION_NOT_FOUND'
  | 'DEV_CONTAINER_EXECUTION_NOT_CANCELABLE';

export class DevContainerLifecycleExecutionError extends Error {
  public constructor(
    public readonly code: DevContainerLifecycleExecutionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DevContainerLifecycleExecutionError';
  }
}

interface ExecutionRecord {
  snapshot: DevContainerLifecycleExecutionSnapshot;
  confirmationToken: string;
  abortController?: AbortController;
  cancelRequested: boolean;
}

type EnvironmentStore = Pick<
  DevelopmentEnvironmentInstanceStore,
  'findForProject'
>;
type StartService = Pick<DevContainerStartService, 'start' | 'rebuild'>;
type CleanupService = Pick<DevContainerCleanupService, 'inspect' | 'cleanup'>;
type StopConfirmations = Pick<DevContainerStopConfirmationService, 'consume'>;
type ActivityEventWriter = {
  append(input: AppendActivityEventInput): Promise<unknown>;
};

function executionKey(projectId: string, environmentInstanceId: string): string {
  return `${projectId}:${environmentInstanceId}:dev-container-lifecycle`;
}

function actionLabel(operation: DevContainerLifecycleExecutionOperation): string {
  if (operation === 'create') return 'Criar Dev Container';
  if (operation === 'rebuild') return 'Rebuild Dev Container';
  if (operation === 'stop') return 'Parar Dev Container';
  return 'Recuperar Dev Container';
}

function summaryLabel(operation: DevContainerLifecycleExecutionOperation): string {
  if (operation === 'create') return 'Dev Container: criação';
  if (operation === 'rebuild') return 'Dev Container: rebuild';
  if (operation === 'stop') return 'Dev Container: parada';
  return 'Dev Container: recuperação';
}

export class DevContainerLifecycleExecutionService {
  private readonly executions = new Map<string, ExecutionRecord>();

  public constructor(
    private readonly environmentStore: EnvironmentStore,
    private readonly startService: StartService,
    private readonly cleanupService: CleanupService,
    private readonly stopConfirmations: StopConfirmations,
    private readonly activityEvents?: ActivityEventWriter,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public start(
    project: Project,
    operation: DevContainerLifecycleExecutionOperation,
    confirmationToken: string,
    environmentInstanceId?: string,
  ): DevContainerLifecycleExecutionSnapshot {
    const instance = this.environmentStore.findForProject(
      project.id,
      environmentInstanceId,
    );
    if (!instance || instance.lifecycle === 'degraded') {
      throw new DevContainerLifecycleExecutionError(
        'DEV_CONTAINER_EXECUTION_ENVIRONMENT_NOT_FOUND',
        'Ambiente de desenvolvimento não encontrado para a operação Dev Container.',
      );
    }

    const key = executionKey(project.id, instance.id);
    const current = this.executions.get(key);
    if (
      current &&
      (current.snapshot.status === 'queued' ||
        current.snapshot.status === 'running')
    ) {
      throw new DevContainerLifecycleExecutionError(
        'DEV_CONTAINER_EXECUTION_ALREADY_RUNNING',
        'Já existe uma operação Dev Container em andamento neste ambiente.',
      );
    }

    const abortController =
      operation === 'create' || operation === 'rebuild'
        ? new AbortController()
        : undefined;
    const snapshot: DevContainerLifecycleExecutionSnapshot = {
      id: randomUUID(),
      projectId: project.id,
      environmentInstanceId: instance.id,
      operation,
      status: 'queued',
      stage: 'queued',
      cancelSupported: Boolean(abortController),
      startedAt: this.now().toISOString(),
    };
    const record: ExecutionRecord = {
      snapshot,
      confirmationToken,
      ...(abortController ? { abortController } : {}),
      cancelRequested: false,
    };
    this.executions.set(key, record);
    queueMicrotask(() => {
      void this.execute(project, key, record);
    });
    return { ...snapshot };
  }

  public latest(
    projectId: string,
    environmentInstanceId?: string,
  ): DevContainerLifecycleExecutionSnapshot | undefined {
    const instance = this.environmentStore.findForProject(
      projectId,
      environmentInstanceId,
    );
    if (!instance) return undefined;
    const record = this.executions.get(executionKey(projectId, instance.id));
    return record ? { ...record.snapshot } : undefined;
  }

  public cancel(projectId: string, environmentInstanceId?: string): void {
    const instance = this.environmentStore.findForProject(
      projectId,
      environmentInstanceId,
    );
    if (!instance) {
      throw new DevContainerLifecycleExecutionError(
        'DEV_CONTAINER_EXECUTION_ENVIRONMENT_NOT_FOUND',
        'Ambiente de desenvolvimento não encontrado para cancelamento.',
      );
    }
    const record = this.executions.get(executionKey(projectId, instance.id));
    if (
      !record ||
      (record.snapshot.status !== 'queued' &&
        record.snapshot.status !== 'running')
    ) {
      throw new DevContainerLifecycleExecutionError(
        'DEV_CONTAINER_EXECUTION_NOT_FOUND',
        'Nenhuma operação Dev Container ativa foi encontrada neste ambiente.',
      );
    }
    if (!record.abortController) {
      throw new DevContainerLifecycleExecutionError(
        'DEV_CONTAINER_EXECUTION_NOT_CANCELABLE',
        'Esta etapa de cleanup não pode ser cancelada com segurança.',
      );
    }

    record.cancelRequested = true;
    record.snapshot.stage = 'cancelling';
    record.abortController.abort();
  }

  public activityJobs(projectId: string): ActivityJob[] {
    const jobs: ActivityJob[] = [];
    for (const record of this.executions.values()) {
      const snapshot = record.snapshot;
      if (
        snapshot.projectId !== projectId ||
        (snapshot.status !== 'queued' && snapshot.status !== 'running')
      ) {
        continue;
      }
      jobs.push({
        id: `devcontainer:${snapshot.id}`,
        projectId,
        environmentInstanceId: snapshot.environmentInstanceId,
        domain: 'process',
        action: actionLabel(snapshot.operation),
        status: snapshot.status,
        startedAt: snapshot.startedAt,
        resourceRef: {
          kind: 'dev-container-lifecycle',
          id: snapshot.id,
        },
        stage: snapshot.stage,
        stageStartedAt: snapshot.startedAt,
        timingIncomplete: false,
        cancelSupported: snapshot.cancelSupported,
      });
    }
    return jobs;
  }

  private async execute(
    project: Project,
    key: string,
    record: ExecutionRecord,
  ): Promise<void> {
    const snapshot = record.snapshot;
    snapshot.status = 'running';
    snapshot.stage = 'validating';
    await this.recordActivity(snapshot, 'started');

    try {
      if (snapshot.operation === 'create' || snapshot.operation === 'rebuild') {
        const onStage = (stage: string): void => {
          snapshot.stage = stage;
        };
        const input = {
          environmentInstanceId: snapshot.environmentInstanceId,
          confirmationToken: record.confirmationToken,
          signal: record.abortController?.signal,
          onStage,
        };
        if (snapshot.operation === 'create') {
          await this.startService.start(project, input);
        } else {
          await this.startService.rebuild(project, input);
        }
      } else {
        snapshot.stage =
          snapshot.operation === 'recover'
            ? 'recovering-runtime'
            : 'cleaning-runtime';
        const inspection = await this.cleanupService.inspect(
          project,
          snapshot.environmentInstanceId,
        );
        const ownershipToken = this.stopConfirmations.consume(
          project,
          inspection,
          record.confirmationToken,
        );
        await this.cleanupService.cleanup(
          project,
          inspection.environmentInstanceId,
          ownershipToken,
        );
      }

      snapshot.status = 'succeeded';
      snapshot.stage = 'completed';
      snapshot.finishedAt = this.now().toISOString();
      snapshot.cancelSupported = false;
      await this.recordActivity(snapshot, 'succeeded');
    } catch (error) {
      const cancelled =
        record.cancelRequested && record.abortController?.signal.aborted === true;
      snapshot.status = cancelled ? 'cancelled' : 'failed';
      snapshot.stage = cancelled ? 'cancelled' : 'failed';
      snapshot.finishedAt = this.now().toISOString();
      snapshot.cancelSupported = false;
      snapshot.diagnostic = cancelled
        ? 'A operação foi cancelada e o rollback owned foi solicitado.'
        : error instanceof Error
          ? error.message
          : 'A operação Dev Container falhou.';
      await this.recordActivity(snapshot, cancelled ? 'cancelled' : 'failed');
    } finally {
      this.executions.set(key, record);
    }
  }

  private async recordActivity(
    snapshot: DevContainerLifecycleExecutionSnapshot,
    status: 'started' | 'succeeded' | 'failed' | 'cancelled',
  ): Promise<void> {
    if (!this.activityEvents) return;
    try {
      await this.activityEvents.append({
        projectId: snapshot.projectId,
        environmentInstanceId: snapshot.environmentInstanceId,
        domain: 'process',
        type: `devcontainer.${snapshot.operation}`,
        status,
        summary: summaryLabel(snapshot.operation),
        resourceRef: {
          kind: 'dev-container-lifecycle',
          id: snapshot.id,
        },
        jobId: `devcontainer:${snapshot.id}`,
      });
    } catch {
      // Observabilidade não altera o resultado do lifecycle.
    }
  }
}
