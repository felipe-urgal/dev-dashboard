import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type {
  AgentAuthorization,
  AgentCapability,
  AgentEvent,
  AgentEvidence,
} from './contracts.js';
import { AgentTaskLockManager } from './task-lock.js';

const STORE_VERSION = 1;
const DEFAULT_MAX_EVENTS = 200;
const DEFAULT_MAX_EVIDENCE = 100;
const MAX_SUMMARY_CHARS = 4_000;
const MAX_REFERENCE_CHARS = 2_048;

interface PersistedAgentAuditState {
  version: 1;
  taskId: string;
  authorizations: AgentAuthorization[];
  events: AgentEvent[];
  evidence: AgentEvidence[];
}

export interface AgentAuditSnapshot {
  authorizations: AgentAuthorization[];
  events: AgentEvent[];
  evidence: AgentEvidence[];
}

export interface AgentAuditStoreOptions {
  stateDirectory: string;
  maxEvents?: number;
  maxEvidence?: number;
  createEventId?: () => string;
  lockManager?: AgentTaskLockManager;
}

export type AgentAuditStoreErrorCode =
  | 'AGENT_AUDIT_INVALID'
  | 'AGENT_AUDIT_CORRUPT';

export class AgentAuditStoreError extends Error {
  public constructor(
    public readonly code: AgentAuditStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AgentAuditStoreError';
  }
}

const capabilities = new Set<AgentCapability>([
  'workspace:write',
  'git:commit',
  'git:push',
  'github:pull-request',
  'github:merge',
  'deployment:run',
  'release:run',
]);

function auditKey(taskId: string): string {
  return createHash('sha256').update(taskId).digest('hex');
}

function assertIdentity(value: string, label: string): void {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 256 ||
    value.includes('\0')
  ) {
    throw new AgentAuditStoreError(
      'AGENT_AUDIT_INVALID',
      `${label} is invalid.`,
    );
  }
}

function assertTimestamp(value: string, label: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new AgentAuditStoreError(
      'AGENT_AUDIT_INVALID',
      `${label} is invalid.`,
    );
  }
}

function assertSummary(value: string): void {
  if (!value || value.length > MAX_SUMMARY_CHARS) {
    throw new AgentAuditStoreError(
      'AGENT_AUDIT_INVALID',
      'Agent audit summary is invalid.',
    );
  }
}

function isAuthorization(value: unknown, taskId: string): value is AgentAuthorization {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AgentAuthorization>;
  return (
    candidate.taskId === taskId &&
    typeof candidate.capability === 'string' &&
    capabilities.has(candidate.capability as AgentCapability) &&
    typeof candidate.granted === 'boolean' &&
    typeof candidate.observedAt === 'string' &&
    Number.isFinite(Date.parse(candidate.observedAt))
  );
}

function isEvent(value: unknown, taskId: string): value is AgentEvent {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AgentEvent>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    candidate.taskId === taskId &&
    (candidate.executionId === undefined ||
      (typeof candidate.executionId === 'string' &&
        candidate.executionId.length > 0)) &&
    (candidate.type === 'task-state' ||
      candidate.type === 'execution-state' ||
      candidate.type === 'checkpoint' ||
      candidate.type === 'authorization' ||
      candidate.type === 'evidence') &&
    typeof candidate.summary === 'string' &&
    candidate.summary.length > 0 &&
    candidate.summary.length <= MAX_SUMMARY_CHARS &&
    typeof candidate.occurredAt === 'string' &&
    Number.isFinite(Date.parse(candidate.occurredAt))
  );
}

