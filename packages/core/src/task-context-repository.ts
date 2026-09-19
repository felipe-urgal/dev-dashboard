import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';

import type {
  TaskContext,
  TaskContextIssueRef,
  TaskContextPullRequestRef,
} from '@dev-dashboard/contracts';

import { resolveConfigDirectory } from './config-directory.js';
import {
  isFileNotFoundError,
  quarantineUnreadableStateFile,
} from './state-file-recovery.js';

export interface CreateTaskContextInput {
  projectId: string;
  branch: string;
  environmentInstanceId?: string;
  worktreeId?: string;
  issue?: TaskContextIssueRef;
  pullRequest?: TaskContextPullRequestRef;
}

export interface UpdateTaskContextInput {
  branch?: string;
  environmentInstanceId?: string | null;
  worktreeId?: string | null;
  issue?: TaskContextIssueRef | null;
  pullRequest?: TaskContextPullRequestRef | null;
}

export type TaskContextRepositoryErrorCode =
  | 'TASK_CONTEXT_INVALID'
  | 'TASK_CONTEXT_NOT_FOUND';

export class TaskContextRepositoryError extends Error {
  public constructor(
    public readonly code: TaskContextRepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TaskContextRepositoryError';
  }
}

interface TaskContextConfig {
  version: 1;
  contexts: TaskContext[];
}

export const TASK_CONTEXT_LIMITS = {
  perProject: 50,
  total: 500,
} as const;

const MAX_ID_LENGTH = 256;
const MAX_BRANCH_LENGTH = 512;
const MAX_REPOSITORY_LENGTH = 256;

function isBoundedText(
  value: unknown,
  maximumLength: number,
): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximumLength &&
    !value.includes('\n') &&
    !value.includes('\r') &&
    !value.includes('\0')
  );
}

function isReference(
  value: unknown,
): value is TaskContextIssueRef | TaskContextPullRequestRef {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const candidate = value as Record<string, unknown>;
  return (
    isBoundedText(candidate.repository, MAX_REPOSITORY_LENGTH) &&
    Number.isSafeInteger(candidate.number) &&
    (candidate.number as number) > 0
  );
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isTaskContext(value: unknown): value is TaskContext {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const candidate = value as Record<string, unknown>;
  return (
    isBoundedText(candidate.id, MAX_ID_LENGTH) &&
    isBoundedText(candidate.projectId, MAX_ID_LENGTH) &&
    isBoundedText(candidate.branch, MAX_BRANCH_LENGTH) &&
    (candidate.environmentInstanceId === undefined ||
      isBoundedText(candidate.environmentInstanceId, MAX_ID_LENGTH)) &&
    (candidate.worktreeId === undefined ||
      isBoundedText(candidate.worktreeId, MAX_ID_LENGTH)) &&
    (candidate.issue === undefined || isReference(candidate.issue)) &&
    (candidate.pullRequest === undefined ||
      isReference(candidate.pullRequest)) &&
    isTimestamp(candidate.createdAt) &&
    isTimestamp(candidate.updatedAt)
  );
}

function cloneReference<T extends TaskContextIssueRef | TaskContextPullRequestRef>(
  value: T | undefined,
): T | undefined {
  return value ? ({ ...value } as T) : undefined;
}

function cloneContext(context: TaskContext): TaskContext {
  return {
    ...context,
    issue: cloneReference(context.issue),
    pullRequest: cloneReference(context.pullRequest),
  };
}

function applyLimits(contexts: TaskContext[]): TaskContext[] {
  const projectCounts = new Map<string, number>();
  const limited: TaskContext[] = [];

  for (const context of [...contexts].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  )) {
    const projectCount = projectCounts.get(context.projectId) ?? 0;
    if (projectCount >= TASK_CONTEXT_LIMITS.perProject) continue;
    projectCounts.set(context.projectId, projectCount + 1);
    limited.push(context);
    if (limited.length >= TASK_CONTEXT_LIMITS.total) break;
  }

  return limited;
}

function parseConfig(contents: string): TaskContext[] {
  const parsed: unknown = JSON.parse(contents);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    return [];
  const candidate = parsed as Record<string, unknown>;
  if (candidate.version !== 1 || !Array.isArray(candidate.contexts)) return [];
  return applyLimits(candidate.contexts.filter(isTaskContext).map(cloneContext));
}

function validateCreateInput(input: CreateTaskContextInput): void {
  if (
    !isBoundedText(input.projectId, MAX_ID_LENGTH) ||
    !isBoundedText(input.branch, MAX_BRANCH_LENGTH) ||
    (input.environmentInstanceId !== undefined &&
      !isBoundedText(input.environmentInstanceId, MAX_ID_LENGTH)) ||
    (input.worktreeId !== undefined &&
      !isBoundedText(input.worktreeId, MAX_ID_LENGTH)) ||
    (input.issue !== undefined && !isReference(input.issue)) ||
    (input.pullRequest !== undefined && !isReference(input.pullRequest))
  ) {
    throw new TaskContextRepositoryError(
      'TASK_CONTEXT_INVALID',
      'O contexto da tarefa possui dados inválidos.',
    );
  }
}

