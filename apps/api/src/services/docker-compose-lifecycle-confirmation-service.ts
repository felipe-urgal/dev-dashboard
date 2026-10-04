import { randomUUID } from 'node:crypto';

export type DockerComposeLifecycleOperation = 'start' | 'stop' | 'restart';

export interface DockerComposeLifecycleConfirmation {
  token: string;
  projectId: string;
  environmentInstanceId: string;
  operation: DockerComposeLifecycleOperation;
  service?: string;
  expiresAt: string;
}

export type DockerComposeLifecycleConfirmationErrorCode =
  'COMPOSE_CONFIRMATION_INVALID' | 'COMPOSE_CONFIRMATION_EXPIRED';

export class DockerComposeLifecycleConfirmationError extends Error {
  public constructor(
    public readonly code: DockerComposeLifecycleConfirmationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DockerComposeLifecycleConfirmationError';
  }
}

interface ConfirmationRecord extends DockerComposeLifecycleConfirmation {
  expiresAtMs: number;
}

const DEFAULT_TTL_MS = 2 * 60_000;
const MAX_CONFIRMATIONS = 128;

export class DockerComposeLifecycleConfirmationService {
  private readonly confirmations = new Map<string, ConfirmationRecord>();

  public constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs = DEFAULT_TTL_MS,
  ) {}

  public prepare(
    projectId: string,
    environmentInstanceId: string,
    operation: DockerComposeLifecycleOperation,
    service?: string,
  ): DockerComposeLifecycleConfirmation {
    this.prune();
    const token = randomUUID();
    const expiresAtMs = this.now() + Math.max(1_000, this.ttlMs);
    const record: ConfirmationRecord = {
      token,
      projectId,
      environmentInstanceId,
      operation,
      ...(service ? { service } : {}),
      expiresAt: new Date(expiresAtMs).toISOString(),
      expiresAtMs,
    };
    this.confirmations.set(token, record);
    this.pruneOverflow();
    return this.publicRecord(record);
  }

  public consume(
    token: string,
    projectId: string,
    environmentInstanceId: string,
    operation: DockerComposeLifecycleOperation,
    service?: string,
  ): void {
    const record = this.confirmations.get(token);
    if (!record) {
      throw new DockerComposeLifecycleConfirmationError(
        'COMPOSE_CONFIRMATION_INVALID',
        'Confirmação Docker Compose inválida ou já utilizada.',
      );
    }
    this.confirmations.delete(token);

    if (record.expiresAtMs <= this.now()) {
      throw new DockerComposeLifecycleConfirmationError(
        'COMPOSE_CONFIRMATION_EXPIRED',
        'A confirmação Docker Compose expirou.',
      );
    }

    if (
      record.projectId !== projectId ||
      record.environmentInstanceId !== environmentInstanceId ||
      record.operation !== operation ||
      record.service !== service
    ) {
      throw new DockerComposeLifecycleConfirmationError(
        'COMPOSE_CONFIRMATION_INVALID',
        'A confirmação Docker Compose não corresponde à operação solicitada.',
      );
    }
  }

  private prune(): void {
    const now = this.now();
    for (const [token, record] of this.confirmations) {
      if (record.expiresAtMs <= now) this.confirmations.delete(token);
    }
  }

  private pruneOverflow(): void {
    while (this.confirmations.size > MAX_CONFIRMATIONS) {
      const oldest = this.confirmations.keys().next().value as
        string | undefined;
      if (!oldest) break;
      this.confirmations.delete(oldest);
    }
  }

  private publicRecord(
    record: ConfirmationRecord,
  ): DockerComposeLifecycleConfirmation {
    return {
      token: record.token,
      projectId: record.projectId,
      environmentInstanceId: record.environmentInstanceId,
      operation: record.operation,
      ...(record.service ? { service: record.service } : {}),
      expiresAt: record.expiresAt,
    };
  }
}
