import { randomBytes } from 'node:crypto';

import type {
  DeploymentConfirmation,
  DeploymentPlan,
} from '@dev-dashboard/contracts';

import { DeploymentError } from './errors.js';

interface StoredConfirmation {
  token: string;
  projectId: string;
  revision: string;
  planHash: string;
  executionFingerprint: string;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 60_000;

export class DeploymentConfirmationService {
  private readonly confirmations = new Map<string, StoredConfirmation>();

  public constructor(
    private readonly ttlMs = DEFAULT_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  public prepare(
    plan: DeploymentPlan,
    executionFingerprint = '',
  ): DeploymentConfirmation {
    this.pruneExpired();
    const token = randomBytes(32).toString('hex');
    const expiresAt = this.now() + this.ttlMs;
    this.confirmations.set(token, {
      token,
      projectId: plan.projectId,
      revision: plan.revision,
      planHash: plan.planHash,
      executionFingerprint,
      expiresAt,
    });
    return {
      token,
      projectId: plan.projectId,
      revision: plan.revision,
      planHash: plan.planHash,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  public consume(
    plan: DeploymentPlan,
    token: string | undefined,
    executionFingerprint = '',
  ): void {
    this.pruneExpired();
    const confirmation = token ? this.confirmations.get(token) : undefined;
    if (
      !confirmation ||
      confirmation.projectId !== plan.projectId ||
      confirmation.revision !== plan.revision ||
      confirmation.planHash !== plan.planHash
    ) {
      throw new DeploymentError(
        'DEPLOYMENT_CONFIRMATION_REQUIRED',
        'Confirmação válida é obrigatória para executar este plano de produção.',
      );
    }
    if (confirmation.executionFingerprint !== executionFingerprint) {
      this.confirmations.delete(confirmation.token);
      throw new DeploymentError(
        'DEPLOYMENT_ENVIRONMENT_CHANGED',
        'Os arquivos locais de ambiente mudaram desde a confirmação; gere e confirme um novo plano antes de executar.',
      );
    }
    this.confirmations.delete(confirmation.token);
  }

  private pruneExpired(): void {
    const now = this.now();
    for (const [token, confirmation] of this.confirmations) {
      if (confirmation.expiresAt <= now) this.confirmations.delete(token);
    }
  }
}
