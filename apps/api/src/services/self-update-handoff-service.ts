import { spawn } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL_TIMEOUT_MS = 70_000;
const WORKER_READY_TIMEOUT_MS = 5_000;
const WORKER_READY_POLL_MS = 50;
const MAX_TOOL_OUTPUT_BYTES = 64 * 1024;
const MAX_EXECUTION_LOCK_BYTES = 1024;
const HANDOFF_ID_PATTERN = /^self-update-[0-9a-f-]{36}$/;
const REVISION_PATTERN = /^[0-9a-f]{40,64}$/;
const PLAN_HASH_PATTERN = /^[0-9a-f]{64}$/;
const PROJECT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const RESULT_CODE_PATTERN = /^[A-Z0-9_]{1,96}$/;
const TERMINAL_STATUSES = new Set([
  'succeeded',
  'failed',
  'recovery_required',
]);

export type SelfUpdateHandoffStatus =
  | 'prepared'
  | 'accepted'
  | 'applying'
  | 'restarting'
  | 'verifying'
  | 'succeeded'
  | 'failed'
  | 'recovery_required';

export interface SelfUpdateHandoffResult {
  code: string;
  message: string;
  finishedAt: string;
  appliedRevision?: string;
}

export interface SelfUpdateHandoff {
  version: 1;
  id: string;
  action: 'self-update';
  projectId: string;
  targetRevision: string;
  planHash: string;
  status: SelfUpdateHandoffStatus;
  createdAt: string;
  updatedAt: string;
  result?: SelfUpdateHandoffResult;
}

export interface SelfUpdateHandoffInput {
  handoffId?: string;
  projectId: string;
  targetRevision: string;
  planHash: string;
}

export interface SelfUpdateHandoffInspectInput extends SelfUpdateHandoffInput {
  handoffId: string;
}

interface ToolResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface ExecutionStart {
  handoffId: string;
  pid: number;
}

export type SelfUpdateToolRunner = (
  scriptPath: string,
  args: string[],
) => Promise<ToolResult>;

export type SelfUpdateExecutionProbe = (
  handoffId: string,
  workerPid: number,
) => Promise<void>;

export type SelfUpdateShutdownRequester = () => void;

export interface SelfUpdateHandoffServiceOptions {
  runner?: SelfUpdateToolRunner;
  repositoryRoot?: string;
  executionProbe?: SelfUpdateExecutionProbe;
  requestShutdown?: SelfUpdateShutdownRequester;
}

export type SelfUpdateHandoffErrorCode =
  | 'SELF_UPDATE_INPUT_INVALID'
  | 'SELF_UPDATE_AGENT_UNAVAILABLE'
  | 'SELF_UPDATE_HANDOFF_PREPARE_FAILED'
  | 'SELF_UPDATE_HANDOFF_CLAIM_FAILED'
  | 'SELF_UPDATE_HANDOFF_INSPECT_FAILED'
  | 'SELF_UPDATE_EXECUTION_START_FAILED'
  | 'SELF_UPDATE_SHUTDOWN_REQUEST_FAILED'
  | 'SELF_UPDATE_HANDOFF_INVALID';

export class SelfUpdateHandoffError extends Error {
  constructor(
    readonly code: SelfUpdateHandoffErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SelfUpdateHandoffError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 64) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function isHandoffResult(value: unknown): value is SelfUpdateHandoffResult {
  if (!isRecord(value)) return false;
  return (
    typeof value.code === 'string' &&
    RESULT_CODE_PATTERN.test(value.code) &&
    typeof value.message === 'string' &&
    value.message.length > 0 &&
    value.message.length <= 1000 &&
    isIsoTimestamp(value.finishedAt) &&
    (value.appliedRevision === undefined ||
      (typeof value.appliedRevision === 'string' &&
        REVISION_PATTERN.test(value.appliedRevision)))
  );
}

function validateInput(input: SelfUpdateHandoffInput): void {
  if (
    (input.handoffId !== undefined &&
      !HANDOFF_ID_PATTERN.test(input.handoffId)) ||
    !PROJECT_ID_PATTERN.test(input.projectId) ||
    !REVISION_PATTERN.test(input.targetRevision) ||
    !PLAN_HASH_PATTERN.test(input.planHash)
  ) {
    throw new SelfUpdateHandoffError(
      'SELF_UPDATE_INPUT_INVALID',
      'Contexto do self-update possui identificadores inválidos.',
    );
  }
}

function parseHandoff(
  raw: string,
  expected: SelfUpdateHandoffInput,
  expectedStatus?: SelfUpdateHandoffStatus,
): SelfUpdateHandoff {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SelfUpdateHandoffError(
      'SELF_UPDATE_HANDOFF_INVALID',
      'Tooling de self-update retornou JSON inválido.',
    );
  }