export class TaskContextRepository {
  private readonly directory: string;
  private readonly file: string;
  private contexts: TaskContext[];
  private mutationQueue: Promise<void> = Promise.resolve();

  public constructor(
    directory = resolveConfigDirectory(),
    private readonly now: () => Date = () => new Date(),
  ) {
    this.directory = directory;
    this.file = path.join(directory, 'task-contexts.json');
    try {
      this.contexts = parseConfig(readFileSync(this.file, 'utf8'));
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        quarantineUnreadableStateFile(this.file);
      }
      this.contexts = [];
    }
  }

  public get filePath(): string {
    return this.file;
  }

  public list(projectId?: string): readonly TaskContext[] {
    return this.contexts
      .filter((context) => projectId === undefined || context.projectId === projectId)
      .map(cloneContext);
  }

  public find(id: string): TaskContext | null {
    const context = this.contexts.find((item) => item.id === id);
    return context ? cloneContext(context) : null;
  }

  public findByEnvironment(
    projectId: string,
    environmentInstanceId: string,
  ): TaskContext | null {
    const context = this.contexts.find(
      (item) =>
        item.projectId === projectId &&
        item.environmentInstanceId === environmentInstanceId,
    );
    return context ? cloneContext(context) : null;
  }

  public async create(input: CreateTaskContextInput): Promise<TaskContext> {
    validateCreateInput(input);
    const timestamp = this.now().toISOString();
    const context: TaskContext = {
      id: randomUUID(),
      projectId: input.projectId,
      branch: input.branch,
      ...(input.environmentInstanceId
        ? { environmentInstanceId: input.environmentInstanceId }
        : {}),
      ...(input.worktreeId ? { worktreeId: input.worktreeId } : {}),
      ...(input.issue ? { issue: { ...input.issue } } : {}),
      ...(input.pullRequest ? { pullRequest: { ...input.pullRequest } } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.mutate((contexts) =>
      applyLimits([
        context,
        ...contexts.filter((item) => item.id !== context.id),
      ]),
    );
    return cloneContext(context);
  }

  public async update(
    id: string,
    input: UpdateTaskContextInput,
  ): Promise<TaskContext> {
    let updated: TaskContext | null = null;

    await this.mutate((contexts) => {
      const current = contexts.find((context) => context.id === id);
      if (!current) {
        throw new TaskContextRepositoryError(
          'TASK_CONTEXT_NOT_FOUND',
          'O contexto da tarefa não foi encontrado.',
        );
      }

      const next: TaskContext = {
        ...current,
        ...(input.branch !== undefined ? { branch: input.branch } : {}),
        updatedAt: this.now().toISOString(),
      };

      if ('environmentInstanceId' in input) {
        if (input.environmentInstanceId === null) {
          delete next.environmentInstanceId;
        } else {
          next.environmentInstanceId = input.environmentInstanceId;
        }
      }
      if ('worktreeId' in input) {
        if (input.worktreeId === null) {
          delete next.worktreeId;
        } else {
          next.worktreeId = input.worktreeId;
        }
      }
      if ('issue' in input) {
        if (input.issue === null) delete next.issue;
        else next.issue = input.issue ? { ...input.issue } : undefined;
      }
      if ('pullRequest' in input) {
        if (input.pullRequest === null) delete next.pullRequest;
        else
          next.pullRequest = input.pullRequest
            ? { ...input.pullRequest }
            : undefined;
      }

      validateCreateInput(next);
      updated = next;
      return applyLimits(
        contexts.map((context) => (context.id === id ? next : context)),
      );
    });

    if (!updated) {
      throw new TaskContextRepositoryError(
        'TASK_CONTEXT_NOT_FOUND',
        'O contexto da tarefa não foi encontrado.',
      );
    }
    return cloneContext(updated);
  }

  public async remove(id: string): Promise<void> {
    await this.mutate((contexts) => {
      if (!contexts.some((context) => context.id === id)) {
        throw new TaskContextRepositoryError(
          'TASK_CONTEXT_NOT_FOUND',
          'O contexto da tarefa não foi encontrado.',
        );
      }
      return contexts.filter((context) => context.id !== id);
    });
  }

  private async mutate(
    mutation: (contexts: TaskContext[]) => TaskContext[],
  ): Promise<void> {
    const operation = this.mutationQueue.then(async () => {
      const next = mutation(this.contexts.map(cloneContext));
      await fsPromises.mkdir(this.directory, { recursive: true, mode: 0o700 });
      const temporaryFile = `${this.file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
      await fsPromises.writeFile(
        temporaryFile,
        `${JSON.stringify({ version: 1, contexts: next } satisfies TaskContextConfig, null, 2)}\n`,
        { encoding: 'utf8', mode: 0o600 },
      );
      await fsPromises.rename(temporaryFile, this.file);
      this.contexts = next;
    });

    this.mutationQueue = operation.catch(() => undefined);
    await operation;
  }
}
