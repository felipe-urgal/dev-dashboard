import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_MS = 50;
const MAX_LOCK_KEY_LENGTH = 160;

export type AgentTaskLockErrorCode =
  'AGENT_TASK_LOCK_INVALID' | 'AGENT_TASK_LOCKED' | 'AGENT_TASK_LOCK_TIMEOUT';

export class AgentTaskLockError extends Error {
  public constructor(
    public readonly code: AgentTaskLockErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AgentTaskLockError';
  }
}

export interface AgentTaskLockAcquireOptions {
  wait?: boolean;
  pollMs?: number;
  timeoutMs?: number;
}

export interface AgentTaskLockManagerOptions {
  stateDirectory: string;
  processId?: number;
  isProcessAlive?: (processId: number) => boolean;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}

interface PersistedTaskLock {
  processId: number;
  ownerToken: string;
  createdAt: string;
}

function defaultIsProcessAlive(processId: number): boolean {
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return !(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ESRCH'
    );
  }
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function validateLockKey(key: string): void {
  if (
    key.length === 0 ||
    key.length > MAX_LOCK_KEY_LENGTH ||
    !/^[A-Za-z0-9._-]+$/u.test(key)
  ) {
    throw new AgentTaskLockError(
      'AGENT_TASK_LOCK_INVALID',
      'Agent task lock key is invalid.',
    );
  }
}

function isPersistedTaskLock(value: unknown): value is PersistedTaskLock {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(candidate.processId) &&
    (candidate.processId as number) > 0 &&
    typeof candidate.ownerToken === 'string' &&
    candidate.ownerToken.length > 0 &&
    typeof candidate.createdAt === 'string' &&
    Number.isFinite(Date.parse(candidate.createdAt))
  );
}

export class AgentTaskLockManager {
  private readonly processId: number;
  private readonly isProcessAlive: (processId: number) => boolean;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;

  public constructor(private readonly options: AgentTaskLockManagerOptions) {
    if (!options.stateDirectory) {
      throw new AgentTaskLockError(
        'AGENT_TASK_LOCK_INVALID',
        'Agent task lock state directory is required.',
      );
    }

    this.processId = options.processId ?? process.pid;
    this.isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? (() => Date.now());
  }

  public async acquire(
    key: string,
    options: AgentTaskLockAcquireOptions = {},
  ): Promise<() => Promise<void>> {
    validateLockKey(key);

    const wait = options.wait ?? false;
    const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const locksDirectory = path.join(this.options.stateDirectory, 'locks');
    const lockPath = path.join(locksDirectory, `${key}.json`);

    await fs.mkdir(locksDirectory, { recursive: true, mode: 0o700 });

    const ownerToken = randomUUID();
    const startedAt = this.now();

    for (;;) {
      const payload: PersistedTaskLock = {
        processId: this.processId,
        ownerToken,
        createdAt: new Date().toISOString(),
      };

      try {
        await fs.writeFile(lockPath, JSON.stringify(payload), {
          encoding: 'utf8',
          flag: 'wx',
          mode: 0o600,
        });
        return async () => {
          let current: PersistedTaskLock;
          try {
            const parsed: unknown = JSON.parse(
              await fs.readFile(lockPath, 'utf8'),
            );
            if (!isPersistedTaskLock(parsed)) return;
            current = parsed;
          } catch (error) {
            if (
              error &&
              typeof error === 'object' &&
              'code' in error &&
              (error as { code?: unknown }).code === 'ENOENT'
            ) {
              return;
            }
            throw error;
          }

          if (current.ownerToken !== ownerToken) return;
          await fs.unlink(lockPath).catch((error: unknown) => {
            if (!(
              error &&
              typeof error === 'object' &&
              'code' in error &&
              (error as { code?: unknown }).code === 'ENOENT'
            )) {
              throw error;
            }
          });
        };
      } catch (error) {
        if (!(
          error &&
          typeof error === 'object' &&
          'code' in error &&
          (error as { code?: unknown }).code === 'EEXIST'
        )) {
          throw error;
        }
      }

      let current: PersistedTaskLock;
      try {
        const parsed: unknown = JSON.parse(await fs.readFile(lockPath, 'utf8'));
        if (!isPersistedTaskLock(parsed)) {
          throw new AgentTaskLockError(
            'AGENT_TASK_LOCK_INVALID',
            'Existing agent task lock is invalid.',
          );
        }
        current = parsed;
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          (error as { code?: unknown }).code === 'ENOENT'
        ) {
          continue;
        }
        throw error;
      }

      if (!this.isProcessAlive(current.processId)) {
        await fs.unlink(lockPath).catch((error: unknown) => {
          if (!(
            error &&
            typeof error === 'object' &&
            'code' in error &&
            (error as { code?: unknown }).code === 'ENOENT'
          )) {
            throw error;
          }
        });
        continue;
      }

      if (!wait) {
        throw new AgentTaskLockError(
          'AGENT_TASK_LOCKED',
          'Agent task is already running.',
        );
      }

      if (this.now() - startedAt >= timeoutMs) {
        throw new AgentTaskLockError(
          'AGENT_TASK_LOCK_TIMEOUT',
          'Timed out waiting for the agent task lock.',
        );
      }

      await this.sleep(pollMs);
    }
  }
}