  const value = isRecord(parsed) ? parsed : null;
  const status = value?.status;
  if (
    !value ||
    value.version !== 1 ||
    value.action !== 'self-update' ||
    typeof value.id !== 'string' ||
    !HANDOFF_ID_PATTERN.test(value.id) ||
    (expected.handoffId !== undefined && value.id !== expected.handoffId) ||
    value.projectId !== expected.projectId ||
    value.targetRevision !== expected.targetRevision ||
    value.planHash !== expected.planHash ||
    typeof status !== 'string' ||
    ![
      'prepared',
      'accepted',
      'applying',
      'restarting',
      'verifying',
      'succeeded',
      'failed',
      'recovery_required',
    ].includes(status) ||
    (expectedStatus !== undefined && status !== expectedStatus) ||
    !isIsoTimestamp(value.createdAt) ||
    !isIsoTimestamp(value.updatedAt) ||
    (TERMINAL_STATUSES.has(status)
      ? !isHandoffResult(value.result)
      : value.result !== undefined)
  ) {
    throw new SelfUpdateHandoffError(
      'SELF_UPDATE_HANDOFF_INVALID',
      'Tooling de self-update retornou um handoff incompatível com o contexto confirmado.',
    );
  }

  return value as unknown as SelfUpdateHandoff;
}

function parseAgentPing(raw: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SelfUpdateHandoffError(
      'SELF_UPDATE_AGENT_UNAVAILABLE',
      'Self-update agent retornou uma resposta inválida.',
    );
  }

  if (
    !isRecord(parsed) ||
    parsed.status !== 'ready' ||
    !Array.isArray(parsed.actions) ||
    !parsed.actions.includes('claim') ||
    !parsed.actions.includes('inspect') ||
    typeof parsed.instanceId !== 'string'
  ) {
    throw new SelfUpdateHandoffError(
      'SELF_UPDATE_AGENT_UNAVAILABLE',
      'Self-update agent não está pronto para assumir e reconciliar handoffs.',
    );
  }
}

function parseExecutionStart(raw: string, handoffId: string): ExecutionStart {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SelfUpdateHandoffError(
      'SELF_UPDATE_EXECUTION_START_FAILED',
      'Worker de self-update retornou uma resposta inválida.',
    );
  }

  if (
    !isRecord(parsed) ||
    parsed.status !== 'worker-started' ||
    parsed.handoffId !== handoffId ||
    !Number.isSafeInteger(parsed.pid) ||
    Number(parsed.pid) <= 1
  ) {
    throw new SelfUpdateHandoffError(
      'SELF_UPDATE_EXECUTION_START_FAILED',
      'Worker externo não comprovou que iniciou o handoff confirmado.',
    );
  }

  return { handoffId, pid: Number(parsed.pid) };
}

function safeToolMessage(stderr: string): string {
  const trimmed = stderr.trim().replaceAll(/\s+/g, ' ');
  return trimmed.slice(0, 500);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function resolveStateRoot(): string {
  const configured = process.env.DEV_DASHBOARD_STATE_DIR?.trim();
  if (configured) return path.resolve(configured);

  const xdgStateHome = process.env.XDG_STATE_HOME?.trim();
  if (xdgStateHome) {
    return path.join(path.resolve(xdgStateHome), 'dev-dashboard');
  }

  return path.join(homedir(), '.local', 'state', 'dev-dashboard');
}

function workerIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') {
      return false;
    }
    return true;
  }
}

