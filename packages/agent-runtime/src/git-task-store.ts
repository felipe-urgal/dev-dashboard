import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type {
  AgentCliProcessRunner,
  AgentTask,
  AgentTaskRecord,
  AgentTaskStore,
} from './index.js';
import { runAgentCliProcess } from './cli-process.js';
import { deserializeAgentTask, serializeAgentTask } from './serialization.js';
import { canTransitionAgentTask } from './state-machine.js';
import { AgentTaskLockManager } from './task-lock.js';

const STORE_MARKER = '.dev-dashboard-agent-store.json';
const STORE_OWNER = 'dev-dashboard-agent-runtime';
const STORE_SCHEMA_VERSION = 1;
const MAX_TASK_FILE_BYTES = 64 * 1024;
const MAX_ID_LENGTH = 256;
const DEFAULT_GIT_TIMEOUT_MS = 30_000;
const DEFAULT_LOCK_TIMEOUT_MS = 30_000;

export type GitAgentTaskStoreErrorCode =
  | 'AGENT_TASK_STORE_CONFLICT'
  | 'AGENT_TASK_STORE_CORRUPT'
  | 'AGENT_TASK_STORE_GIT'
  | 'AGENT_TASK_STORE_INVALID';

export class GitAgentTaskStoreError extends Error {
  public constructor(
    public readonly code: GitAgentTaskStoreErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GitAgentTaskStoreError';
  }
}

export interface GitAgentTaskStoreOptions {
  repositoryDirectory: string;
  gitCommand?: string;
  runProcess?: AgentCliProcessRunner;
  gitTimeoutMs?: number;
  lockTimeoutMs?: number;
}

interface PersistedAgentTaskRecord {
  schemaVersion: 1;
  version: number;
  task: AgentTask;
}

function isEnoent(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT',
  );
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new GitAgentTaskStoreError(
      'AGENT_TASK_STORE_INVALID',
      label + ' must be a positive integer.',
    );
  }
}

function assertBoundedIdentity(value: string, label: string): void {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_ID_LENGTH ||
    value.includes('\0')
  ) {
    throw new GitAgentTaskStoreError(
      'AGENT_TASK_STORE_INVALID',
      label + ' is invalid.',
    );
  }
}

function assertIsoTimestamp(value: string, label: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new GitAgentTaskStoreError(
      'AGENT_TASK_STORE_INVALID',
      label + ' must be a valid timestamp.',
    );
  }
}

function taskFileName(taskId: string): string {
  return (
    createHash('sha256').update(taskId).digest('hex') +
    '.json'
  );
}

function parsePersistedRecord(serialized: string): PersistedAgentTaskRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new GitAgentTaskStoreError(
      'AGENT_TASK_STORE_CORRUPT',
      'Canonical agent task is not valid JSON.',
      { cause: error },
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new GitAgentTaskStoreError(
      'AGENT_TASK_STORE_CORRUPT',
      'Canonical agent task record must be an object.',
    );
  }

  const record = parsed as Record<string, unknown>;
  const allowedKeys = new Set(['schemaVersion', 'version', 'task']);
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      throw new GitAgentTaskStoreError(
        'AGENT_TASK_STORE_CORRUPT',
        'Canonical agent task record contains an unexpected field.',
      );
    }
  }

  if (
    record.schemaVersion !== STORE_SCHEMA_VERSION ||
    !Number.isSafeInteger(record.version) ||
    (record.version as number) < 0
  ) {
    throw new GitAgentTaskStoreError(
      'AGENT_TASK_STORE_CORRUPT',
      'Canonical agent task record metadata is invalid.',
    );
  }

  let task: AgentTask;
  try {
    task = deserializeAgentTask(JSON.stringify(record.task));
  } catch (error) {
    throw new GitAgentTaskStoreError(
      'AGENT_TASK_STORE_CORRUPT',
      'Canonical agent task payload is invalid.',
      { cause: error },
    );
  }

  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    version: record.version as number,
    task,
  };
}

function markerContents(): string {
  return (
    JSON.stringify(
      {
        owner: STORE_OWNER,
        schemaVersion: STORE_SCHEMA_VERSION,
      },
      null,
      2,
    ) + '\n'
  );
}

function isOwnedMarker(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value);
    return Boolean(
      parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        (parsed as Record<string, unknown>).owner === STORE_OWNER &&
        (parsed as Record<string, unknown>).schemaVersion ===
          STORE_SCHEMA_VERSION,
    );
  } catch {
    return false;
  }
}

export class GitAgentTaskStore implements AgentTaskStore {
  private readonly repositoryDirectory: string;
  private readonly gitCommand: string;
  private readonly runProcess: AgentCliProcessRunner;
  private readonly gitTimeoutMs: number;
  private readonly lockTimeoutMs: number;
  private readonly lockManager: AgentTaskLockManager;

