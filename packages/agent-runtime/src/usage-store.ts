import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { AgentConcreteProviderId, AgentUsage } from './contracts.js';
import { AgentTaskLockManager } from './task-lock.js';

const STORE_VERSION = 1;
const DEFAULT_MAX_RECORDS = 1_000;
const MAX_ID_CHARS = 256;
const MAX_MODEL_CHARS = 256;

export interface AgentUsageRecord {
  executionId: string;
  taskId: string;
  projectId: string;
  providerId: AgentConcreteProviderId;
  observedAt: string;
  usage: AgentUsage;
}

export interface AgentUsageSummary {
  executionCount: number;
  inputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteInputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  reportedCostUsd?: number;
  estimatedCostUsd?: number;
  durationMs?: number;
}

export interface AgentUsageQuery {
  projectId?: string;
  taskId?: string;
  providerId?: AgentConcreteProviderId;
  observedFrom?: string;
  observedTo?: string;
}

interface PersistedAgentUsageState {
  version: 1;
  records: AgentUsageRecord[];
}

export interface AgentUsageStoreOptions {
  stateDirectory: string;
  maxRecords?: number;
  lockManager?: AgentTaskLockManager;
}

export type AgentUsageStoreErrorCode =
  'AGENT_USAGE_INVALID' | 'AGENT_USAGE_CORRUPT' | 'AGENT_USAGE_CONFLICT';

export class AgentUsageStoreError extends Error {
  public constructor(
    public readonly code: AgentUsageStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AgentUsageStoreError';
  }
}

function assertIdentity(value: string, label: string): void {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_ID_CHARS ||
    value.includes('\0')
  ) {
    throw new AgentUsageStoreError(
      'AGENT_USAGE_INVALID',
      `${label} is invalid.`,
    );
  }
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function nonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isProviderId(value: unknown): value is AgentConcreteProviderId {
  return (
    value === 'codex' || value === 'claude-code' || value === 'chatgpt-browser'
  );
}

function isUsage(
  value: unknown,
  providerId: AgentConcreteProviderId,
): value is AgentUsage {
  if (!value || typeof value !== 'object') return false;
  const usage = value as Partial<AgentUsage>;

  if (usage.providerId !== providerId) return false;
  if (
    usage.source !== 'provider' &&
    usage.source !== 'estimated' &&
    usage.source !== 'mixed' &&
    usage.source !== 'unavailable'
  ) {
    return false;
  }

  if (
    usage.model !== undefined &&
    (typeof usage.model !== 'string' ||
      usage.model.length === 0 ||
      usage.model.length > MAX_MODEL_CHARS)
  ) {
    return false;
  }

  for (const counter of [
    usage.inputTokens,
    usage.cachedInputTokens,
    usage.cacheWriteInputTokens,
    usage.outputTokens,
    usage.reasoningTokens,
    usage.totalTokens,
    usage.durationMs,
  ]) {
    if (counter !== undefined && !nonNegativeInteger(counter)) return false;
  }

  if (usage.reportedCost !== undefined) {
    if (
      !nonNegativeNumber(usage.reportedCost.amount) ||
      usage.reportedCost.currency !== 'USD'
    ) {
      return false;
    }
  }

  if (usage.estimatedCost !== undefined) {
    if (
      !nonNegativeNumber(usage.estimatedCost.amount) ||
      usage.estimatedCost.currency !== 'USD' ||
      typeof usage.estimatedCost.pricingVersion !== 'string' ||
      usage.estimatedCost.pricingVersion.length === 0 ||
      usage.estimatedCost.pricingVersion.length > 128
    ) {
      return false;
    }
  }

  return true;
}

function isRecord(value: unknown): value is AgentUsageRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<AgentUsageRecord>;
  return (
    typeof record.executionId === 'string' &&
    record.executionId.length > 0 &&
    record.executionId.length <= MAX_ID_CHARS &&
    typeof record.taskId === 'string' &&
    record.taskId.length > 0 &&
    record.taskId.length <= MAX_ID_CHARS &&
    typeof record.projectId === 'string' &&
    record.projectId.length > 0 &&
    record.projectId.length <= MAX_ID_CHARS &&
    isProviderId(record.providerId) &&
    typeof record.observedAt === 'string' &&
    Number.isFinite(Date.parse(record.observedAt)) &&
    isUsage(record.usage, record.providerId)
  );
}

function emptyState(): PersistedAgentUsageState {
  return { version: STORE_VERSION, records: [] };
}

function metricTotal(
  records: readonly AgentUsageRecord[],
  select: (usage: AgentUsage) => number | undefined,
): number | undefined {
  let seen = false;
  let total = 0;
  for (const record of records) {
    const value = select(record.usage);
    if (value === undefined) continue;
    seen = true;
    total += value;
  }
  return seen ? total : undefined;
}

export class AgentUsageStore {
  private readonly maxRecords: number;
  private readonly filePath: string;
  private readonly lockManager: AgentTaskLockManager;

  public constructor(private readonly options: AgentUsageStoreOptions) {
    if (!options.stateDirectory) {
      throw new AgentUsageStoreError(
        'AGENT_USAGE_INVALID',
        'Agent usage state directory is required.',
      );
    }
    this.maxRecords = options.maxRecords ?? DEFAULT_MAX_RECORDS;
    if (!Number.isSafeInteger(this.maxRecords) || this.maxRecords <= 0) {
      throw new AgentUsageStoreError(
        'AGENT_USAGE_INVALID',
        'Agent usage retention limit is invalid.',
      );
    }

    this.filePath = path.join(options.stateDirectory, 'usage', 'usage.json');
    this.lockManager =
      options.lockManager ??
      new AgentTaskLockManager({ stateDirectory: options.stateDirectory });
  }

