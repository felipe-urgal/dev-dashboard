import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { access, mkdir, open, readFile, readdir, readlink, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import type {
  Project,
  ProjectScript,
  ScriptExecution,
  ScriptExecutionConfirmation,
  ScriptExecutionLog,
  ScriptExecutionHistory,
} from '@dev-dashboard/contracts';
import { maskSensitiveLogContent } from '@dev-dashboard/process-manager';

import type { ScriptDetectionService } from './script-detection-service.js';

export type ScriptExecutionErrorCode =
  | 'SCRIPT_NOT_FOUND'
  | 'SCRIPT_DISABLED'
  | 'SCRIPT_CONFIRMATION_REQUIRED'
  | 'SCRIPT_ALREADY_RUNNING'
  | 'SCRIPT_EXECUTION_NOT_FOUND'
  | 'SCRIPT_MANAGER_AMBIGUOUS'
  | 'SCRIPT_MANAGER_NOT_FOUND';

export class ScriptExecutionError extends Error {
  public constructor(
    public readonly code: ScriptExecutionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ScriptExecutionError';
  }
}

interface RunningExecution {
  execution: ScriptExecution;
  projectPath: string;
  logPath: string;
  child?: ChildProcess;
}

interface StoredConfirmation extends ScriptExecutionConfirmation {
  projectId: string;
}

type NodeManager = 'npm' | 'pnpm' | 'yarn';

const LOG_LIMIT = 262_144;
const CONFIRMATION_TTL_MS = 60_000;
const HISTORY_VERSION = 1;
const DEFAULT_HISTORY_LIMIT = 200;
const DEFAULT_RETENTION_DAYS = 7;
const MAX_RETENTION_SWEEP_INTERVAL_MS = 3_600_000;
const EXECUTION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface StoredExecution { version: 1; execution: ScriptExecution }

export interface ScriptExecutionServiceOptions {
  historyLimit?: number;
  retentionMs?: number;
  sweepIntervalMs?: number;
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function resolveNodeManager(projectPath: string): Promise<NodeManager> {
  const lockfiles: ReadonlyArray<[NodeManager, string]> = [
    ['npm', 'package-lock.json'],
    ['pnpm', 'pnpm-lock.yaml'],
    ['yarn', 'yarn.lock'],
  ];
  const candidates = (
    await Promise.all(
      lockfiles.map(async ([manager, lockfile]) =>
        (await exists(path.join(projectPath, lockfile))) ? manager : undefined,
      ),
    )
  ).filter((manager): manager is NodeManager => manager !== undefined);

  if (candidates.length > 1) {
    throw new ScriptExecutionError(
      'SCRIPT_MANAGER_AMBIGUOUS',
      'Mais de um lockfile foi encontrado; remova a ambiguidade antes de executar.',
    );
  }
  if (candidates.length === 0) {
    throw new ScriptExecutionError(
      'SCRIPT_MANAGER_NOT_FOUND',
      'Nenhum lockfile npm, pnpm ou Yarn foi encontrado.',
    );
  }
  return candidates[0]!;
}

async function resolveCommand(
  project: Project,
  action: ProjectScript,
): Promise<{ command: string; args: string[] }> {
  const separator = action.id.indexOf(':');
  const origin = action.id.slice(0, separator);
  const name = action.id.slice(separator + 1);

  if (separator < 1 || !name || origin !== action.origin) {
    throw new ScriptExecutionError(
      'SCRIPT_NOT_FOUND',
      'A ação catalogada é inválida.',
    );
  }
  if (origin === 'package-script') {
    return { command: await resolveNodeManager(project.path), args: ['run', name] };
  }
  if (origin === 'rails-task') {
    return { command: path.join(project.path, 'bin', 'rails'), args: [name] };
  }
  if (
    origin === 'bin' &&
    ['rails', 'rake', 'rspec', 'rubocop', 'setup'].includes(name)
  ) {
    return { command: path.join(project.path, 'bin', name), args: [] };
  }
  throw new ScriptExecutionError(
    'SCRIPT_NOT_FOUND',
    'A ação não pertence à allowlist de execução.',
  );
}

function tokensMatch(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

export class ScriptExecutionService {
  private readonly executions = new Map<string, RunningExecution>();
  private readonly activeProjects = new Set<string>();
  private readonly confirmations = new Map<string, StoredConfirmation>();
  private readonly pendingWrites = new Map<string, Promise<void>>();
  private readonly stateDirectory: string;
  private readonly ready: Promise<void>;
  private readonly historyLimit: number;
  private readonly retentionMs: number;
  private readonly retentionTimer: NodeJS.Timeout;

  public constructor(
    private readonly detection: ScriptDetectionService,
    stateDirectory =
      process.env.DEV_DASHBOARD_STATE_DIR?.trim() ||
      path.join(homedir(), '.local', 'state', 'dev-dashboard'),
    options: ScriptExecutionServiceOptions = {},
  ) {
    this.stateDirectory = path.resolve(stateDirectory, 'scripts');
    this.historyLimit = this.positiveOption(options.historyLimit, this.readPositiveInteger(process.env.DEV_DASHBOARD_SCRIPT_HISTORY_LIMIT, DEFAULT_HISTORY_LIMIT));
    this.retentionMs = this.positiveOption(options.retentionMs, this.readPositiveInteger(process.env.DEV_DASHBOARD_LOG_RETENTION_DAYS, DEFAULT_RETENTION_DAYS) * 86_400_000);
    this.ready = this.restore();
    this.retentionTimer = setInterval(() => {
      void this.ready.then(() => this.pruneHistory()).catch(() => undefined);
    }, this.positiveOption(options.sweepIntervalMs, Math.min(this.retentionMs, MAX_RETENTION_SWEEP_INTERVAL_MS)));
    this.retentionTimer.unref();
  }

  public close(): void {
    clearInterval(this.retentionTimer);
  }

  public async prepareConfirmation(
    project: Project,
    actionId: string,
  ): Promise<ScriptExecutionConfirmation> {
    const action = await this.findEnabledAction(project, actionId);
    if (action.risk === 'read-only') {
      throw new ScriptExecutionError(
        'SCRIPT_CONFIRMATION_REQUIRED',
        'Ações somente leitura não precisam de confirmação.',
      );
    }

    const confirmation: StoredConfirmation = {
      token: randomBytes(32).toString('hex'),
      projectId: project.id,
      actionId: action.id,
      expiresAt: new Date(Date.now() + CONFIRMATION_TTL_MS).toISOString(),
    };
    this.confirmations.set(confirmation.token, confirmation);
    return {
      token: confirmation.token,
      actionId: confirmation.actionId,
      expiresAt: confirmation.expiresAt,
    };
  }

  public async start(
    project: Project,
    actionId: string,
    confirmationToken?: string,
  ): Promise<ScriptExecution> {
    await this.ready;
    if (this.activeProjects.has(project.id)) {
      throw new ScriptExecutionError(
        'SCRIPT_ALREADY_RUNNING',
        'Já existe uma ação em execução neste projeto.',
      );
    }
    // A reserva acontece antes do primeiro await para fechar a corrida entre starts concorrentes.
    this.activeProjects.add(project.id);

    try {
      const action = await this.findEnabledAction(project, actionId);
      if (action.risk !== 'read-only') {
        this.consumeConfirmation(project.id, action.id, confirmationToken);
      }
      const resolved = await resolveCommand(project, action);
      return await this.spawnExecution(project, action, resolved);
    } catch (error) {
      this.activeProjects.delete(project.id);
      throw error;
    }
  }

  public async get(projectId: string, executionId: string): Promise<ScriptExecution> {
    await this.ready;
    const record = this.findExecution(projectId, executionId);
    await this.waitForPersistence(executionId);
    return { ...record.execution };
  }

  public async latest(projectId: string): Promise<ScriptExecution | null> {
    await this.ready;
    await this.waitForAllPersistence();
    const records = Array.from(this.executions.values());
    for (let index = records.length - 1; index >= 0; index -= 1) {
      const execution = records[index]?.execution;
      if (execution?.projectId === projectId) return { ...execution };
    }
    return null;
  }

  public async history(projectId: string, page = 1, pageSize = 20): Promise<ScriptExecutionHistory> {
    await this.ready;
    await this.waitForAllPersistence();
    const items = Array.from(this.executions.values())
      .map((record) => record.execution)
      .filter((execution) => execution.projectId === projectId)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
    const total = items.length;
    return {
      items: items.slice((page - 1) * pageSize, page * pageSize).map((item) => ({ ...item })),
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    };
  }

  public async log(
    projectId: string,
    executionId: string,
  ): Promise<ScriptExecutionLog> {
    await this.ready;
    const record = this.findExecution(projectId, executionId);
    const size = (await stat(record.logPath)).size;
    const start = Math.max(0, size - LOG_LIMIT);
    const handle = await open(record.logPath, 'r');
    const buffer = Buffer.alloc(size - start);
    try {
      await handle.read(buffer, 0, buffer.length, start);
    } finally {
      await handle.close();
    }
    let content = buffer.toString('utf8');
    if (start > 0) {
      const firstLineEnd = content.indexOf('\n');
      content = firstLineEnd >= 0 ? content.slice(firstLineEnd + 1) : '';
    }
    const maskedContent = maskSensitiveLogContent(content);
    return {
      executionId,
      content: maskedContent.content,
      truncated: start > 0,
      masked: maskedContent.masked,
      redactionCount: maskedContent.redactionCount,
    };
  }

  public async cancel(
    projectId: string,
    executionId: string,
  ): Promise<ScriptExecution> {
    await this.ready;
    const record = this.findExecution(projectId, executionId);
    if (record.execution.status !== 'running' || !record.child?.pid) {
      return { ...record.execution };
    }
    const actualCwd = await readlink(`/proc/${record.child.pid}/cwd`).catch(
      () => '',
    );
    if (
      process.platform === 'linux' &&
      path.resolve(actualCwd) !== path.resolve(record.projectPath)
    ) {
      throw new ScriptExecutionError(
        'SCRIPT_EXECUTION_NOT_FOUND',
        'A identidade do processo não pôde ser confirmada.',
      );
    }
    this.signal(record, 'SIGTERM');
    setTimeout(() => {
      if (record.execution.status === 'running') {
        this.signal(record, 'SIGKILL');
      }
    }, 3_000).unref();
    return { ...record.execution };
  }

  private async findEnabledAction(
    project: Project,
    actionId: string,
  ): Promise<ProjectScript> {
    const action = await this.detection.findAction(project, actionId);
    if (!action) {
      throw new ScriptExecutionError(
        'SCRIPT_NOT_FOUND',
        'A ação não existe no catálogo atual.',
      );
    }
    if (!action.enabled) {
      throw new ScriptExecutionError(
        'SCRIPT_DISABLED',
        'Ações destrutivas permanecem bloqueadas.',
      );
    }
    return action;
  }

  private consumeConfirmation(
    projectId: string,
    actionId: string,
    receivedToken?: string,
  ): void {
    const stored = receivedToken
      ? this.confirmations.get(receivedToken)
      : undefined;
    if (receivedToken) {
      this.confirmations.delete(receivedToken);
    }
    if (
      !receivedToken ||
      !stored ||
      !tokensMatch(receivedToken, stored.token) ||
      stored.projectId !== projectId ||
      stored.actionId !== actionId ||
      Date.parse(stored.expiresAt) <= Date.now()
    ) {
      throw new ScriptExecutionError(
        'SCRIPT_CONFIRMATION_REQUIRED',
        'Solicite e confirme uma autorização nova para esta ação.',
      );
    }
  }

  private async spawnExecution(
    project: Project,
    action: ProjectScript,
    resolved: { command: string; args: string[] },
  ): Promise<ScriptExecution> {
    await mkdir(this.stateDirectory, { recursive: true, mode: 0o700 });
    const id = randomUUID();
    const logPath = path.join(this.stateDirectory, `${id}.log`);
    const handle = await open(logPath, 'w', 0o600);
    const execution: ScriptExecution = {
      id,
      projectId: project.id,
      actionId: action.id,
      actionName: action.name,
      risk: action.risk,
      status: 'running',
      startedAt: new Date().toISOString(),
    };
    const record: RunningExecution = {
      execution,
      projectPath: project.path,
      logPath,
    };
    this.executions.set(id, record);
    await this.persist(execution);

    try {
      record.child = spawn(resolved.command, resolved.args, {
        cwd: project.path,
        shell: false,
        detached: process.platform !== 'win32',
        stdio: ['ignore', handle.fd, handle.fd],
      });
    } catch (error) {
      execution.status = 'failed';
      execution.finishedAt = new Date().toISOString();
      await this.persist(execution);
      await handle.close();
      throw error;
    }

    const finish = (
      status: ScriptExecution['status'],
      exitCode?: number | null,
    ): void => {
      if (execution.status !== 'running') return;
      execution.status = status;
      execution.finishedAt = new Date().toISOString();
      if (exitCode !== undefined && exitCode !== null) execution.exitCode = exitCode;
      this.activeProjects.delete(project.id);
      void handle.close();
      this.schedulePersistence(execution);
    };
    record.child.once('error', () => finish('failed'));
    record.child.once('close', (code, signal) =>
      finish(signal ? 'cancelled' : code === 0 ? 'succeeded' : 'failed', code),
    );
    return { ...execution };
  }

  private findExecution(projectId: string, executionId: string): RunningExecution {
    const record = this.executions.get(executionId);
    if (!record || record.execution.projectId !== projectId) {
      throw new ScriptExecutionError(
        'SCRIPT_EXECUTION_NOT_FOUND',
        'Execução não encontrada.',
      );
    }
    return record;
  }

  private signal(record: RunningExecution, signal: NodeJS.Signals): void {
    const pid = record.child?.pid;
    if (!pid) return;
    try {
      process.kill(process.platform === 'win32' ? pid : -pid, signal);
    } catch {
      // O processo pode ter encerrado entre a verificação e o sinal.
    }
  }

  private statePath(id: string): string { return path.join(this.stateDirectory, `${id}.json`); }

  private async persist(execution: ScriptExecution): Promise<void> {
    const stored: StoredExecution = {
      version: HISTORY_VERSION,
      execution: { ...execution },
    };
    await mkdir(this.stateDirectory, { recursive: true, mode: 0o700 });
    const target = this.statePath(execution.id);
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(stored), { mode: 0o600 });
    await rename(temporary, target);
  }

  private schedulePersistence(execution: ScriptExecution): void {
    const previous = this.pendingWrites.get(execution.id) ?? Promise.resolve();
    const pending = previous
      .then(() => this.persist(execution))
      .then(() => this.pruneHistory());
    this.pendingWrites.set(execution.id, pending);
    // O erro continua observável pelas leituras, mas não vira rejeição não tratada no listener.
    void pending.catch(() => undefined);
    void pending.finally(() => {
      if (this.pendingWrites.get(execution.id) === pending) {
        this.pendingWrites.delete(execution.id);
      }
    }).catch(() => undefined);
  }

  private async waitForPersistence(executionId: string): Promise<void> {
    await this.pendingWrites.get(executionId);
  }

  private async waitForAllPersistence(): Promise<void> {
    await Promise.all(this.pendingWrites.values());
  }

  private async pruneHistory(): Promise<void> {
    const now = Date.now();
    const terminal = Array.from(this.executions.values())
      .filter((record) => record.execution.status !== 'running')
      .sort((left, right) => right.execution.startedAt.localeCompare(left.execution.startedAt));
    const expired = terminal.filter((record) =>
      now - Date.parse(record.execution.finishedAt ?? record.execution.startedAt) > this.retentionMs,
    );
    const overLimit = terminal.slice(this.historyLimit);
    const removable = new Map(
      [...expired, ...overLimit].map((record) => [record.execution.id, record]),
    );
    for (const record of removable.values()) {
      this.executions.delete(record.execution.id);
      await this.removeStored(record.execution.id);
    }
  }

  private async restore(): Promise<void> {
    await mkdir(this.stateDirectory, { recursive: true, mode: 0o700 });
    const names = await readdir(this.stateDirectory).catch(() => [] as string[]);
    const restored: ScriptExecution[] = [];
    for (const name of names.filter((item) => EXECUTION_ID_PATTERN.test(item.slice(0, -5)) && item.endsWith('.json'))) {
      try {
        const parsed = JSON.parse(await readFile(path.join(this.stateDirectory, name), 'utf8')) as Partial<StoredExecution>;
        const execution = parsed.execution;
        if (parsed.version !== HISTORY_VERSION || !this.validExecution(execution) || name !== `${execution.id}.json`) continue;
        if (Date.now() - Date.parse(execution.finishedAt ?? execution.startedAt) > this.retentionMs) {
          await this.removeStored(execution.id); continue;
        }
        if (execution.status === 'running') {
          execution.status = 'failed';
          execution.finishedAt = new Date().toISOString();
          await this.persist(execution);
        }
        restored.push(execution);
      } catch { /* Um registro corrompido não impede a recuperação dos demais. */ }
    }
    restored.sort((left, right) => left.startedAt.localeCompare(right.startedAt));
    const kept = restored.slice(-this.historyLimit);
    for (const execution of restored.slice(0, -this.historyLimit)) await this.removeStored(execution.id);
    for (const execution of kept) this.executions.set(execution.id, { execution, projectPath: '', logPath: path.join(this.stateDirectory, `${execution.id}.log`) });
  }

  private async removeStored(id: string): Promise<void> {
    await Promise.all([rm(this.statePath(id), { force: true }), rm(path.join(this.stateDirectory, `${id}.log`), { force: true })]);
  }

  private validExecution(value: unknown): value is ScriptExecution {
    if (!value || typeof value !== 'object') return false;
    const item = value as Record<string, unknown>;
    return typeof item.id === 'string' && EXECUTION_ID_PATTERN.test(item.id)
      && typeof item.projectId === 'string' && item.projectId.length > 0
      && typeof item.actionId === 'string' && item.actionId.length > 0
      && typeof item.actionName === 'string' && item.actionName.length > 0
      && ['read-only', 'mutable', 'destructive'].includes(String(item.risk))
      && ['running', 'succeeded', 'failed', 'cancelled'].includes(String(item.status))
      && typeof item.startedAt === 'string' && Number.isFinite(Date.parse(item.startedAt))
      && (item.finishedAt === undefined || (typeof item.finishedAt === 'string' && Number.isFinite(Date.parse(item.finishedAt))))
      && (item.exitCode === undefined || Number.isInteger(item.exitCode));
  }

  private readPositiveInteger(raw: string | undefined, fallback: number): number {
    const value = Number(raw); return Number.isSafeInteger(value) && value > 0 ? value : fallback;
  }

  private positiveOption(value: number | undefined, fallback: number): number {
    return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : fallback;
  }
}
