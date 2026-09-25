import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { AgentConcreteProviderId } from './contracts.js';
import { AgentTaskLockManager } from './task-lock.js';

const STORE_VERSION = 1;
const DEFAULT_MAX_TURNS = 2_000;
const MAX_ID_CHARS = 256;
const MAX_CONTENT_CHARS = 16_000;
const MAX_STATE_BYTES = 8 * 1024 * 1024;
const REDACTED_SECRET = '[REDACTED]';
const SECRET_ASSIGNMENT =
  /\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|CLIENT_SECRET|ACCESS_KEY|PRIVATE_KEY)[A-Z0-9_]*)\s*([:=])\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s"'\`,;]+)/gi;
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+\/-]{12,}={0,2}/gi;
const WELL_KNOWN_TOKEN =
  /\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|sk-(?:ant-)?[A-Za-z0-9_-]{16,})\b/g;
const PRIVATE_KEY_BLOCK =
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g;
const URL_PASSWORD = /(https?:\/\/[^:\s/@]+:)[^@\s]+(@)/gi;

export type AgentConversationTurnRole = 'user' | 'agent';

export interface AgentConversationTurn {
  id: string;
  taskId: string;
  role: AgentConversationTurnRole;
  content: string;
  createdAt: string;
  executionId?: string;
  providerId?: AgentConcreteProviderId;
}

interface PersistedAgentConversation {
  version: 1;
  taskId: string;
  turns: AgentConversationTurn[];
}

export interface AgentConversationStoreOptions {
  stateDirectory: string;
  maxTurns?: number;
  lockManager?: AgentTaskLockManager;
}

export type AgentConversationStoreErrorCode =
  | 'AGENT_CONVERSATION_INVALID'
  | 'AGENT_CONVERSATION_CORRUPT'
  | 'AGENT_CONVERSATION_CONFLICT'
  | 'AGENT_CONVERSATION_LIMIT';

export class AgentConversationStoreError extends Error {
  public constructor(
    public readonly code: AgentConversationStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AgentConversationStoreError';
  }
}

function conversationKey(taskId: string): string {
  return createHash('sha256').update(taskId).digest('hex');
}

function conversationLockKey(taskId: string): string {
  return 'conversation-' + conversationKey(taskId);
}

function isEnoent(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT',
  );
}

function assertIdentity(value: string, label: string): void {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_ID_CHARS ||
    value.includes('\0')
  ) {
    throw new AgentConversationStoreError(
      'AGENT_CONVERSATION_INVALID',
      `${label} is invalid.`,
    );
  }
}

function assertTimestamp(value: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new AgentConversationStoreError(
      'AGENT_CONVERSATION_INVALID',
      'Agent conversation turn timestamp is invalid.',
    );
  }
}

function isConcreteProviderId(
  value: unknown,
): value is AgentConcreteProviderId {
  return (
    value === 'codex' || value === 'claude-code' || value === 'chatgpt-browser'
  );
}

export function sanitizeAgentConversationContent(content: string): string {
  return content
    .replace(PRIVATE_KEY_BLOCK, '[REDACTED PRIVATE KEY]')
    .replace(URL_PASSWORD, '$1' + REDACTED_SECRET + '$2')
    .replace(BEARER_TOKEN, 'Bearer ' + REDACTED_SECRET)
    .replace(WELL_KNOWN_TOKEN, REDACTED_SECRET)
    .replace(
      SECRET_ASSIGNMENT,
      (_match, key: string, delimiter: string) =>
        key + delimiter + REDACTED_SECRET,
    );
}

