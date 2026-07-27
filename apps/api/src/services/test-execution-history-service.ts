import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import type {
  ManagedProcess,
  TestExecutionHistory,
  TestExecutionRecord,
  TestExecutionStatus,
} from '@dev-dashboard/contracts';
import type { ProcessManager } from '@dev-dashboard/process-manager';

const HISTORY_VERSION = 1;
const DEFAULT_HISTORY_LIMIT = 50;
const OPEN_STATUSES: readonly TestExecutionStatus[] = ['starting', 'running', 'stopping'];
const FILE_SUFFIX = ':file';

interface StoredHistory { version: 1; items: TestExecutionRecord[] }

function isValidRecord(value: unknown): value is TestExecutionRecord {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' && item.id.length > 0 &&
    typeof item.projectId === 'string' && item.projectId.length > 0 &&
    typeof item.commandId === 'string' && item.commandId.length > 0 &&
    (item.targetFile === undefined || typeof item.targetFile === 'string') &&
    ['starting', 'running', 'stopping', 'stopped', 'failed'].includes(String(item.status)) &&
    typeof item.startedAt === 'string' && Number.isFinite(Date.parse(item.startedAt)) &&
    (item.finishedAt === undefined || (typeof item.finishedAt === 'string' && Number.isFinite(Date.parse(item.finishedAt)))) &&
    (item.exitCode === undefined || Number.isInteger(item.exitCode))
  );
}

function deriveTarget(managedProcess: ManagedProcess): { commandId: string; targetFile?: string } {
  const prefix = `${managedProcess.projectId}:${managedProcess.kind}:`;
  const rawId = managedProcess.id.startsWith(prefix)
    ? managedProcess.id.slice(prefix.length)
    : managedProcess.id;

  if (!rawId.endsWith(FILE_SUFFIX)) {
    return { commandId: rawId };
  }
  const commandId = rawId.slice(0, -FILE_SUFFIX.length);
  const args = managedProcess.args ?? [];
  const targetFile = args[args.length - 1];
  return { commandId, ...(targetFile ? { targetFile } : {}) };
}

function sanitizeProjectId(projectId: string): string {
  return projectId.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export class TestExecutionHistoryService {
  private readonly stateDirectory: string;
  private readonly historyLimit: number;

  public constructor(
    private readonly processManager: Pick<ProcessManager, 'getTestProcess'>,
    stateDirectory = process.env.DEV_DASHBOARD_STATE_DIR?.trim() || path.join(homedir(), '.local', 'state', 'dev-dashboard'),
    historyLimit = DEFAULT_HISTORY_LIMIT,
  ) {
    this.stateDirectory = path.resolve(stateDirectory, 'tests-history');
    this.historyLimit = historyLimit;
  }

  public async reconcile(projectId: string): Promise<void> {
    const items = await this.load(projectId);
    const openIndex = items.findIndex((item) => OPEN_STATUSES.includes(item.status));
    if (openIndex === -1) return;

    const current = await this.processManager.getTestProcess(projectId);
    const openRecord = items[openIndex]!;

    if (!current) {
      items[openIndex] = { ...openRecord, status: 'failed', finishedAt: new Date().toISOString() };
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
      ...(current.stoppedAt ? { finishedAt: current.stoppedAt } : { finishedAt: new Date().toISOString() }),
      ...(current.exitCode !== undefined ? { exitCode: current.exitCode } : {}),
    };
    await this.save(projectId, items);
  }

  public async recordStart(projectId: string, managedProcess: ManagedProcess): Promise<void> {
    const items = await this.load(projectId);
    const { commandId, targetFile } = deriveTarget(managedProcess);
    const record: TestExecutionRecord = {
      id: randomUUID(),
      projectId,
      commandId,
      ...(targetFile ? { targetFile } : {}),
      status: managedProcess.status,
      startedAt: managedProcess.startedAt ?? new Date().toISOString(),
    };
    items.unshift(record);
    await this.save(projectId, items.slice(0, this.historyLimit));
  }

  public async history(projectId: string, page = 1, pageSize = 20): Promise<TestExecutionHistory> {
    await this.reconcile(projectId);
    const items = await this.load(projectId);
    const total = items.length;
    return {
      items: items.slice((page - 1) * pageSize, page * pageSize).map((item) => ({ ...item })),
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    };
  }

  private filePath(projectId: string): string {
    return path.join(this.stateDirectory, `${sanitizeProjectId(projectId)}.json`);
  }

  private async load(projectId: string): Promise<TestExecutionRecord[]> {
    try {
      const raw = await readFile(this.filePath(projectId), 'utf8');
      const parsed = JSON.parse(raw) as Partial<StoredHistory>;
      if (parsed.version !== HISTORY_VERSION || !Array.isArray(parsed.items)) return [];
      return parsed.items.filter(isValidRecord);
    } catch {
      return [];
    }
  }

  private async save(projectId: string, items: TestExecutionRecord[]): Promise<void> {
    await mkdir(this.stateDirectory, { recursive: true, mode: 0o700 });
    const target = this.filePath(projectId);
    const temporary = `${target}.${randomUUID()}.tmp`;
    const stored: StoredHistory = { version: HISTORY_VERSION, items: items.slice(0, this.historyLimit) };
    await writeFile(temporary, JSON.stringify(stored), { mode: 0o600 });
    await rename(temporary, target);
  }
}