function isEvidence(value: unknown, taskId: string): value is AgentEvidence {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AgentEvidence>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    candidate.taskId === taskId &&
    (candidate.executionId === undefined ||
      (typeof candidate.executionId === 'string' &&
        candidate.executionId.length > 0)) &&
    (candidate.kind === 'diff' ||
      candidate.kind === 'test' ||
      candidate.kind === 'log' ||
      candidate.kind === 'commit' ||
      candidate.kind === 'pull-request' ||
      candidate.kind === 'readiness' ||
      candidate.kind === 'other') &&
    typeof candidate.summary === 'string' &&
    candidate.summary.length > 0 &&
    candidate.summary.length <= MAX_SUMMARY_CHARS &&
    (candidate.reference === undefined ||
      (typeof candidate.reference === 'string' &&
        candidate.reference.length > 0 &&
        candidate.reference.length <= MAX_REFERENCE_CHARS)) &&
    typeof candidate.observedAt === 'string' &&
    Number.isFinite(Date.parse(candidate.observedAt))
  );
}

function emptyState(taskId: string): PersistedAgentAuditState {
  return {
    version: STORE_VERSION,
    taskId,
    authorizations: [],
    events: [],
    evidence: [],
  };
}

export class AgentAuditStore {
  private readonly maxEvents: number;
  private readonly maxEvidence: number;
  private readonly createEventId: () => string;
  private readonly lockManager: AgentTaskLockManager;

  public constructor(private readonly options: AgentAuditStoreOptions) {
    if (!options.stateDirectory) {
      throw new AgentAuditStoreError(
        'AGENT_AUDIT_INVALID',
        'Agent audit state directory is required.',
      );
    }

    this.maxEvents = options.maxEvents ?? DEFAULT_MAX_EVENTS;
    this.maxEvidence = options.maxEvidence ?? DEFAULT_MAX_EVIDENCE;
    if (
      !Number.isSafeInteger(this.maxEvents) ||
      this.maxEvents <= 0 ||
      !Number.isSafeInteger(this.maxEvidence) ||
      this.maxEvidence <= 0
    ) {
      throw new AgentAuditStoreError(
        'AGENT_AUDIT_INVALID',
        'Agent audit limits are invalid.',
      );
    }

    this.createEventId = options.createEventId ?? randomUUID;
    this.lockManager =
      options.lockManager ??
      new AgentTaskLockManager({ stateDirectory: options.stateDirectory });
  }

  public async snapshot(taskId: string): Promise<AgentAuditSnapshot> {
    assertIdentity(taskId, 'Agent task id');
    const state = await this.read(taskId);
    return {
      authorizations: [...state.authorizations],
      events: [...state.events],
      evidence: [...state.evidence],
    };
  }

  public async listAuthorizations(
    taskId: string,
  ): Promise<AgentAuthorization[]> {
    return (await this.snapshot(taskId)).authorizations;
  }

  public async setAuthorization(
    taskId: string,
    capability: AgentCapability,
    granted: boolean,
    observedAt: string,
  ): Promise<AgentAuthorization> {
    assertIdentity(taskId, 'Agent task id');
    assertTimestamp(observedAt, 'Agent authorization timestamp');
    if (!capabilities.has(capability)) {
      throw new AgentAuditStoreError(
        'AGENT_AUDIT_INVALID',
        'Agent capability is invalid.',
      );
    }

    return this.mutate(taskId, async (state) => {
      const authorization: AgentAuthorization = {
        taskId,
        capability,
        granted,
        observedAt,
      };
      state.authorizations = [
        ...state.authorizations.filter(
          (current) => current.capability !== capability,
        ),
        authorization,
      ].sort((left, right) =>
        left.capability.localeCompare(right.capability),
      );

      state.events.push({
        id: this.requireEventId(),
        taskId,
        type: 'authorization',
        summary: `Capability ${capability} ${granted ? 'granted' : 'revoked'}.`,
        occurredAt: observedAt,
      });
      state.events = state.events.slice(-this.maxEvents);
      return authorization;
    });
  }