function canonicalTurn(turn: AgentConversationTurn): AgentConversationTurn {
  assertIdentity(turn.id, 'Agent conversation turn id');
  assertIdentity(turn.taskId, 'Agent task id');
  assertTimestamp(turn.createdAt);

  if (turn.role !== 'user' && turn.role !== 'agent') {
    throw new AgentConversationStoreError(
      'AGENT_CONVERSATION_INVALID',
      'Agent conversation turn role is invalid.',
    );
  }
  if (
    typeof turn.content !== 'string' ||
    turn.content.trim().length === 0 ||
    turn.content.length > MAX_CONTENT_CHARS ||
    turn.content.includes('\0')
  ) {
    throw new AgentConversationStoreError(
      'AGENT_CONVERSATION_INVALID',
      'Agent conversation turn content is invalid.',
    );
  }

  const hasExecution = turn.executionId !== undefined;
  const hasProvider = turn.providerId !== undefined;
  if (hasExecution !== hasProvider) {
    throw new AgentConversationStoreError(
      'AGENT_CONVERSATION_INVALID',
      'Agent conversation execution and provider must be associated together.',
    );
  }
  if (turn.role === 'user' && (hasExecution || hasProvider)) {
    throw new AgentConversationStoreError(
      'AGENT_CONVERSATION_INVALID',
      'User conversation turns cannot own provider execution metadata.',
    );
  }
  if (turn.role === 'agent' && !hasExecution) {
    throw new AgentConversationStoreError(
      'AGENT_CONVERSATION_INVALID',
      'Agent conversation turns require provider execution metadata.',
    );
  }
  if (hasExecution) {
    assertIdentity(turn.executionId!, 'Agent execution id');
    if (!isConcreteProviderId(turn.providerId)) {
      throw new AgentConversationStoreError(
        'AGENT_CONVERSATION_INVALID',
        'Agent conversation provider is invalid.',
      );
    }
  }

  const canonical: AgentConversationTurn = {
    id: turn.id,
    taskId: turn.taskId,
    role: turn.role,
    content: sanitizeAgentConversationContent(turn.content),
    createdAt: turn.createdAt,
  };
  if (hasExecution) {
    canonical.executionId = turn.executionId!;
    canonical.providerId = turn.providerId as AgentConcreteProviderId;
  }
  return canonical;
}

function sameTurn(
  left: AgentConversationTurn,
  right: AgentConversationTurn,
): boolean {
  return (
    left.id === right.id &&
    left.taskId === right.taskId &&
    left.role === right.role &&
    left.content === right.content &&
    left.createdAt === right.createdAt &&
    left.executionId === right.executionId &&
    left.providerId === right.providerId
  );
}

function isPersistedTurn(
  value: unknown,
  taskId: string,
): value is AgentConversationTurn {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const allowedKeys = new Set([
    'id',
    'taskId',
    'role',
    'content',
    'createdAt',
    'executionId',
    'providerId',
  ]);
  if (Object.keys(candidate).some((key) => !allowedKeys.has(key))) {
    return false;
  }

  try {
    const canonical = canonicalTurn(
      candidate as unknown as AgentConversationTurn,
    );
    return canonical.taskId === taskId;
  } catch {
    return false;
  }
}

function emptyConversation(taskId: string): PersistedAgentConversation {
  return {
    version: STORE_VERSION,
    taskId,
    turns: [],
  };
}

export class AgentConversationStore {
  private readonly maxTurns: number;
  private readonly lockManager: AgentTaskLockManager;

  public constructor(private readonly options: AgentConversationStoreOptions) {
    if (!options.stateDirectory) {
      throw new AgentConversationStoreError(
        'AGENT_CONVERSATION_INVALID',
        'Agent conversation state directory is required.',
      );
    }
    this.maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
    if (!Number.isSafeInteger(this.maxTurns) || this.maxTurns <= 0) {
      throw new AgentConversationStoreError(
        'AGENT_CONVERSATION_INVALID',
        'Agent conversation turn limit is invalid.',
      );
    }
    this.lockManager =
      options.lockManager ??
      new AgentTaskLockManager({ stateDirectory: options.stateDirectory });
  }

  public async list(taskId: string): Promise<AgentConversationTurn[]> {
    assertIdentity(taskId, 'Agent task id');
    const release = await this.lockManager.acquire(conversationLockKey(taskId), {
      wait: true,
    });
    try {
      return (await this.read(taskId)).turns.map((turn) => ({ ...turn }));
    } finally {
      await release();
    }
  }

