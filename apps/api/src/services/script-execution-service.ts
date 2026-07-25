import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { access, mkdir, open, readlink, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import type {
  Project,
  ProjectScript,
  ScriptExecution,
  ScriptExecutionConfirmation,
  ScriptExecutionLog,
} from '@dev-dashboard/contracts';

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
  private readonly stateDirectory: string;

  public constructor(
    private readonly detection: ScriptDetectionService,
    stateDirectory =
      process.env.DEV_DASHBOARD_STATE_DIR?.trim() ||
      path.join(homedir(), '.local', 'state', 'dev-dashboard'),
  ) {
    this.stateDirectory = path.resolve(stateDirectory, 'scripts');
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

  public get(projectId: string, executionId: string): ScriptExecution {
    const record = this.findExecution(projectId, executionId);
    return { ...record.execution };
  }

  public async log(
    projectId: string,
    executionId: string,
  ): Promise<ScriptExecutionLog> {
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
    return { executionId, content, truncated: start > 0 };
  }

  public async cancel(
    projectId: string,
    executionId: string,
  ): Promise<ScriptExecution> {
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

    try {
      record.child = spawn(resolved.command, resolved.args, {
        cwd: project.path,
        shell: false,
        detached: process.platform !== 'win32',
        stdio: ['ignore', handle.fd, handle.fd],
      });
    } catch (error) {
      this.executions.delete(id);
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
}