async function defaultExecutionProbe(
  handoffId: string,
  workerPid: number,
): Promise<void> {
  const lockPath = path.join(resolveStateRoot(), 'self-update', 'execution.lock');
  const deadline = Date.now() + WORKER_READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (!workerIsAlive(workerPid)) {
      throw new Error('Worker externo encerrou antes de adquirir ownership.');
    }

    try {
      const metadata = await lstat(lockPath);
      const uid = typeof process.getuid === 'function' ? process.getuid() : null;
      if (
        !metadata.isFile() ||
        metadata.isSymbolicLink() ||
        (uid !== null && metadata.uid !== uid) ||
        (metadata.mode & 0o077) !== 0 ||
        metadata.size > MAX_EXECUTION_LOCK_BYTES
      ) {
        throw new Error('Lock de execução do self-update não é confiável.');
      }

      let lock: unknown;
      try {
        lock = JSON.parse(await readFile(lockPath, 'utf8'));
      } catch {
        await sleep(WORKER_READY_POLL_MS);
        continue;
      }

      if (
        isRecord(lock) &&
        Object.keys(lock).length === 2 &&
        lock.pid === workerPid &&
        lock.handoffId === handoffId
      ) {
        return;
      }

      throw new Error('Lock de execução pertence a outro handoff ou processo.');
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        await sleep(WORKER_READY_POLL_MS);
        continue;
      }
      throw error;
    }
  }

  throw new Error('Worker externo não adquiriu ownership dentro do limite.');
}