  public async append(record: AgentUsageRecord): Promise<AgentUsageRecord> {
    this.assertRecord(record);
    const release = await this.lockManager.acquire('agent-usage-store');
    try {
      const state = await this.readState();
      const existing = state.records.find(
        (item) => item.executionId === record.executionId,
      );
      if (existing) {
        if (JSON.stringify(existing) !== JSON.stringify(record)) {
          throw new AgentUsageStoreError(
            'AGENT_USAGE_CONFLICT',
            'Agent usage execution already exists with different data.',
          );
        }
        return structuredClone(existing);
      }

      state.records.push(structuredClone(record));
      if (state.records.length > this.maxRecords) {
        state.records.splice(0, state.records.length - this.maxRecords);
      }
      await this.writeState(state);
      return structuredClone(record);
    } finally {
      await release();
    }
  }

  public async list(query: AgentUsageQuery = {}): Promise<AgentUsageRecord[]> {
    if (query.projectId !== undefined) {
      assertIdentity(query.projectId, 'Agent usage project id');
    }
    if (query.taskId !== undefined) {
      assertIdentity(query.taskId, 'Agent usage task id');
    }
    if (query.providerId !== undefined && !isProviderId(query.providerId)) {
      throw new AgentUsageStoreError(
        'AGENT_USAGE_INVALID',
        'Agent usage provider id is invalid.',
      );
    }
    const observedFrom =
      query.observedFrom !== undefined ? Date.parse(query.observedFrom) : null;
    const observedTo =
      query.observedTo !== undefined ? Date.parse(query.observedTo) : null;
    if (
      (observedFrom !== null && !Number.isFinite(observedFrom)) ||
      (observedTo !== null && !Number.isFinite(observedTo)) ||
      (observedFrom !== null &&
        observedTo !== null &&
        observedFrom > observedTo)
    ) {
      throw new AgentUsageStoreError(
        'AGENT_USAGE_INVALID',
        'Agent usage observation range is invalid.',
      );
    }

    const state = await this.readState();
    return state.records
      .filter(
        (record) =>
          (query.projectId === undefined ||
            record.projectId === query.projectId) &&
          (query.taskId === undefined || record.taskId === query.taskId) &&
          (query.providerId === undefined ||
            record.providerId === query.providerId) &&
          (observedFrom === null ||
            Date.parse(record.observedAt) >= observedFrom) &&
          (observedTo === null || Date.parse(record.observedAt) <= observedTo),
      )
      .map((record) => structuredClone(record));
  }

  public async summary(
    query: AgentUsageQuery = {},
  ): Promise<AgentUsageSummary> {
    const records = await this.list(query);
    const inputTokens = metricTotal(records, (usage) => usage.inputTokens);
    const cachedInputTokens = metricTotal(
      records,
      (usage) => usage.cachedInputTokens,
    );
    const cacheWriteInputTokens = metricTotal(
      records,
      (usage) => usage.cacheWriteInputTokens,
    );
    const outputTokens = metricTotal(records, (usage) => usage.outputTokens);
    const reasoningTokens = metricTotal(
      records,
      (usage) => usage.reasoningTokens,
    );
    const totalTokens = metricTotal(records, (usage) => usage.totalTokens);
    const reportedCostUsd = metricTotal(
      records,
      (usage) => usage.reportedCost?.amount,
    );
    const estimatedCostUsd = metricTotal(
      records,
      (usage) => usage.estimatedCost?.amount,
    );
    const durationMs = metricTotal(records, (usage) => usage.durationMs);

    return {
      executionCount: records.length,
      ...(inputTokens !== undefined ? { inputTokens } : {}),
      ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
      ...(cacheWriteInputTokens !== undefined ? { cacheWriteInputTokens } : {}),
      ...(outputTokens !== undefined ? { outputTokens } : {}),
      ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
      ...(totalTokens !== undefined ? { totalTokens } : {}),
      ...(reportedCostUsd !== undefined ? { reportedCostUsd } : {}),
      ...(estimatedCostUsd !== undefined ? { estimatedCostUsd } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
    };
  }

  private assertRecord(record: AgentUsageRecord): void {
    assertIdentity(record.executionId, 'Agent usage execution id');
    assertIdentity(record.taskId, 'Agent usage task id');
    assertIdentity(record.projectId, 'Agent usage project id');
    if (
      !isProviderId(record.providerId) ||
      !Number.isFinite(Date.parse(record.observedAt)) ||
      !isUsage(record.usage, record.providerId)
    ) {
      throw new AgentUsageStoreError(
        'AGENT_USAGE_INVALID',
        'Agent usage record is invalid.',
      );
    }
  }

  private async readState(): Promise<PersistedAgentUsageState> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const value: unknown = JSON.parse(raw);
      if (
        !value ||
        typeof value !== 'object' ||
        (value as { version?: unknown }).version !== STORE_VERSION ||
        !Array.isArray((value as { records?: unknown }).records) ||
        !(value as { records: unknown[] }).records.every(isRecord)
      ) {
        throw new Error('invalid state');
      }
      return value as PersistedAgentUsageState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return emptyState();
      }
      if (error instanceof AgentUsageStoreError) throw error;
      throw new AgentUsageStoreError(
        'AGENT_USAGE_CORRUPT',
        'Agent usage state is corrupt.',
      );
    }
  }

  private async writeState(state: PersistedAgentUsageState): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), {
      recursive: true,
      mode: 0o700,
    });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(state), {
      encoding: 'utf8',
      mode: 0o600,
    });
    await fs.rename(tempPath, this.filePath);
  }
}
