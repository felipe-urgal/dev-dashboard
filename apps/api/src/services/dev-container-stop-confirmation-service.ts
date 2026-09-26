import { randomBytes } from 'node:crypto';

import type { Project } from '@dev-dashboard/contracts';

import type { DevContainerCleanupInspection } from './dev-container-cleanup-service.js';

const DEFAULT_TTL_MS = 60_000;

export type DevContainerStopConfirmationErrorCode =
  | 'DEV_CONTAINER_STOP_NOT_CONFIRMABLE'
  | 'DEV_CONTAINER_STOP_CONFIRMATION_REQUIRED';

export class DevContainerStopConfirmationError extends Error {
  public constructor(
    public readonly code: DevContainerStopConfirmationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DevContainerStopConfirmationError';
  }
}

interface StoredConfirmation {
  token: string;
  projectId: string;
  environmentInstanceId: string;
  ownershipToken: string;
  containerId: string | null;
  expiresAt: number;
}

export interface DevContainerStopConfirmation {
  token: string;
  environmentInstanceId: string;
  expiresAt: string;
}

export interface DevContainerStopConfirmationOptions {
  ttlMs?: number;
  now?: () => number;
  createToken?: () => string;
}

export class DevContainerStopConfirmationService {
  private readonly confirmations = new Map<string, StoredConfirmation>();
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly createToken: () => string;

  public constructor(options: DevContainerStopConfirmationOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? Date.now;
    this.createToken =
      options.createToken ?? (() => randomBytes(32).toString('hex'));
  }

  public prepare(
    project: Project,
    inspection: DevContainerCleanupInspection,
  ): DevContainerStopConfirmation {
    this.pruneExpired();
    const ownership = this.requireOwnership(inspection);

    const token = this.createToken();
    if (!/^[a-f0-9]{64}$/u.test(token)) {
      throw new DevContainerStopConfirmationError(
        'DEV_CONTAINER_STOP_CONFIRMATION_REQUIRED',
        'Não foi possível criar uma confirmação segura para parar o Dev Container.',
      );
    }

    const expiresAt = this.now() + this.ttlMs;
    let containerId: string | null = null;
    if (ownership.phase === 'owned') {
      containerId = ownership.containerId ?? null;
    }

    this.confirmations.set(token, {
      token,
      projectId: project.id,
      environmentInstanceId: inspection.environmentInstanceId,
      ownershipToken: ownership.ownershipToken,
      containerId,
      expiresAt,
    });

    return {
      token,
      environmentInstanceId: inspection.environmentInstanceId,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  public consume(
    project: Project,
    inspection: DevContainerCleanupInspection,
    token: string | undefined,
  ): string {
    this.pruneExpired();
    const ownership = this.requireOwnership(inspection);
    const confirmation = token ? this.confirmations.get(token) : undefined;
    let containerId: string | null = null;
    if (ownership.phase === 'owned') {
      containerId = ownership.containerId ?? null;
    }

    if (
      !confirmation ||
      confirmation.projectId !== project.id ||
      confirmation.environmentInstanceId !== inspection.environmentInstanceId ||
      confirmation.ownershipToken !== ownership.ownershipToken ||
      confirmation.containerId !== containerId
    ) {
      throw new DevContainerStopConfirmationError(
        'DEV_CONTAINER_STOP_CONFIRMATION_REQUIRED',
        'Uma confirmação válida e atual é obrigatória para parar o Dev Container.',
      );
    }

    this.confirmations.delete(confirmation.token);
    return confirmation.ownershipToken;
  }

  private requireOwnership(inspection: DevContainerCleanupInspection) {
    if (inspection.state === 'unowned') {
      throw new DevContainerStopConfirmationError(
        'DEV_CONTAINER_STOP_NOT_CONFIRMABLE',
        'Somente um Dev Container com ownership comprovado pode ser parado.',
      );
    }
    return inspection.ownership;
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
