import { createHash, randomBytes } from 'node:crypto';

import type { DevContainerLifecyclePreflight } from './dev-container-lifecycle-planning-service.js';

const DEFAULT_TTL_MS = 60_000;

export type DevContainerLifecycleConfirmationErrorCode =
  'DEV_CONTAINER_PLAN_NOT_CONFIRMABLE' | 'DEV_CONTAINER_CONFIRMATION_REQUIRED';

export class DevContainerLifecycleConfirmationError extends Error {
  public constructor(
    public readonly code: DevContainerLifecycleConfirmationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DevContainerLifecycleConfirmationError';
  }
}

interface StoredConfirmation {
  token: string;
  projectId: string;
  environmentInstanceId: string;
  operation: 'create' | 'rebuild';
  preflightHash: string;
  expiresAt: number;
}

export interface DevContainerLifecycleConfirmation {
  token: string;
  projectId: string;
  environmentInstanceId: string;
  operation: 'create' | 'rebuild';
  preflightHash: string;
  expiresAt: string;
}

export interface DevContainerLifecycleConfirmationOptions {
  ttlMs?: number;
  now?: () => number;
  createToken?: () => string;
}

function stablePreflightHash(
  preflight: DevContainerLifecyclePreflight,
): string {
  const configuration = preflight.configuration
    ? {
        kind: preflight.configuration.kind,
        name: preflight.configuration.name ?? null,
        service: preflight.configuration.service ?? null,
        lifecycleHooks: [...preflight.configuration.lifecycleHooks].sort(),
      }
    : null;

  const evidence = {
    projectId: preflight.projectId,
    operation: preflight.operation,
    environmentInstanceId: preflight.environmentInstanceId,
    runtime: preflight.runtime,
    runtimeId: preflight.runtimeId ?? null,
    ownershipToken: preflight.ownershipToken ?? null,
    state: preflight.state,
    reason: preflight.reason,
    discoveryState: preflight.discoveryState ?? null,
    configSource: preflight.configSource ?? null,
    configurationHash: preflight.configurationHash ?? null,
    cliVersion: preflight.cliVersion ?? null,
    configuration,
    limitations: [...preflight.limitations].sort(),
    requiresConfirmation: preflight.requiresConfirmation,
  };

  return createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
}

export class DevContainerLifecycleConfirmationService {
  private readonly confirmations = new Map<string, StoredConfirmation>();
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly createToken: () => string;

  public constructor(options: DevContainerLifecycleConfirmationOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? Date.now;
    this.createToken =
      options.createToken ?? (() => randomBytes(32).toString('hex'));
  }

  public prepare(
    preflight: DevContainerLifecyclePreflight,
  ): DevContainerLifecycleConfirmation {
    this.pruneExpired();
    this.assertConfirmable(preflight);

    const token = this.createToken();
    if (!/^[a-f0-9]{64}$/u.test(token)) {
      throw new DevContainerLifecycleConfirmationError(
        'DEV_CONTAINER_CONFIRMATION_REQUIRED',
        'Não foi possível criar uma confirmação segura para o Dev Container.',
      );
    }

    const expiresAt = this.now() + this.ttlMs;
    const stored: StoredConfirmation = {
      token,
      projectId: preflight.projectId,
      environmentInstanceId: preflight.environmentInstanceId,
      operation: preflight.operation,
      preflightHash: stablePreflightHash(preflight),
      expiresAt,
    };
    this.confirmations.set(token, stored);

    return {
      ...stored,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  public consume(
    preflight: DevContainerLifecyclePreflight,
    token: string | undefined,
  ): void {
    this.pruneExpired();
    this.assertConfirmable(preflight);

    const confirmation = token ? this.confirmations.get(token) : undefined;
    if (
      !confirmation ||
      confirmation.projectId !== preflight.projectId ||
      confirmation.environmentInstanceId !== preflight.environmentInstanceId ||
      confirmation.operation !== preflight.operation ||
      confirmation.preflightHash !== stablePreflightHash(preflight)
    ) {
      throw new DevContainerLifecycleConfirmationError(
        'DEV_CONTAINER_CONFIRMATION_REQUIRED',
        'Uma confirmação válida e atual é obrigatória para executar este lifecycle do Dev Container.',
      );
    }

    this.confirmations.delete(confirmation.token);
  }

  private assertConfirmable(preflight: DevContainerLifecyclePreflight): void {
    const operationReady =
      (preflight.operation === 'create' && preflight.runtime === 'host') ||
      (preflight.operation === 'rebuild' &&
        preflight.runtime === 'devcontainer' &&
        typeof preflight.runtimeId === 'string' &&
        /^[a-f0-9]{12,128}$/u.test(preflight.runtimeId) &&
        typeof preflight.ownershipToken === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
          preflight.ownershipToken,
        ));

    if (
      !operationReady ||
      preflight.state !== 'review' ||
      preflight.requiresConfirmation !== true ||
      !preflight.configSource ||
      !preflight.configurationHash ||
      !/^[a-f0-9]{64}$/u.test(preflight.configurationHash) ||
      !preflight.configuration ||
      (preflight.configuration.kind !== 'image' &&
        preflight.configuration.kind !== 'dockerfile')
    ) {
      throw new DevContainerLifecycleConfirmationError(
        'DEV_CONTAINER_PLAN_NOT_CONFIRMABLE',
        'Somente um preflight elegível e owned pode ser confirmado.',
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
