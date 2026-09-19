import { randomBytes } from 'node:crypto';

import type { MigrationMutationPlan } from './migration-mutation-provider.js';

export type MigrationMutationConfirmationErrorCode =
  | 'MIGRATION_MUTATION_PLAN_NOT_READY'
  | 'MIGRATION_MUTATION_CONFIRMATION_REQUIRED';

export class MigrationMutationConfirmationError extends Error {
  public constructor(
    public readonly code: MigrationMutationConfirmationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MigrationMutationConfirmationError';
  }
}

interface StoredConfirmation {
  token: string;
  projectId: string;
  environmentInstanceId: string;
  provider: string;
  operation: MigrationMutationPlan['operation'];
  planHash: string;
  expiresAt: number;
}

export interface MigrationMutationConfirmation {
  token: string;
  projectId: string;
  environmentInstanceId: string;
  provider: string;
  operation: MigrationMutationPlan['operation'];
  planHash: string;
  expiresAt: string;
}

const DEFAULT_TTL_MS = 60_000;

export class MigrationMutationConfirmationService {
  private readonly confirmations = new Map<string, StoredConfirmation>();

  public constructor(
    private readonly ttlMs = DEFAULT_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  public prepare(plan: MigrationMutationPlan): MigrationMutationConfirmation {
    this.pruneExpired();
    this.assertReady(plan);

    const token = randomBytes(32).toString('hex');
    const expiresAt = this.now() + this.ttlMs;
    const stored: StoredConfirmation = {
      token,
      projectId: plan.projectId,
      environmentInstanceId: plan.environmentInstanceId,
      provider: plan.provider,
      operation: plan.operation,
      planHash: plan.planHash,
      expiresAt,
    };
    this.confirmations.set(token, stored);

    return {
      token,
      projectId: stored.projectId,
      environmentInstanceId: stored.environmentInstanceId,
      provider: stored.provider,
      operation: stored.operation,
      planHash: stored.planHash,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  public consume(
    plan: MigrationMutationPlan,
    token: string | undefined,
  ): void {
    this.pruneExpired();
    this.assertReady(plan);

    const confirmation = token ? this.confirmations.get(token) : undefined;
    if (
      !confirmation ||
      confirmation.projectId !== plan.projectId ||
      confirmation.environmentInstanceId !== plan.environmentInstanceId ||
      confirmation.provider !== plan.provider ||
      confirmation.operation !== plan.operation ||
      confirmation.planHash !== plan.planHash
    ) {
      throw new MigrationMutationConfirmationError(
        'MIGRATION_MUTATION_CONFIRMATION_REQUIRED',
        'Confirmação válida é obrigatória para executar este plano de migrations.',
      );
    }

    this.confirmations.delete(confirmation.token);
  }

  private assertReady(plan: MigrationMutationPlan): void {
    if (plan.preflight.state !== 'ready' || !plan.command) {
      throw new MigrationMutationConfirmationError(
        'MIGRATION_MUTATION_PLAN_NOT_READY',
        'Somente um plano de migrations com preflight ready pode ser confirmado.',
      );
    }
  }

  private pruneExpired(): void {
    const current = this.now();
    for (const [token, confirmation] of this.confirmations) {
      if (confirmation.expiresAt <= current) {
        this.confirmations.delete(token);
      }
    }
  }
}
