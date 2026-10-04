import { randomUUID } from 'node:crypto';

import type { ActivityEventStatus, ActivityJob, Project } from '@dev-dashboard/contracts';
import type { AppendActivityEventInput } from '@dev-dashboard/core';

import type {
  DockerComposeLifecycleConfirmationService,
  DockerComposeLifecycleOperation,
} from './docker-compose-lifecycle-confirmation-service.js';
import {
  DockerComposeLifecycleError,
  type DockerComposeLifecycleService,
} from './docker-compose-lifecycle-service.js';

export type DockerComposeLifecycleExecutionStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed';

export interface DockerComposeLifecycleExecutionSnapshot {
  id: string;
  projectId: string;
  environmentInstanceId: string;
  operation: DockerComposeLifecycleOperation;
  service?: string;
  status: DockerComposeLifecycleExecutionStatus;
  stage: 'queued' | 'mutating' | 'completed' | 'failed';
  cancelSupported: false;
  startedAt: string;
  finishedAt?: string;
  resultState?: string;
  diagnostic?: string;
}

export type DockerComposeLifecycleExecutionErrorCode =
  | 'COMPOSE_EXECUTION_ALREADY_RUNNING'
  | 'COMPOSE_EXECUTION_NOT_FOUND';

export class DockerComposeLifecycleExecutionError extends Error {
  public constructor(
    public readonly code: DockerComposeLifecycleExecutionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DockerComposeLifecycleExecutionError';
  }
}

type LifecycleService = Pick<
  DockerComposeLifecycleService,
  'start' | 'stop' | 'restart'
>;
type ActivityEventWriter = {
  append(input: AppendActivityEventInput): Promise<unknown>;
};

interface ExecutionRecord {
  snapshot: DockerComposeLifecycleExecutionSnapshot;
  project: Project;
}

function executionKey(
  projectId: string,
  environmentInstanceId: string,
): string {
  return `${projectId}:${environmentInstanceId}:compose-lifecycle`;
}

function actionLabel(
  operation: DockerComposeLifecycleOperation,
  service?: string,
): string {
  const target = service ? ` · ${service}` : '';
  if (operation === 'start') return `Iniciar Compose${target}`;
  if (operation === 'stop') return `Parar Compose${target}`;
  return `Reiniciar Compose${target}`;
}

function summaryLabel(
  operation: DockerComposeLifecycleOperation,
  service?: string,
): string {
  const target = service ? ` · ${service}` : '';
  return `Docker Compose: ${operation}${target}`;
}

export class DockerComposeLifecycleExecutionService {
  private readonly executions = new Map<string, ExecutionRecord>();

  public constructor(
    private readonly lifecycle: LifecycleService,
    private readonly confirmations: Pick<
      DockerComposeLifecycleConfirmationService,
      'consume'
    >,
    private readonly activityEvents?: ActivityEventWriter,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public start(
    projectId: string,
    environmentInstanceId: string,
    project: Project,
    operation: DockerComposeLifecycleOperation,
    confirmationToken: string,
    service?: string,
  ): DockerComposeLifecycleExecutionSnapshot {
    const key = executionKey(projectId, environmentInstanceId);
    const current = this.executions.get(key);
    if (
      current &&
      (current.snapshot.status === 'queued' ||
        current.snapshot.status === 'running')
    ) {
      throw new DockerComposeLifecycleExecutionError(
        'COMPOSE_EXECUTION_ALREADY_RUNNING',
        'Já existe uma operação Docker Compose em andamento neste ambiente.',
      );
    }

    this.confirmations.consume(
      confirmationToken,
      projectId,
      environmentInstanceId,
      operation,
      service,
    );

    const snapshot: DockerComposeLifecycleExecutionSnapshot = {
      id: randomUUID(),
      projectId,
      environmentInstanceId,
      operation,
      ...(service ? { service } : {}),
      status: 'queued',
      stage: 'queued',
      cancelSupported: false,
      startedAt: this.now().toISOString(),
    };
    const record = { snapshot, project };
    this.executions.set(key, record);
    queueMicrotask(() => {
      void this.execute(record);
    });
    return { ...snapshot };
  }

  public latest(
    projectId: string,
    environmentInstanceId: string,
  ): DockerComposeLifecycleExecutionSnapshot | undefined {
    const record = this.executions.get(
      executionKey(projectId, environmentInstanceId),
    );
    return record ? { ...record.snapshot } : undefined;
  }

  public activityJobs(projectId: string): ActivityJob[] {
    const jobs: ActivityJob[] = [];
    for (const { snapshot } of this.executions.values()) {
      if (
        snapshot.projectId !== projectId ||
        (snapshot.status !== 'queued' && snapshot.status !== 'running')
      ) {
        continue;
      }
      jobs.push({
        id: `compose:${snapshot.id}`,
        projectId,
        environmentInstanceId: snapshot.environmentInstanceId,
        domain: 'compose',
        action: actionLabel(snapshot.operation, snapshot.service),
        status: snapshot.status,
        startedAt: snapshot.startedAt,
        resourceRef: {
          kind: 'docker-compose-lifecycle',
          id: snapshot.id,
        },
        stage: snapshot.stage,
        stageStartedAt: snapshot.startedAt,
        timingIncomplete: false,
        cancelSupported: false,
      });
    }
    return jobs;
  }

  private async execute(record: ExecutionRecord): Promise<void> {
    const snapshot = record.snapshot;
    snapshot.status = 'running';
    snapshot.stage = 'mutating';
    await this.recordActivity(snapshot, 'started');

    try {
      const result =
        snapshot.operation === 'start'
          ? await this.lifecycle.start(record.project, {}, snapshot.service)
          : snapshot.operation === 'stop'
            ? await this.lifecycle.stop(record.project, snapshot.service)
            : await this.lifecycle.restart(
                record.project,
                snapshot.service,
                {},
              );

      snapshot.status = 'succeeded';
      snapshot.stage = 'completed';
      snapshot.finishedAt = this.now().toISOString();
      snapshot.resultState = result.state;
      snapshot.diagnostic = result.diagnostic;

      const warning = result.state.endsWith('-unverified');
      await this.recordActivity(snapshot, warning ? 'warning' : 'succeeded');
    } catch (error) {
      snapshot.status = 'failed';
      snapshot.stage = 'failed';
      snapshot.finishedAt = this.now().toISOString();
      snapshot.diagnostic =
        error instanceof DockerComposeLifecycleError
          ? error.message
          : 'A operação Docker Compose falhou.';
      await this.recordActivity(snapshot, 'failed');
    }
  }

  private async recordActivity(
    snapshot: DockerComposeLifecycleExecutionSnapshot,
    status: ActivityEventStatus,
  ): Promise<void> {
    if (!this.activityEvents) return;
    try {
      await this.activityEvents.append({
        projectId: snapshot.projectId,
        environmentInstanceId: snapshot.environmentInstanceId,
        domain: 'compose',
        type: `compose.${snapshot.operation}`,
        status,
        summary: summaryLabel(snapshot.operation, snapshot.service),
        resourceRef: {
          kind: 'docker-compose-lifecycle',
          id: snapshot.id,
        },
        jobId: `compose:${snapshot.id}`,
      });
    } catch {
      // Observabilidade não altera o resultado do lifecycle.
    }
  }
}