  public constructor(options: GitAgentTaskStoreOptions) {
    if (
      !options.repositoryDirectory ||
      !path.isAbsolute(options.repositoryDirectory)
    ) {
      throw new GitAgentTaskStoreError(
        'AGENT_TASK_STORE_INVALID',
        'Agent task repository directory must be an absolute backend-owned path.',
      );
    }

    this.repositoryDirectory = path.normalize(options.repositoryDirectory);
    this.gitCommand = options.gitCommand ?? 'git';
    this.runProcess = options.runProcess ?? runAgentCliProcess;
    this.gitTimeoutMs = options.gitTimeoutMs ?? DEFAULT_GIT_TIMEOUT_MS;
    this.lockTimeoutMs = options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
    assertPositiveInteger(this.gitTimeoutMs, 'gitTimeoutMs');
    assertPositiveInteger(this.lockTimeoutMs, 'lockTimeoutMs');

    this.lockManager = new AgentTaskLockManager({
      stateDirectory: this.repositoryDirectory + '.runtime',
    });
  }

  public async get(taskId: string): Promise<AgentTaskRecord | null> {
    assertBoundedIdentity(taskId, 'Agent task id');

    return this.withStoreLock(async () => {
      await this.ensureRepository();
      await this.assertClean();
      return this.readTask(taskId);
    });
  }

  public async list(projectId: string): Promise<AgentTaskRecord[]> {
    assertBoundedIdentity(projectId, 'Agent project id');

    return this.withStoreLock(async () => {
      await this.ensureRepository();
      await this.assertClean();

      const tasksDirectory = path.join(this.repositoryDirectory, 'tasks');
      let names: string[];
      try {
        const stat = await fs.lstat(tasksDirectory);
        if (!stat.isDirectory() || stat.isSymbolicLink()) {
          throw new GitAgentTaskStoreError(
            'AGENT_TASK_STORE_CORRUPT',
            'Canonical agent task directory is invalid.',
          );
        }
        names = await fs.readdir(tasksDirectory);
      } catch (error) {
        if (isEnoent(error)) return [];
        throw error;
      }

      const records: AgentTaskRecord[] = [];
      for (const name of names.filter((entry) => entry.endsWith('.json')).sort()) {
        const record = await this.readTaskFile(
          path.join(tasksDirectory, name),
          name,
        );
        if (record.task.projectId === projectId) records.push(record);
      }

      return records.sort((left, right) =>
        left.task.id.localeCompare(right.task.id),
      );
    });
  }

  public async save(
    task: AgentTask,
    expectedVersion: number | null,
  ): Promise<AgentTaskRecord> {
    const canonicalTask = this.validateTask(task);
    if (
      expectedVersion !== null &&
      (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0)
    ) {
      throw new GitAgentTaskStoreError(
        'AGENT_TASK_STORE_INVALID',
        'Expected agent task version is invalid.',
      );
    }

    return this.withStoreLock(async () => {
      await this.ensureRepository();
      await this.assertClean();

      const previous = await this.readTask(canonicalTask.id);
      if (previous === null) {
        if (expectedVersion !== null) {
          throw this.conflict();
        }
      } else {
        if (expectedVersion !== previous.version) {
          throw this.conflict();
        }
        this.validateUpdate(previous.task, canonicalTask);
      }

      const next: AgentTaskRecord = {
        task: canonicalTask,
        version: previous === null ? 0 : previous.version + 1,
      };
      const relativePath = path.posix.join(
        'tasks',
        taskFileName(canonicalTask.id),
      );
      const absolutePath = path.join(
        this.repositoryDirectory,
        ...relativePath.split('/'),
      );

      try {
        await this.writeRecord(absolutePath, next);
        await this.runGit(['add', '--', relativePath], 'stage canonical task');

        const staged = (
          await this.runGit(
            ['diff', '--cached', '--name-only', '--'],
            'inspect staged canonical task',
          )
        ).stdout
          .split(/\r?\n/u)
          .map((value) => value.trim())
          .filter(Boolean);

        if (staged.length !== 1 || staged[0] !== relativePath) {
          throw new GitAgentTaskStoreError(
            'AGENT_TASK_STORE_CORRUPT',
            'Canonical agent task commit contains unexpected files.',
          );
        }

        await this.runGit(
          ['commit', '-m', 'chore(agent): persist task v' + next.version],
          'commit canonical task',
          true,
        );
      } catch (error) {
        await this.rollback(relativePath, previous === null);
        throw error;
      }

      await this.assertClean();
      return next;
    });
  }

