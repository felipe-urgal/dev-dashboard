import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import type {
  ManagedProcess,
  TestExecutionEvent,
  TestExecutionHistory,
  TestExecutionRecord,
  TestExecutionScope,
  TestExecutionStatus,
} from '@dev-dashboard/contracts';
import type { ProcessManager } from '@dev-dashboard/process-manager';

import { captureTestExecutionGitIdentity } from './test-execution-identity.js';

const HISTORY_VERSION = 3;
const DEFAULT_HISTORY_LIMIT = 50;
const OPEN_STATUSES: readonly TestExecutionStatus[] = [
  'starting',
  'running',
  'stopping',
];
const FILE_SUFFIX = ':file';
const NAME_PATTERN_FLAGS = new Set(['-t', '--test-name-pattern']);

const SUBSCRIBER_LIMIT_PER_PROJECT = 5;
const SUBSCRIBER_LIMIT_TOTAL = 20;
const POLL_INTERVAL_MS = 500;

export type TestExecutionSubscriptionErrorCode =
  'TEST_EXECUTION_NOT_FOUND' | 'TEST_EXECUTION_SUBSCRIBER_LIMIT';

export class TestExecutionSubscriptionError extends Error {
  public constructor(
    public readonly code: TestExecutionSubscriptionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TestExecutionSubscriptionError';
  }
}

export interface TestExecutionSubscriber {
  send: (event: TestExecutionEvent) => void;
  close: () => void;
}

type ScopedTestExecutionRecord = Omit<TestExecutionRecord, 'scope'> & {
  scope: TestExecutionScope;
};

type StoredTestExecutionRecord = Omit<ScopedTestExecutionRecord, 'scope'> & {
  scope?: TestExecutionScope;
};

interface StoredHistory {
  version: 1 | 2 | 3;
  items: StoredTestExecutionRecord[];
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isValidRecord(value: unknown): value is StoredTestExecutionRecord {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    item.id.length > 0 &&
    typeof item.projectId === 'string' &&
    item.projectId.length > 0 &&
    typeof item.commandId === 'string' &&
    item.commandId.length > 0 &&
    (item.scope === undefined ||
      item.scope === 'full-suite' ||
      item.scope === 'targeted') &&
    isOptionalString(item.targetFile) &&
    isOptionalString(item.gitRevision) &&
    isOptionalString(item.gitDirtyFingerprint) &&
    isOptionalString(item.environmentInstanceId) &&
    ['starting', 'running', 'stopping', 'stopped', 'failed'].includes(
      String(item.status),
    ) &&
    typeof item.startedAt === 'string' &&
    Number.isFinite(Date.parse(item.startedAt)) &&
    (item.finishedAt === undefined ||
      (typeof item.finishedAt === 'string' &&
        Number.isFinite(Date.parse(item.finishedAt)))) &&
    (item.exitCode === undefined || Number.isInteger(item.exitCode))
  );
}

function normalizeRecord(
  record: StoredTestExecutionRecord,
): ScopedTestExecutionRecord {
  return {
    ...record,
    scope: record.scope ?? (record.targetFile ? 'targeted' : 'full-suite'),
  };
}

function deriveTargetFile(args: readonly string[]): string | undefined {
  if (args.length === 0) return undefined;

  const penultimate = args.at(-2);
  return penultimate && NAME_PATTERN_FLAGS.has(penultimate)
    ? args.at(-3)
    : args.at(-1);
}

function deriveTarget(managedProcess: ManagedProcess): {
  commandId: string;
  scope: TestExecutionScope;
  targetFile?: string;
} {
  const prefix = `${managedProcess.projectId}:${managedProcess.kind}:`;
  const rawId = managedProcess.id.startsWith(prefix)
    ? managedProcess.id.slice(prefix.length)
    : managedProcess.id;

  if (!rawId.endsWith(FILE_SUFFIX)) {
    return { commandId: rawId, scope: 'full-suite' };
  }

  const commandId = rawId.slice(0, -FILE_SUFFIX.length);
  const targetFile = deriveTargetFile(managedProcess.args ?? []);
  return {
    commandId,
    scope: 'targeted',
    ...(targetFile ? { targetFile } : {}),
  };
}

