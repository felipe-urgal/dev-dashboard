import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';

import type {
  ActivityDomain,
  ActivityEvent,
  ActivityEventStatus,
  ActivityResourceRef,
} from '@dev-dashboard/contracts';

import { resolveConfigDirectory } from './config-directory.js';
import {
  isFileNotFoundError,
  quarantineUnreadableStateFile,
} from './state-file-recovery.js';

export interface AppendActivityEventInput {
  projectId: string;
  environmentInstanceId?: string;
  domain: ActivityDomain;
  type: string;
  status?: ActivityEventStatus;
  summary: string;
  occurredAt?: string;
  resourceRef?: ActivityResourceRef;
  jobId?: string;
}

export interface ActivityEventListOptions {
  projectId?: string;
  environmentInstanceId?: string;
  domain?: ActivityDomain;
  limit?: number;
}

export type ActivityEventRepositoryErrorCode = 'ACTIVITY_EVENT_INVALID';

export class ActivityEventRepositoryError extends Error {
  public constructor(
    public readonly code: ActivityEventRepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ActivityEventRepositoryError';
  }
}

interface ActivityEventConfig {
  version: 1;
  events: ActivityEvent[];
}

export const ACTIVITY_EVENT_LIMITS = {
  retentionDays: 30,
  perProject: 200,
  total: 2000,
  summaryCharacters: 240,
  listMaximum: 500,
} as const;

const MAX_ID_LENGTH = 256;
const MAX_TYPE_LENGTH = 128;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

const ACTIVITY_DOMAINS = new Set<ActivityDomain>([
  'process',
  'test',
  'script',
  'git',
  'database',
  'compose',
  'deployment',
  'ci',
  'security',
  'agent',
]);

const ACTIVITY_STATUSES = new Set<ActivityEventStatus>([
  'started',
  'succeeded',
  'failed',
  'cancelled',
  'warning',
]);

function isBoundedText(value: unknown, maximumLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximumLength &&
    !value.includes('\n') &&
    !value.includes('\r') &&
    !value.includes('\0')
  );
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isResourceRef(value: unknown): value is ActivityResourceRef {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const candidate = value as Record<string, unknown>;
  return (
    isBoundedText(candidate.kind, MAX_TYPE_LENGTH) &&
    isBoundedText(candidate.id, MAX_ID_LENGTH)
  );
}

function isActivityEvent(value: unknown): value is ActivityEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const candidate = value as Record<string, unknown>;
  return (
    isBoundedText(candidate.id, MAX_ID_LENGTH) &&
    isBoundedText(candidate.projectId, MAX_ID_LENGTH) &&
    (candidate.environmentInstanceId === undefined ||
      isBoundedText(candidate.environmentInstanceId, MAX_ID_LENGTH)) &&
    typeof candidate.domain === 'string' &&
    ACTIVITY_DOMAINS.has(candidate.domain as ActivityDomain) &&
    isBoundedText(candidate.type, MAX_TYPE_LENGTH) &&
    (candidate.status === undefined ||
      (typeof candidate.status === 'string' &&
        ACTIVITY_STATUSES.has(candidate.status as ActivityEventStatus))) &&
    typeof candidate.summary === 'string' &&
    candidate.summary.length > 0 &&
    candidate.summary.length <= ACTIVITY_EVENT_LIMITS.summaryCharacters &&
    isTimestamp(candidate.occurredAt) &&
    (candidate.resourceRef === undefined ||
      isResourceRef(candidate.resourceRef)) &&
    (candidate.jobId === undefined ||
      isBoundedText(candidate.jobId, MAX_ID_LENGTH))
  );
}

function cloneEvent(event: ActivityEvent): ActivityEvent {
  return {
    ...event,
    ...(event.resourceRef ? { resourceRef: { ...event.resourceRef } } : {}),
  };
}

function sanitizeSummary(value: string): string {
  const printable = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    if ((code >= 0 && code <= 8) || (code >= 11 && code <= 31) || code === 127)
      return ' ';
    return character;
  }).join('');

  return printable
    .split(/\s+/u)
    .filter(Boolean)
    .join(' ')
    .slice(0, ACTIVITY_EVENT_LIMITS.summaryCharacters);
}

function applyLimits(events: ActivityEvent[], now: Date): ActivityEvent[] {
  const cutoff =
    now.getTime() - ACTIVITY_EVENT_LIMITS.retentionDays * DAY_IN_MILLISECONDS;
  const projectCounts = new Map<string, number>();
  const limited: ActivityEvent[] = [];

  for (const event of [...events]
    .filter((item) => Date.parse(item.occurredAt) >= cutoff)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))) {
    const projectCount = projectCounts.get(event.projectId) ?? 0;
    if (projectCount >= ACTIVITY_EVENT_LIMITS.perProject) continue;
    projectCounts.set(event.projectId, projectCount + 1);
    limited.push(event);
    if (limited.length >= ACTIVITY_EVENT_LIMITS.total) break;
  }

  return limited;
}

