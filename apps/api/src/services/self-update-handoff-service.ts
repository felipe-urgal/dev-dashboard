import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL_TIMEOUT_MS = 5_000;
const MAX_TOOL_OUTPUT_BYTES = 64 * 1024;
const HANDOFF_ID_PATTERN = /^self-update-[0-9a-f-]{36}$/;
const REVISION_PATTERN = /^[0-9a-f]{40,64}$/;
const PLAN_HASH_PATTERN = /^[0-9a-f]{64}$/;
const PROJECT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;

export type SelfUpdateHandoffStatus = 'prepared' | 'accepted';

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
}

interface PrepareInput {
  projectId: string;
  targetRevision: string;
  planHash: string;
}

interface ToolResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type SelfUpdateToolRunner = (
  scriptPath: string,
  args: string[],
) => Promise<ToolResult>;

export type SelfUpdateHandoffErrorCode =
  | 'SELF_UPDATE_INPUT_INVALID'
  | 'SELF_UPDATE_AGENT_UNAVAILABLE'
  | 'SELF_UPDATE_HANDOFF_PREPARE_FAILED'
  | 'SELF_UPDATE_HANDOFF_CLAIM_FAILED'
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

function validateInput(input: PrepareInput): void {
  if (
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
  expected: PrepareInput,
  expectedStatus: SelfUpdateHandoffStatus,
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

  if (
    !isRecord(parsed) ||
    parsed.version !== 1 ||
    parsed.action !== 'self-update' ||
    typeof parsed.id !== 'string' ||
    !HANDOFF_ID_PATTERN.test(parsed.id) ||
    parsed.projectId !== expected.projectId ||
    parsed.targetRevision !== expected.targetRevision ||
    parsed.planHash !== expected.planHash ||
    parsed.status !== expectedStatus ||
    !isIsoTimestamp(parsed.createdAt) ||
    !isIsoTimestamp(parsed.updatedAt)
  ) {
    throw new SelfUpdateHandoffError(
      'SELF_UPDATE_HANDOFF_INVALID',
      'Tooling de self-update retornou um handoff incompatível com o contexto confirmado.',
    );
  }

  return parsed as unknown as SelfUpdateHandoff;
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
    typeof parsed.instanceId !== 'string'
  ) {
    throw new SelfUpdateHandoffError(
      'SELF_UPDATE_AGENT_UNAVAILABLE',
      'Self-update agent não está pronto para assumir handoffs.',
    );
  }
}

function safeToolMessage(stderr: string): string {
  const trimmed = stderr.trim().replaceAll(/\s+/g, ' ');
  return trimmed.slice(0, 500);
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

  constructor(
    private readonly runner: SelfUpdateToolRunner = defaultToolRunner,
    repositoryRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../..',
    ),
  ) {
    this.helperPath = path.join(repositoryRoot, 'scripts/self-update-helper.mjs');
    this.agentPath = path.join(repositoryRoot, 'scripts/self-update-agent.mjs');
  }

  async prepareAndClaim(input: PrepareInput): Promise<SelfUpdateHandoff> {
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

    let preparedResult: ToolResult;
    try {
      preparedResult = await this.runner(this.helperPath, [
        'prepare',
        '--project-id',
        input.projectId,
        '--revision',
        input.targetRevision,
        '--plan-hash',
        input.planHash,
      ]);
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
    return claimed;
  }
}