  public async appendExecutionResult(
    taskId: string,
    executionId: string,
    summary: string,
    occurredAt: string,
    evidence: readonly AgentEvidence[],
  ): Promise<void> {
    assertIdentity(taskId, 'Agent task id');
    assertIdentity(executionId, 'Agent execution id');
    assertSummary(summary);
    assertTimestamp(occurredAt, 'Agent execution event timestamp');

    await this.mutate(taskId, async (state) => {
      const normalizedEvidence = evidence.map((item) => {
        if (!isEvidence(item, taskId) || item.executionId !== executionId) {
          throw new AgentAuditStoreError(
            'AGENT_AUDIT_INVALID',
            'Agent evidence ownership is invalid.',
          );
        }
        return item;
      });

      state.events.push({
        id: this.requireEventId(),
        taskId,
        executionId,
        type: 'execution-state',
        summary,
        occurredAt,
      });

      for (const item of normalizedEvidence) {
        state.evidence.push(item);
        state.events.push({
          id: this.requireEventId(),
          taskId,
          executionId,
          type: 'evidence',
          summary: item.summary,
          occurredAt: item.observedAt,
        });
      }

      state.events = state.events.slice(-this.maxEvents);
      state.evidence = state.evidence.slice(-this.maxEvidence);
    });
  }

  private directory(): string {
    return path.join(this.options.stateDirectory, 'audit');
  }

  private pathFor(taskId: string): string {
    return path.join(this.directory(), `${auditKey(taskId)}.json`);
  }

  private lockKey(taskId: string): string {
    return `audit-${auditKey(taskId)}`;
  }

  private async mutate<T>(
    taskId: string,
    mutation: (state: PersistedAgentAuditState) => Promise<T> | T,
  ): Promise<T> {
    const release = await this.lockManager.acquire(this.lockKey(taskId), {
      wait: true,
    });
    try {
      const state = await this.read(taskId);
      const result = await mutation(state);
      await this.write(state);
      return result;
    } finally {
      await release();
    }
  }

  private async read(taskId: string): Promise<PersistedAgentAuditState> {
    let serialized: string;
    try {
      serialized = await fs.readFile(this.pathFor(taskId), 'utf8');
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: unknown }).code === 'ENOENT'
      ) {
        return emptyState(taskId);
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized);
    } catch {
      throw new AgentAuditStoreError(
        'AGENT_AUDIT_CORRUPT',
        'Agent audit state is not valid JSON.',
      );
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new AgentAuditStoreError(
        'AGENT_AUDIT_CORRUPT',
        'Agent audit state is invalid.',
      );
    }

    const candidate = parsed as Partial<PersistedAgentAuditState>;
    if (
      candidate.version !== STORE_VERSION ||
      candidate.taskId !== taskId ||
      !Array.isArray(candidate.authorizations) ||
      !candidate.authorizations.every((item) => isAuthorization(item, taskId)) ||
      !Array.isArray(candidate.events) ||
      !candidate.events.every((item) => isEvent(item, taskId)) ||
      !Array.isArray(candidate.evidence) ||
      !candidate.evidence.every((item) => isEvidence(item, taskId))
    ) {
      throw new AgentAuditStoreError(
        'AGENT_AUDIT_CORRUPT',
        'Agent audit state is invalid.',
      );
    }

    return {
      version: STORE_VERSION,
      taskId,
      authorizations: candidate.authorizations,
      events: candidate.events.slice(-this.maxEvents),
      evidence: candidate.evidence.slice(-this.maxEvidence),
    };
  }

  private async write(state: PersistedAgentAuditState): Promise<void> {
    const directory = this.directory();
    const target = this.pathFor(state.taskId);
    const temporary = `${target}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;

    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    try {
      await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
      await fs.rename(temporary, target);
      await fs.chmod(target, 0o600);
    } finally {
      await fs.unlink(temporary).catch((error: unknown) => {
        if (
          !(
            error &&
            typeof error === 'object' &&
            'code' in error &&
            (error as { code?: unknown }).code === 'ENOENT'
          )
        ) {
          throw error;
        }
      });
    }
  }

  private requireEventId(): string {
    const id = this.createEventId().trim();
    if (!id) {
      throw new AgentAuditStoreError(
        'AGENT_AUDIT_INVALID',
        'Agent audit event identity is invalid.',
      );
    }
    return id;
  }
}
