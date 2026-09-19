import type { Project } from '@dev-dashboard/contracts';

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

export interface MigrationMutationExecutionSnapshot
  extends DetachableExecutionSnapshot {
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
  provider: string;
  operation: MigrationMutationOperation;
  database: string;
  environmentInstanceId: string;
  planHash: string;
}

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
    provider: plan.provider,
    operation: plan.operation,
    database: plan.database,
    environmentInstanceId: plan.environmentInstanceId,
    planHash: plan.planHash,
  };
}

function withMetadata(
  snapshot: DetachableExecutionSnapshot,
  metadata: ExecutionMetadata,
): MigrationMutationExecutionSnapshot {
  return {
    ...snapshot,
    ...metadata,
  };
}

export class MigrationMutationExecutionService {
  private readonly metadata = new Map<string, ExecutionMetadata>();

  public constructor(
    private readonly planner: Planner,
    private readonly confirmations: Confirmations,
    private readonly detachable: DetachableExecutionService,
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
    const command = plan.command;
    if (!command) {
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
      throw new MigrationMutationExecutionError(
        'MIGRATION_MUTATION_START_FAILED',
        'Não foi possível iniciar a migration mutation.',
      );
    }

    const metadata = metadataFromPlan(plan);
    this.metadata.set(key, metadata);
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
      const handle = this.detachable.attach(
        key,
        onData,
        (snapshot) => onExit(withMetadata(snapshot, metadata)),
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
    this.detachable.cancel(executionKey(projectId, environmentInstanceId));
  }
}