async function defaultToolRunner(
  scriptPath: string,
  args: string[],
): Promise<ToolResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: path.dirname(path.dirname(scriptPath)),
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finishError = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill('SIGTERM');
      reject(error);
    };

    const append = (current: string, chunk: Buffer): string => {
      const next = current + chunk.toString('utf8');
      if (Buffer.byteLength(next, 'utf8') > MAX_TOOL_OUTPUT_BYTES) {
        finishError(new Error('Saída do tooling de self-update excedeu o limite.'));
        return current;
      }
      return next;
    };

    child.stdout.on('data', (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    child.once('error', finishError);

    const timeout = setTimeout(() => {
      finishError(new Error('Tooling de self-update excedeu o timeout.'));
    }, TOOL_TIMEOUT_MS);
    timeout.unref();

    child.once('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export class SelfUpdateHandoffService {
  private readonly helperPath: string;
  private readonly agentPath: string;
  private readonly runner: SelfUpdateToolRunner;
  private readonly executionProbe: SelfUpdateExecutionProbe;
  private readonly requestShutdown: SelfUpdateShutdownRequester;

  constructor(options: SelfUpdateHandoffServiceOptions = {}) {
    const repositoryRoot =
      options.repositoryRoot ??
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
    this.runner = options.runner ?? defaultToolRunner;
    this.executionProbe = options.executionProbe ?? defaultExecutionProbe;
    this.requestShutdown = options.requestShutdown ?? (() => undefined);
    this.helperPath = path.join(repositoryRoot, 'scripts/self-update-helper.mjs');
    this.agentPath = path.join(repositoryRoot, 'scripts/self-update-agent.mjs');
  }

  async inspect(input: SelfUpdateHandoffInspectInput): Promise<SelfUpdateHandoff> {
    validateInput(input);
    let result: ToolResult;
    try {
      result = await this.runner(this.agentPath, ['inspect', input.handoffId]);
    } catch {
      throw new SelfUpdateHandoffError(
        'SELF_UPDATE_HANDOFF_INSPECT_FAILED',
        'Não foi possível consultar o handoff no self-update agent.',
      );
    }
    if (result.code !== 0) {
      throw new SelfUpdateHandoffError(
        'SELF_UPDATE_HANDOFF_INSPECT_FAILED',
        safeToolMessage(result.stderr) ||
          'Não foi possível consultar o handoff no self-update agent.',
      );
    }
    return parseHandoff(result.stdout, input);
  }

  async prepareAndExecute(input: SelfUpdateHandoffInput): Promise<SelfUpdateHandoff> {
    validateInput(input);

    let ping: ToolResult;
    try {
      ping = await this.runner(this.agentPath, ['ping']);
    } catch {
      throw new SelfUpdateHandoffError(
        'SELF_UPDATE_AGENT_UNAVAILABLE',
        'Self-update agent local não pôde ser consultado.',
      );
    }
    if (ping.code !== 0) {
      throw new SelfUpdateHandoffError(
        'SELF_UPDATE_AGENT_UNAVAILABLE',
        safeToolMessage(ping.stderr) || 'Self-update agent local não está disponível.',
      );
    }
    parseAgentPing(ping.stdout);

    const prepareArgs = [
      'prepare',
      '--project-id',
      input.projectId,
      '--revision',
      input.targetRevision,
      '--plan-hash',
      input.planHash,
      ...(input.handoffId ? ['--handoff-id', input.handoffId] : []),
    ];
    let preparedResult: ToolResult;
    try {
      preparedResult = await this.runner(this.helperPath, prepareArgs);
    } catch {
      throw new SelfUpdateHandoffError(
        'SELF_UPDATE_HANDOFF_PREPARE_FAILED',
        'Não foi possível persistir o handoff de self-update.',
      );
    }
    if (preparedResult.code !== 0) {
      throw new SelfUpdateHandoffError(
        'SELF_UPDATE_HANDOFF_PREPARE_FAILED',
        safeToolMessage(preparedResult.stderr) ||
          'Não foi possível persistir o handoff de self-update.',
      );
    }
    const prepared = parseHandoff(preparedResult.stdout, input, 'prepared');

    let claimedResult: ToolResult;
    try {
      claimedResult = await this.runner(this.agentPath, ['claim', prepared.id]);
    } catch {
      throw new SelfUpdateHandoffError(
        'SELF_UPDATE_HANDOFF_CLAIM_FAILED',
        'Handoff foi persistido, mas o self-update agent não assumiu a execução.',
      );
    }
    if (claimedResult.code !== 0) {
      throw new SelfUpdateHandoffError(
        'SELF_UPDATE_HANDOFF_CLAIM_FAILED',
        safeToolMessage(claimedResult.stderr) ||
          'Handoff foi persistido, mas o self-update agent não assumiu a execução.',
      );
    }

    const claimed = parseHandoff(claimedResult.stdout, input, 'accepted');
    if (claimed.id !== prepared.id || claimed.createdAt !== prepared.createdAt) {
      throw new SelfUpdateHandoffError(
        'SELF_UPDATE_HANDOFF_INVALID',
        'Self-update agent assumiu um handoff diferente daquele persistido pela API.',
      );
    }

    let executionResult: ToolResult;
    try {
      executionResult = await this.runner(this.agentPath, ['execute', claimed.id]);
    } catch {
      throw new SelfUpdateHandoffError(
        'SELF_UPDATE_EXECUTION_START_FAILED',
        'Handoff foi aceito, mas o worker externo não pôde ser iniciado.',
      );
    }
    if (executionResult.code !== 0) {
      throw new SelfUpdateHandoffError(
        'SELF_UPDATE_EXECUTION_START_FAILED',
        safeToolMessage(executionResult.stderr) ||
          'Handoff foi aceito, mas o worker externo não pôde ser iniciado.',
      );
    }

    const execution = parseExecutionStart(executionResult.stdout, claimed.id);
    try {
      await this.executionProbe(execution.handoffId, execution.pid);
    } catch {
      throw new SelfUpdateHandoffError(
        'SELF_UPDATE_EXECUTION_START_FAILED',
        'Worker externo não comprovou ownership exclusivo antes do shutdown da API.',
      );
    }

    try {
      this.requestShutdown();
    } catch {
      throw new SelfUpdateHandoffError(
        'SELF_UPDATE_SHUTDOWN_REQUEST_FAILED',
        'Worker assumiu a execução, mas a parada controlada da API não pôde ser solicitada.',
      );
    }

    return claimed;
  }
}
