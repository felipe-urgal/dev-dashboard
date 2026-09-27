import type { ActivityJob, Project } from '@dev-dashboard/contracts';
import type { AppendActivityEventInput } from '@dev-dashboard/core';

import {
  DetachableExecutionError,
  type DetachableExecutionService,
  type DetachableExecutionSnapshot,
} from './detachable-execution-service.js';
import type { MigrationMutationConfirmationService } from './migration-mutation-confirmation-service.js';
import type {
  MigrationMutationOperation,
  MigrationMutationPlan,
} from './migration-mutation-provider.js';
import type {
  MigrationMutationPlanInput,
  MigrationMutationPlanningService,
} from './migration-mutation-planning-service.js';

export type MigrationMutationExecutionErrorCode =
  | 'MIGRATION_MUTATION_EXECUTION_CONTEXT_CHANGED'
  | 'MIGRATION_MUTATION_ALREADY_RUNNING'
  | 'MIGRATION_MUTATION_EXECUTION_NOT_FOUND'
  | 'MIGRATION_MUTATION_START_FAILED';

export class MigrationMutationExecutionError extends Error {
  public constructor(
    public readonly code: MigrationMutationExecutionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MigrationMutationExecutionError';
  }
}

export interface MigrationMutationExecutionSnapshot extends DetachableExecutionSnapshot {
  provider: string;
  operation: MigrationMutationOperation;
  database: string;
  environmentInstanceId: string;
  planHash: string;
}

export interface MigrationMutationAttachHandle {
  snapshot: MigrationMutationExecutionSnapshot;
  detach(): void;
}

interface ExecutionMetadata {
  projectId: string;
  provider: string;
  operation: MigrationMutationOperation;
  database: string;
  environmentInstanceId: string;
  planHash: string;
  cancelled: boolean;
}

type ActivityEventWriter = {
  append(input: AppendActivityEventInput): Promise<unknown>;
};

type Planner = Pick<
  MigrationMutationPlanningService,
  'plan' | 'resolveExecutionContext'
>;

type Confirmations = Pick<MigrationMutationConfirmationService, 'consume'>;

function executionKey(
  projectId: string,
  environmentInstanceId: string,
): string {
  return `${projectId}:${environmentInstanceId}:migration-mutation`;
}

function metadataFromPlan(plan: MigrationMutationPlan): ExecutionMetadata {
  return {
    projectId: plan.projectId,
    provider: plan.provider,
    operation: plan.operation,
    database: plan.database,
    environmentInstanceId: plan.environmentInstanceId,
    planHash: plan.planHash,
    cancelled: false,
  };
}

function withMetadata(
  snapshot: DetachableExecutionSnapshot,
  metadata: ExecutionMetadata,
): MigrationMutationExecutionSnapshot {
  return {
    ...snapshot,
    provider: metadata.provider,
    operation: metadata.operation,
    database: metadata.database,
    environmentInstanceId: metadata.environmentInstanceId,
    planHash: metadata.planHash,
  };
}

export class MigrationMutationExecutionService {
  private readonly metadata = new Map<string, ExecutionMetadata>();

  public constructor(
    private readonly planner: Planner,
    private readonly confirmations: Confirmations,
    private readonly detachable: DetachableExecutionService,
    private readonly activityEvents?: ActivityEventWriter,
  ) {}

  public async start(
    project: Project,
    input: MigrationMutationPlanInput,
    confirmationToken: string | undefined,
  ): Promise<MigrationMutationExecutionSnapshot> {
    const plan = await this.planner.plan(project, input);
    const executionContext = this.planner.resolveExecutionContext(plan);
    if (!executionContext) {
      throw new MigrationMutationExecutionError(
        'MIGRATION_MUTATION_EXECUTION_CONTEXT_CHANGED',
        'O ambiente de execução mudou desde o planejamento; gere e confirme um novo plano.',
      );
    }

    this.confirmations.consume(plan, confirmationToken);
    const metadata = metadataFromPlan(plan);
    const command = plan.command;
    if (!command) {
      await this.recordActivity(metadata, 'failed');
      throw new MigrationMutationExecutionError(
        'MIGRATION_MUTATION_START_FAILED',
        'O plano confirmado não possui comando estruturado para execução.',
      );
    }

    const key = executionKey(project.id, plan.environmentInstanceId);
    let snapshot: DetachableExecutionSnapshot;
    try {
      snapshot = this.detachable.start(key, {
        file: command.file,
        args: command.args,
        cwd: executionContext.cwd,
      });
    } catch (error) {
      if (
        error instanceof DetachableExecutionError &&
        error.code === 'ALREADY_RUNNING'
      ) {
        throw new MigrationMutationExecutionError(
          'MIGRATION_MUTATION_ALREADY_RUNNING',
          'Já existe uma migration mutation em andamento neste ambiente.',
        );
      }
      await this.recordActivity(metadata, 'failed');
      throw new MigrationMutationExecutionError(
        'MIGRATION_MUTATION_START_FAILED',
        'Não foi possível iniciar a migration mutation.',
      );
    }

    this.metadata.set(key, metadata);
    await this.recordActivity(metadata, 'started');
    this.observeCompletion(key, metadata);
    return withMetadata(snapshot, metadata);
  }