function parseConfig(contents: string, now: Date): ActivityEvent[] {
  const parsed: unknown = JSON.parse(contents);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    return [];
  const candidate = parsed as Record<string, unknown>;
  if (candidate.version !== 1 || !Array.isArray(candidate.events)) return [];
  return applyLimits(
    candidate.events.filter(isActivityEvent).map(cloneEvent),
    now,
  );
}

function validateInput(input: AppendActivityEventInput): void {
  if (
    !isBoundedText(input.projectId, MAX_ID_LENGTH) ||
    (input.environmentInstanceId !== undefined &&
      !isBoundedText(input.environmentInstanceId, MAX_ID_LENGTH)) ||
    !ACTIVITY_DOMAINS.has(input.domain) ||
    !isBoundedText(input.type, MAX_TYPE_LENGTH) ||
    (input.status !== undefined && !ACTIVITY_STATUSES.has(input.status)) ||
    typeof input.summary !== 'string' ||
    (input.occurredAt !== undefined && !isTimestamp(input.occurredAt)) ||
    (input.resourceRef !== undefined && !isResourceRef(input.resourceRef)) ||
    (input.jobId !== undefined && !isBoundedText(input.jobId, MAX_ID_LENGTH))
  ) {
    throw new ActivityEventRepositoryError(
      'ACTIVITY_EVENT_INVALID',
      'O evento de atividade possui dados inválidos.',
    );
  }
}

export class ActivityEventRepository {
  private readonly directory: string;
  private readonly file: string;
  private events: ActivityEvent[];
  private mutationQueue: Promise<void> = Promise.resolve();

  public constructor(
    directory = resolveConfigDirectory(),
    private readonly now: () => Date = () => new Date(),
  ) {
    this.directory = directory;
    this.file = path.join(directory, 'activity-events.json');
    try {
      this.events = parseConfig(readFileSync(this.file, 'utf8'), this.now());
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        quarantineUnreadableStateFile(this.file);
      }
      this.events = [];
    }
  }

  public get filePath(): string {
    return this.file;
  }

  public list(
    options: ActivityEventListOptions = {},
  ): readonly ActivityEvent[] {
    const requestedLimit = options.limit ?? 100;
    const limit = Math.min(
      Math.max(1, Math.trunc(requestedLimit)),
      ACTIVITY_EVENT_LIMITS.listMaximum,
    );

    return this.events
      .filter(
        (event) =>
          (options.projectId === undefined ||
            event.projectId === options.projectId) &&
          (options.environmentInstanceId === undefined ||
            event.environmentInstanceId === options.environmentInstanceId) &&
          (options.domain === undefined || event.domain === options.domain),
      )
      .slice(0, limit)
      .map(cloneEvent);
  }

  public async append(input: AppendActivityEventInput): Promise<ActivityEvent> {
    validateInput(input);
    const summary = sanitizeSummary(input.summary);
    if (!summary) {
      throw new ActivityEventRepositoryError(
        'ACTIVITY_EVENT_INVALID',
        'O resumo do evento de atividade está vazio.',
      );
    }

    const event: ActivityEvent = {
      id: randomUUID(),
      projectId: input.projectId,
      ...(input.environmentInstanceId
        ? { environmentInstanceId: input.environmentInstanceId }
        : {}),
      domain: input.domain,
      type: input.type,
      ...(input.status ? { status: input.status } : {}),
      summary,
      occurredAt: input.occurredAt ?? this.now().toISOString(),
      ...(input.resourceRef ? { resourceRef: { ...input.resourceRef } } : {}),
      ...(input.jobId ? { jobId: input.jobId } : {}),
    };

    await this.mutate((events) => applyLimits([event, ...events], this.now()));
    return cloneEvent(event);
  }

  private async mutate(
    mutation: (events: ActivityEvent[]) => ActivityEvent[],
  ): Promise<void> {
    const operation = this.mutationQueue.then(async () => {
      const next = mutation(this.events.map(cloneEvent));
      await fsPromises.mkdir(this.directory, { recursive: true, mode: 0o700 });
      const temporaryFile = `${this.file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
      await fsPromises.writeFile(
        temporaryFile,
        `${JSON.stringify({ version: 1, events: next } satisfies ActivityEventConfig, null, 2)}\n`,
        { encoding: 'utf8', mode: 0o600 },
      );
      await fsPromises.rename(temporaryFile, this.file);
      this.events = next;
    });

    this.mutationQueue = operation.catch(() => undefined);
    await operation;
  }
}