function sanitizeProjectId(projectId: string): string {
  return projectId.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export class TestExecutionHistoryService {
  private readonly stateDirectory: string;
  private readonly historyLimit: number;
  private readonly subscribers = new Map<
    string,
    Set<TestExecutionSubscriber>
  >();
  private readonly pollTimers = new Map<string, NodeJS.Timeout>();
  private readonly lastSentStatus = new Map<string, TestExecutionStatus>();
  private readonly lastSentLog = new Map<string, string>();

  public constructor(
    private readonly processManager: Pick<
      ProcessManager,
      'getTestProcess' | 'readTestLog'
    >,
    stateDirectory = process.env.DEV_DASHBOARD_STATE_DIR?.trim() ||
      path.join(homedir(), '.local', 'state', 'dev-dashboard'),
    historyLimit = readHistoryLimit(),
  ) {
    this.stateDirectory = path.resolve(stateDirectory, 'tests-history');
    this.historyLimit = historyLimit;
  }

  public close(): void {
    for (const timer of this.pollTimers.values()) clearInterval(timer);
    this.pollTimers.clear();
    for (const subscribers of this.subscribers.values()) {
      for (const subscriber of subscribers) subscriber.close();
    }
    this.subscribers.clear();
    this.lastSentStatus.clear();
    this.lastSentLog.clear();
  }

  public async subscribe(
    projectId: string,
    subscriber: TestExecutionSubscriber,
  ): Promise<() => void> {
    const current = await this.processManager.getTestProcess(projectId);
    if (!current) {
      throw new TestExecutionSubscriptionError(
        'TEST_EXECUTION_NOT_FOUND',
        'Não há execução de teste em andamento para este projeto.',
      );
    }

    const projectSubscribers =
      this.subscribers.get(projectId) ?? new Set<TestExecutionSubscriber>();
    const totalSubscribers = Array.from(this.subscribers.values()).reduce(
      (sum, set) => sum + set.size,
      0,
    );
    if (
      projectSubscribers.size >= SUBSCRIBER_LIMIT_PER_PROJECT ||
      totalSubscribers >= SUBSCRIBER_LIMIT_TOTAL
    ) {
      throw new TestExecutionSubscriptionError(
        'TEST_EXECUTION_SUBSCRIBER_LIMIT',
        'O limite de acompanhamentos simultâneos foi atingido.',
      );
    }
    projectSubscribers.add(subscriber);
    this.subscribers.set(projectId, projectSubscribers);

    subscriber.send({ type: 'state', process: current });
    this.lastSentStatus.set(projectId, current.status);
    const log = await this.processManager
      .readTestLog(projectId)
      .catch(() => null);
    if (log) {
      subscriber.send({ type: 'log', log });
      this.lastSentLog.set(projectId, log.content);
    }

    this.ensurePolling(projectId);

    return () => {
      const set = this.subscribers.get(projectId);
      if (!set?.delete(subscriber)) return;
      if (set.size === 0) {
        this.subscribers.delete(projectId);
        this.stopPolling(projectId);
      }
    };
  }

  private ensurePolling(projectId: string): void {
    if (this.pollTimers.has(projectId)) return;
    // Sem unref(): a assinatura precisa manter o laço de eventos vivo enquanto
    // houver acompanhamento ativo (o listener HTTP do servidor já cumpre esse
    // papel em produção, mas a chamada explícita evita depender disso).
    const timer = setInterval(() => {
      void this.pollOnce(projectId);
    }, POLL_INTERVAL_MS);
    this.pollTimers.set(projectId, timer);
  }

  private stopPolling(projectId: string): void {
    const timer = this.pollTimers.get(projectId);
    if (timer) clearInterval(timer);
    this.pollTimers.delete(projectId);
    this.lastSentStatus.delete(projectId);
    this.lastSentLog.delete(projectId);
  }

  private emitToSubscribers(
    projectId: string,
    event: TestExecutionEvent,
  ): void {
    for (const subscriber of this.subscribers.get(projectId) ?? [])
      subscriber.send(event);
  }

  private closeSubscribers(projectId: string): void {
    const subscribers = this.subscribers.get(projectId);
    this.stopPolling(projectId);
    this.subscribers.delete(projectId);
    if (subscribers) {
      for (const subscriber of subscribers) subscriber.close();
    }
  }

  private async pollOnce(projectId: string): Promise<void> {
    const subscribers = this.subscribers.get(projectId);
    if (!subscribers || subscribers.size === 0) {
      this.stopPolling(projectId);
      return;
    }

    const current = await this.processManager
      .getTestProcess(projectId)
      .catch(() => null);
    if (!current) {
      await this.reconcile(projectId);
      this.closeSubscribers(projectId);
      return;
    }

    if (this.lastSentStatus.get(projectId) !== current.status) {
      this.lastSentStatus.set(projectId, current.status);
      this.emitToSubscribers(projectId, { type: 'state', process: current });
    }

    const log = await this.processManager
      .readTestLog(projectId)
      .catch(() => null);
    if (log && log.content !== this.lastSentLog.get(projectId)) {
      this.lastSentLog.set(projectId, log.content);
      this.emitToSubscribers(projectId, { type: 'log', log });
    }

    if (!OPEN_STATUSES.includes(current.status)) {
      await this.reconcile(projectId);
      this.closeSubscribers(projectId);
    }
  }

  public async reconcile(projectId: string): Promise<void> {
    const items = await this.load(projectId);
    const openIndex = items.findIndex((item) =>
      OPEN_STATUSES.includes(item.status),
    );
    if (openIndex === -1) return;

    const current = await this.processManager.getTestProcess(projectId);
    const openRecord = items[openIndex]!;

    if (!current) {
      items[openIndex] = {
        ...openRecord,
        status: 'failed',
        finishedAt: new Date().toISOString(),
      };
      await this.save(projectId, items);
      return;
    }

    if (OPEN_STATUSES.includes(current.status)) {
      if (current.status === openRecord.status) return;
      items[openIndex] = { ...openRecord, status: current.status };
      await this.save(projectId, items);
      return;
    }

    items[openIndex] = {
      ...openRecord,
      status: current.status,
      ...(current.stoppedAt
        ? { finishedAt: current.stoppedAt }
        : { finishedAt: new Date().toISOString() }),
      ...(current.exitCode !== undefined ? { exitCode: current.exitCode } : {}),
    };
    await this.save(projectId, items);
  }

  public async recordStart(
    projectId: string,
    managedProcess: ManagedProcess,
  ): Promise<void> {
    const items = await this.load(projectId);
    const { commandId, scope, targetFile } = deriveTarget(managedProcess);
    const gitIdentity = await captureTestExecutionGitIdentity(managedProcess.cwd);
    const record: ScopedTestExecutionRecord = {
      id: randomUUID(),
      projectId,
      commandId,
      scope,
      ...(targetFile ? { targetFile } : {}),
      ...gitIdentity,
      status: managedProcess.status,
      startedAt: managedProcess.startedAt ?? new Date().toISOString(),
    };
    items.unshift(record);
    await this.save(projectId, items.slice(0, this.historyLimit));
  }

  public async history(
    projectId: string,
    page = 1,
    pageSize = 20,
  ): Promise<TestExecutionHistory> {
    await this.reconcile(projectId);
    const items = await this.load(projectId);
    const total = items.length;
    return {
      items: items
        .slice((page - 1) * pageSize, page * pageSize)
        .map((item) => ({ ...item })),
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    };
  }

  public async clear(projectId: string): Promise<{ removedCount: number }> {
    await this.reconcile(projectId);
    const items = await this.load(projectId);
    const kept = items.filter((item) => OPEN_STATUSES.includes(item.status));
    const removedCount = items.length - kept.length;
    if (removedCount > 0) await this.save(projectId, kept);
    return { removedCount };
  }

  private filePath(projectId: string): string {
    return path.join(
      this.stateDirectory,
      `${sanitizeProjectId(projectId)}.json`,
    );
  }

  private async load(projectId: string): Promise<ScopedTestExecutionRecord[]> {
    try {
      const raw = await readFile(this.filePath(projectId), 'utf8');
      const parsed = JSON.parse(raw) as Partial<StoredHistory>;
      if (
        (![1, 2, HISTORY_VERSION] as const).includes(
          parsed.version as 1 | 2 | 3,
        ) ||
        !Array.isArray(parsed.items)
      ) {
        return [];
      }
      return parsed.items.filter(isValidRecord).map(normalizeRecord);
    } catch {
      return [];
    }
  }

  private async save(
    projectId: string,
    items: ScopedTestExecutionRecord[],
  ): Promise<void> {
    await mkdir(this.stateDirectory, { recursive: true, mode: 0o700 });
    const target = this.filePath(projectId);
    const temporary = `${target}.${randomUUID()}.tmp`;
    const stored: StoredHistory = {
      version: HISTORY_VERSION,
      items: items.slice(0, this.historyLimit),
    };
    await writeFile(temporary, JSON.stringify(stored), { mode: 0o600 });
    await rename(temporary, target);
  }
}

function readHistoryLimit(): number {
  const parsed = Number.parseInt(
    process.env.DEV_DASHBOARD_TEST_HISTORY_LIMIT ?? '',
    10,
  );
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_HISTORY_LIMIT;
}