  public snapshot(
    projectId: string,
    environmentInstanceId: string,
  ): MigrationMutationExecutionSnapshot | undefined {
    const key = executionKey(projectId, environmentInstanceId);
    const metadata = this.metadata.get(key);
    if (!metadata) return undefined;

    const snapshot = this.detachable.snapshotOf(key);
    if (!snapshot) {
      this.metadata.delete(key);
      return undefined;
    }
    return withMetadata(snapshot, metadata);
  }

  public attach(
    projectId: string,
    environmentInstanceId: string,
    onData: (chunk: string) => void,
    onExit: (snapshot: MigrationMutationExecutionSnapshot) => void,
  ): MigrationMutationAttachHandle {
    const key = executionKey(projectId, environmentInstanceId);
    const metadata = this.metadata.get(key);
    if (!metadata) {
      throw new MigrationMutationExecutionError(
        'MIGRATION_MUTATION_EXECUTION_NOT_FOUND',
        'Nenhuma migration mutation foi encontrada para este ambiente.',
      );
    }

    try {
      const handle = this.detachable.attach(key, onData, (snapshot) =>
        onExit(withMetadata(snapshot, metadata)),
      );
      return {
        snapshot: withMetadata(handle.snapshot, metadata),
        detach: handle.detach,
      };
    } catch (error) {
      if (
        error instanceof DetachableExecutionError &&
        error.code === 'NOT_FOUND'
      ) {
        this.metadata.delete(key);
        throw new MigrationMutationExecutionError(
          'MIGRATION_MUTATION_EXECUTION_NOT_FOUND',
          'Nenhuma migration mutation foi encontrada para este ambiente.',
        );
      }
      throw error;
    }
  }

  public cancel(projectId: string, environmentInstanceId: string): void {
    const key = executionKey(projectId, environmentInstanceId);
    const metadata = this.metadata.get(key);
    if (metadata && !metadata.cancelled) {
      metadata.cancelled = true;
      void this.recordActivity(metadata, 'cancelled');
    }
    this.detachable.cancel(key);
  }

  public activityJobs(projectId: string): ActivityJob[] {
    const jobs: ActivityJob[] = [];
    for (const [key, metadata] of this.metadata) {
      if (metadata.projectId !== projectId) continue;
      const snapshot = this.detachable.snapshotOf(key);
      if (!snapshot || snapshot.status !== 'running') continue;
      jobs.push({
        id: `migration:${metadata.planHash}`,
        projectId,
        environmentInstanceId: metadata.environmentInstanceId,
        domain: 'database',
        action: `Migration ${metadata.operation}`,
        status: 'running',
        startedAt: snapshot.startedAt,
        resourceRef: {
          kind: 'migration-mutation',
          id: metadata.planHash,
        },
        cancelSupported: true,
      });
    }
    return jobs;
  }

  private observeCompletion(key: string, metadata: ExecutionMetadata): void {
    this.detachable.attach(
      key,
      () => undefined,
      (snapshot) => {
        if (!metadata.cancelled) {
          void this.recordActivity(
            metadata,
            snapshot.exitCode === 0 ? 'succeeded' : 'failed',
          );
        }
      },
    );
  }

  private async recordActivity(
    metadata: ExecutionMetadata,
    status: 'started' | 'succeeded' | 'failed' | 'cancelled',
  ): Promise<void> {
    if (!this.activityEvents) return;
    try {
      await this.activityEvents.append({
        projectId: metadata.projectId,
        environmentInstanceId: metadata.environmentInstanceId,
        domain: 'database',
        type: `migration.${metadata.operation}`,
        status,
        summary: `Migration: ${metadata.operation} (${metadata.database})`,
        resourceRef: {
          kind: 'migration-mutation',
          id: metadata.planHash,
        },
        jobId: `migration:${metadata.planHash}`,
      });
    } catch {
      // Observabilidade não pode falhar a mutation confirmada.
    }
  }
}