  private validateTask(task: AgentTask): AgentTask {
    assertBoundedIdentity(task.id, 'Agent task id');
    assertBoundedIdentity(task.projectId, 'Agent project id');
    assertIsoTimestamp(task.createdAt, 'Agent task createdAt');
    assertIsoTimestamp(task.updatedAt, 'Agent task updatedAt');

    let canonical: AgentTask;
    try {
      canonical = deserializeAgentTask(serializeAgentTask(task));
    } catch (error) {
      throw new GitAgentTaskStoreError(
        'AGENT_TASK_STORE_INVALID',
        'Agent task does not satisfy the public contract.',
        { cause: error },
      );
    }

    const serialized = serializeAgentTask(canonical);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_TASK_FILE_BYTES) {
      throw new GitAgentTaskStoreError(
        'AGENT_TASK_STORE_INVALID',
        'Agent task exceeds the supported size.',
      );
    }

    return canonical;
  }

  private validateUpdate(previous: AgentTask, next: AgentTask): void {
    if (
      previous.id !== next.id ||
      previous.projectId !== next.projectId ||
      previous.createdAt !== next.createdAt
    ) {
      throw new GitAgentTaskStoreError(
        'AGENT_TASK_STORE_INVALID',
        'Agent task identity cannot change.',
      );
    }

    if (Date.parse(next.updatedAt) < Date.parse(previous.updatedAt)) {
      throw new GitAgentTaskStoreError(
        'AGENT_TASK_STORE_INVALID',
        'Agent task updatedAt cannot move backwards.',
      );
    }

    if (
      previous.state !== next.state &&
      !canTransitionAgentTask(previous.state, next.state)
    ) {
      throw new GitAgentTaskStoreError(
        'AGENT_TASK_STORE_INVALID',
        'Agent task state transition is invalid.',
      );
    }
  }

  private async withStoreLock<T>(operation: () => Promise<T>): Promise<T> {
    const release = await this.lockManager.acquire('canonical-store', {
      wait: true,
      timeoutMs: this.lockTimeoutMs,
    });

    try {
      return await operation();
    } finally {
      await release();
    }
  }

  private async ensureRepository(): Promise<void> {
    await fs.mkdir(path.dirname(this.repositoryDirectory), {
      recursive: true,
      mode: 0o700,
    });

    try {
      const stat = await fs.lstat(this.repositoryDirectory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new GitAgentTaskStoreError(
          'AGENT_TASK_STORE_INVALID',
          'Agent task repository path is not a real directory.',
        );
      }
    } catch (error) {
      if (!isEnoent(error)) throw error;
      await fs.mkdir(this.repositoryDirectory, {
        recursive: false,
        mode: 0o700,
      });
    }

    await fs.chmod(this.repositoryDirectory, 0o700);

    const gitDirectory = path.join(this.repositoryDirectory, '.git');
    try {
      const gitStat = await fs.lstat(gitDirectory);
      if (!gitStat.isDirectory() || gitStat.isSymbolicLink()) {
        throw new GitAgentTaskStoreError(
          'AGENT_TASK_STORE_INVALID',
          'Agent task repository Git metadata is invalid.',
        );
      }
      await this.assertOwnedRepository();
      return;
    } catch (error) {
      if (!isEnoent(error)) throw error;
    }

    const entries = await fs.readdir(this.repositoryDirectory);
    if (entries.length !== 0) {
      throw new GitAgentTaskStoreError(
        'AGENT_TASK_STORE_INVALID',
        'Agent task repository directory is not empty and is not managed by Dev Dashboard.',
      );
    }

    await this.runGit(
      ['init', '--initial-branch=main'],
      'initialize canonical task repository',
    );

    const hooksDirectory = this.hooksDirectory();
    await fs.mkdir(hooksDirectory, { recursive: true, mode: 0o700 });
    await fs.writeFile(
      path.join(this.repositoryDirectory, STORE_MARKER),
      markerContents(),
      {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
      },
    );
    await this.runGit(['add', '--', STORE_MARKER], 'stage repository marker');
    await this.runGit(
      ['commit', '-m', 'chore(agent): initialize task store'],
      'commit repository marker',
      true,
    );
    await this.assertOwnedRepository();
    await this.assertClean();
  }

  private async assertOwnedRepository(): Promise<void> {
    const result = await this.runGit(
      ['show', 'HEAD:' + STORE_MARKER],
      'verify repository ownership',
    );

    if (!isOwnedMarker(result.stdout)) {
      throw new GitAgentTaskStoreError(
        'AGENT_TASK_STORE_INVALID',
        'Agent task repository is not owned by Dev Dashboard.',
      );
    }
  }

  private async assertClean(): Promise<void> {
    const result = await this.runGit(
      ['status', '--porcelain=v1', '--untracked-files=all'],
      'inspect canonical task repository',
    );
    if (result.stdout.trim().length !== 0) {
      throw new GitAgentTaskStoreError(
        'AGENT_TASK_STORE_CORRUPT',
        'Canonical agent task repository has uncommitted changes.',
      );
    }
  }

  private async readTask(taskId: string): Promise<AgentTaskRecord | null> {
    const fileName = taskFileName(taskId);
    const filePath = path.join(this.repositoryDirectory, 'tasks', fileName);

    try {
      const record = await this.readTaskFile(filePath, fileName);
      if (record.task.id !== taskId) {
        throw new GitAgentTaskStoreError(
          'AGENT_TASK_STORE_CORRUPT',
          'Canonical agent task identity does not match its storage key.',
        );
      }
      return record;
    } catch (error) {
      if (isEnoent(error)) return null;
      throw error;
    }
  }

  private async readTaskFile(
    filePath: string,
    fileName: string,
  ): Promise<AgentTaskRecord> {
    const stat = await fs.lstat(filePath);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size > MAX_TASK_FILE_BYTES
    ) {
      throw new GitAgentTaskStoreError(
        'AGENT_TASK_STORE_CORRUPT',
        'Canonical agent task file is invalid.',
      );
    }

    const record = parsePersistedRecord(await fs.readFile(filePath, 'utf8'));
    if (taskFileName(record.task.id) !== fileName) {
      throw new GitAgentTaskStoreError(
        'AGENT_TASK_STORE_CORRUPT',
        'Canonical agent task file name does not match its identity.',
      );
    }

    return {
      task: record.task,
      version: record.version,
    };
  }

  private async writeRecord(
    filePath: string,
    record: AgentTaskRecord,
  ): Promise<void> {
    const tasksDirectory = path.dirname(filePath);
    try {
      const stat = await fs.lstat(tasksDirectory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new GitAgentTaskStoreError(
          'AGENT_TASK_STORE_CORRUPT',
          'Canonical agent task directory is invalid.',
        );
      }
    } catch (error) {
      if (!isEnoent(error)) throw error;
      await fs.mkdir(tasksDirectory, {
        recursive: false,
        mode: 0o700,
      });
    }

    const payload: PersistedAgentTaskRecord = {
      schemaVersion: STORE_SCHEMA_VERSION,
      version: record.version,
      task: record.task,
    };
    const serialized = JSON.stringify(payload, null, 2) + '\n';
    if (Buffer.byteLength(serialized, 'utf8') > MAX_TASK_FILE_BYTES) {
      throw new GitAgentTaskStoreError(
        'AGENT_TASK_STORE_INVALID',
        'Canonical agent task record exceeds the supported size.',
      );
    }

    const temporary =
      filePath +
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
      await fs.rename(temporary, filePath);
      await fs.chmod(filePath, 0o600);
    } finally {
      await fs.unlink(temporary).catch((error: unknown) => {
        if (!isEnoent(error)) throw error;
      });
    }
  }

  private async rollback(
    relativePath: string,
    created: boolean,
  ): Promise<void> {
    try {
      await this.runGit(['reset', '--hard', 'HEAD'], 'rollback task write');
    } catch {
      return;
    }

    if (created) {
      await fs
        .unlink(
          path.join(
            this.repositoryDirectory,
            ...relativePath.split('/'),
          ),
        )
        .catch((error: unknown) => {
          if (!isEnoent(error)) throw error;
        });
    }
  }

  private async runGit(
    args: readonly string[],
    label: string,
    commit = false,
  ): Promise<Awaited<ReturnType<AgentCliProcessRunner>>> {
    const hooksDirectory = this.hooksDirectory();
    const gitArgs = [
      '-c',
      'core.hooksPath=' + hooksDirectory,
      '-c',
      'commit.gpgSign=false',
      ...(commit
        ? [
            '-c',
            'user.name=Dev Dashboard',
            '-c',
            'user.email=dev-dashboard@localhost',
          ]
        : []),
      ...args,
    ];

    let result;
    try {
      result = await this.runProcess({
        command: this.gitCommand,
        args: gitArgs,
        cwd: this.repositoryDirectory,
        timeoutMs: this.gitTimeoutMs,
        label,
        maxOutputBytes: 256 * 1024,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
        },
      });
    } catch (error) {
      throw new GitAgentTaskStoreError(
        'AGENT_TASK_STORE_GIT',
        'Git operation failed while managing canonical agent tasks.',
        { cause: error },
      );
    }

    if (result.exitCode !== 0 || result.signal !== null) {
      throw new GitAgentTaskStoreError(
        'AGENT_TASK_STORE_GIT',
        'Git operation failed while managing canonical agent tasks.',
      );
    }

    return result;
  }

  private hooksDirectory(): string {
    return path.join(this.repositoryDirectory, '.git', 'dev-dashboard-hooks');
  }

  private conflict(): GitAgentTaskStoreError {
    return new GitAgentTaskStoreError(
      'AGENT_TASK_STORE_CONFLICT',
      'Canonical agent task version changed.',
    );
  }
}