  public async append(
    turn: AgentConversationTurn,
  ): Promise<AgentConversationTurn> {
    const canonical = canonicalTurn(turn);
    const release = await this.lockManager.acquire(
      conversationLockKey(canonical.taskId),
      { wait: true },
    );

    try {
      const state = await this.read(canonical.taskId);
      const existing = state.turns.find((item) => item.id === canonical.id);
      if (existing) {
        if (!sameTurn(existing, canonical)) {
          throw new AgentConversationStoreError(
            'AGENT_CONVERSATION_CONFLICT',
            'Agent conversation turn already exists with different data.',
          );
        }
        return { ...existing };
      }
      if (state.turns.length >= this.maxTurns) {
        throw new AgentConversationStoreError(
          'AGENT_CONVERSATION_LIMIT',
          'Agent conversation reached the persisted turn limit.',
        );
      }

      const next: PersistedAgentConversation = {
        ...state,
        turns: [...state.turns, canonical],
      };
      await this.write(next);
      return { ...canonical };
    } finally {
      await release();
    }
  }

  private conversationsDirectory(): string {
    return path.join(this.options.stateDirectory, 'conversations');
  }

  private pathFor(taskId: string): string {
    return path.join(
      this.conversationsDirectory(),
      `${conversationKey(taskId)}.json`,
    );
  }

  private async read(taskId: string): Promise<PersistedAgentConversation> {
    const filePath = this.pathFor(taskId);
    try {
      const stat = await fs.lstat(filePath);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size > MAX_STATE_BYTES
      ) {
        throw new AgentConversationStoreError(
          'AGENT_CONVERSATION_CORRUPT',
          'Agent conversation state file is invalid.',
        );
      }

      const parsed: unknown = JSON.parse(await fs.readFile(filePath, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new AgentConversationStoreError(
          'AGENT_CONVERSATION_CORRUPT',
          'Agent conversation state is invalid.',
        );
      }
      const record = parsed as Record<string, unknown>;
      const allowedKeys = new Set(['version', 'taskId', 'turns']);
      if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
        throw new AgentConversationStoreError(
          'AGENT_CONVERSATION_CORRUPT',
          'Agent conversation state contains an unexpected field.',
        );
      }
      if (
        record.version !== STORE_VERSION ||
        record.taskId !== taskId ||
        !Array.isArray(record.turns) ||
        record.turns.length > this.maxTurns ||
        !record.turns.every((turn) => isPersistedTurn(turn, taskId))
      ) {
        throw new AgentConversationStoreError(
          'AGENT_CONVERSATION_CORRUPT',
          'Agent conversation state is invalid.',
        );
      }

      const turns = record.turns as AgentConversationTurn[];
      if (new Set(turns.map((turn) => turn.id)).size !== turns.length) {
        throw new AgentConversationStoreError(
          'AGENT_CONVERSATION_CORRUPT',
          'Agent conversation contains duplicated turn ids.',
        );
      }

      const canonicalTurns = turns.map((turn) => canonicalTurn(turn));
      const normalized: PersistedAgentConversation = {
        version: STORE_VERSION,
        taskId,
        turns: canonicalTurns,
      };
      if (
        turns.some(
          (turn, index) =>
            canonicalTurns[index] !== undefined &&
            !sameTurn(turn, canonicalTurns[index]!),
        )
      ) {
        await this.write(normalized);
      }
      return normalized;
    } catch (error) {
      if (isEnoent(error)) return emptyConversation(taskId);
      if (error instanceof AgentConversationStoreError) throw error;
      throw new AgentConversationStoreError(
        'AGENT_CONVERSATION_CORRUPT',
        'Agent conversation state could not be read.',
      );
    }
  }

  private async write(state: PersistedAgentConversation): Promise<void> {
    const directory = this.conversationsDirectory();
    const target = this.pathFor(state.taskId);
    const serialized = JSON.stringify(state, null, 2) + '\n';
    if (Buffer.byteLength(serialized, 'utf8') > MAX_STATE_BYTES) {
      throw new AgentConversationStoreError(
        'AGENT_CONVERSATION_LIMIT',
        'Agent conversation state exceeds the supported size.',
      );
    }

    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary =
      target +
      '.' +
      process.pid +
      '.' +
      randomBytes(6).toString('hex') +
      '.tmp';
    try {
      await fs.writeFile(temporary, serialized, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
      });
      await fs.rename(temporary, target);
      await fs.chmod(target, 0o600);
    } finally {
      await fs.unlink(temporary).catch((error: unknown) => {
        if (!isEnoent(error)) throw error;
      });
    }
  }
}
