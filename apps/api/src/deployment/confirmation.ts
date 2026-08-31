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
  expiresAt: number;
}

const DEFAULT_TTL_MS = 60_000;

export class DeploymentConfirmationService {
  private readonly confirmations = new Map<string, StoredConfirmation>();

  public constructor(
    private readonly ttlMs = DEFAULT_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  public prepare(plan: DeploymentPlan): DeploymentConfirmation {
    this.pruneExpired();
    const token = randomBytes(32).toString('hex');
    const expiresAt = this.now() + this.ttlMs;
    this.confirmations.set(token, {
      token,
      projectId: plan.projectId,
      revision: plan.revision,
      planHash: plan.planHash,
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

  public consume(plan: DeploymentPlan, token: string | undefined): void {
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
    this.confirmations.delete(confirmation.token);
  }

  private pruneExpired(): void {
    const now = this.now();
    for (const [token, confirmation] of this.confirmations) {
      if (confirmation.expiresAt <= now) this.confirmations.delete(token);
    }
  }
}
