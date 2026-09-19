import type {
  ActivityDomain,
  ActivityEvent,
  ActivityEventStatus,
  ActivityJob,
  ActivitySnapshot,
  GitMutationHistoryEvent,
  ManagedProcess,
  ScriptExecution,
  TestExecutionRecord,
} from '@dev-dashboard/contracts';
import type { ActivityEventRepository } from '@dev-dashboard/core';
import type { ProcessManager } from '@dev-dashboard/process-manager';

import type { GitMutationHistoryService } from './git-mutation-history-service.js';
import type { ScriptExecutionService } from './script-execution-service.js';
import type { TestExecutionHistoryService } from './test-execution-history-service.js';
import type { ProjectStore } from '../store/project-store.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const ACTIVE_PROCESS_STATUSES = new Set(['starting', 'running', 'stopping']);

type ActivityEventStore = Pick<ActivityEventRepository, 'list'>;
type GitHistoryReader = Pick<GitMutationHistoryService, 'history'>;
type TestHistoryReader = Pick<TestExecutionHistoryService, 'history'>;
type ScriptHistoryReader = Pick<ScriptExecutionService, 'history'>;
type ProcessReader = Pick<ProcessManager, 'listProcesses'>;
type ProjectStoreView = Pick<ProjectStore, 'findProject'>;

export interface ActivitySnapshotServiceDependencies {
  eventStore: ActivityEventStore;
  gitHistory: GitHistoryReader;
  testHistory: TestHistoryReader;
  scriptHistory: ScriptHistoryReader;
  processReader: ProcessReader;
  projectStore: ProjectStoreView;
  now?: () => Date;
}

export type ActivitySnapshotServiceErrorCode = 'ACTIVITY_PROJECT_NOT_FOUND';

export class ActivitySnapshotServiceError extends Error {
  public constructor(
    public readonly code: ActivitySnapshotServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ActivitySnapshotServiceError';
  }
}

interface Captured<T> {
  value?: T;
  failed: boolean;
}

async function capture<T>(operation: () => Promise<T>): Promise<Captured<T>> {
  try {
    return { value: await operation(), failed: false };
  } catch {
    return { failed: true };
  }
}

function compactSummary(value: string): string {
  return value.split(/\s+/u).filter(Boolean).join(' ').slice(0, 240);
}

function testStatus(record: TestExecutionRecord): ActivityEventStatus {
  if (record.status === 'failed') return 'failed';
  if (record.status === 'stopped')
    return record.exitCode === undefined || record.exitCode === 0
      ? 'succeeded'
      : 'failed';
  return 'started';
}

function scriptStatus(execution: ScriptExecution): ActivityEventStatus {
  if (execution.status === 'running') return 'started';
  return execution.status;
}

function gitEvent(event: GitMutationHistoryEvent): ActivityEvent {
  return {
    id: `git:${event.id}`,
    projectId: event.projectId,
    domain: 'git',
    type: `git.${event.operationId}`,
    status: event.result,
    summary: compactSummary(`Git: ${event.operationId}`),
    occurredAt: event.occurredAt,
    resourceRef: { kind: 'git-mutation', id: event.id },
  };
}

function testEvent(record: TestExecutionRecord): ActivityEvent {
  return {
    id: `test:${record.id}`,
    projectId: record.projectId,
    ...(record.environmentInstanceId
      ? { environmentInstanceId: record.environmentInstanceId }
      : {}),
    domain: 'test',
    type: `test.${record.commandId}`,
    status: testStatus(record),
    summary: compactSummary(`Testes: ${record.commandId}`),
    occurredAt: record.finishedAt ?? record.startedAt,
    resourceRef: { kind: 'test-execution', id: record.id },
  };
}

function scriptEvent(execution: ScriptExecution): ActivityEvent {
  return {
    id: `script:${execution.id}`,
    projectId: execution.projectId,
    domain: 'script',
    type: `script.${execution.actionId}`,
    status: scriptStatus(execution),
    summary: compactSummary(`Script: ${execution.actionName}`),
    occurredAt: execution.finishedAt ?? execution.startedAt,
    resourceRef: { kind: 'script-execution', id: execution.id },
  };
}

function processDomain(process: ManagedProcess): ActivityDomain {
  if (process.kind === 'test') return 'test';
  if (process.kind === 'script') return 'script';
  return 'process';
}

function processJob(process: ManagedProcess): ActivityJob {
  return {
    id: `process:${process.id}`,
    projectId: process.projectId,
    ...(process.environmentInstanceId
      ? { environmentInstanceId: process.environmentInstanceId }
      : {}),
    domain: processDomain(process),
    action: process.kind,
    status: process.status === 'starting' ? 'queued' : 'running',
    ...(process.startedAt ? { startedAt: process.startedAt } : {}),
    resourceRef: { kind: 'managed-process', id: process.id },
    cancelSupported: true,
  };
}

function scriptJob(execution: ScriptExecution): ActivityJob {
  return {
    id: `script:${execution.id}`,
    projectId: execution.projectId,
    domain: 'script',
    action: compactSummary(execution.actionName),
    status: 'running',
    startedAt: execution.startedAt,
    resourceRef: { kind: 'script-execution', id: execution.id },
    cancelSupported: true,
  };
}

function pushUnavailable(
  unavailable: ActivityDomain[],
  domain: ActivityDomain,
  failed: boolean,
): void {
  if (failed && !unavailable.includes(domain)) unavailable.push(domain);
}

export class ActivitySnapshotService {
  private readonly now: () => Date;

  public constructor(
    private readonly dependencies: ActivitySnapshotServiceDependencies,
  ) {
    this.now = dependencies.now ?? (() => new Date());
  }

  public async readProject(
    projectId: string,
    requestedLimit = DEFAULT_LIMIT,
  ): Promise<ActivitySnapshot> {
    if (!this.dependencies.projectStore.findProject(projectId)) {
      throw new ActivitySnapshotServiceError(
        'ACTIVITY_PROJECT_NOT_FOUND',
        'Projeto não encontrado.',
      );
    }

    const limit = Math.min(Math.max(1, Math.trunc(requestedLimit)), MAX_LIMIT);

    const [git, tests, scripts, processes] = await Promise.all([
      capture(() => this.dependencies.gitHistory.history(projectId, 1, limit)),
      capture(() => this.dependencies.testHistory.history(projectId, 1, limit)),
      capture(() =>
        this.dependencies.scriptHistory.history(projectId, 1, limit),
      ),
      capture(() => this.dependencies.processReader.listProcesses()),
    ]);

    const unavailableDomains: ActivityDomain[] = [];
    pushUnavailable(unavailableDomains, 'git', git.failed);
    pushUnavailable(unavailableDomains, 'test', tests.failed);
    pushUnavailable(unavailableDomains, 'script', scripts.failed);
    pushUnavailable(unavailableDomains, 'process', processes.failed);

    const events: ActivityEvent[] = [
      ...this.dependencies.eventStore.list({ projectId, limit }),
      ...(git.value?.events.map(gitEvent) ?? []),
      ...(tests.value?.items.map(testEvent) ?? []),
      ...(scripts.value?.items.map(scriptEvent) ?? []),
    ]
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, limit);

    const activeProcesses = (processes.value ?? []).filter(
      (process) =>
        process.projectId === projectId &&
        ACTIVE_PROCESS_STATUSES.has(process.status),
    );
    const activeScripts = (scripts.value?.items ?? []).filter(
      (execution) => execution.status === 'running',
    );

    const jobs = [
      ...activeProcesses.map(processJob),
      ...activeScripts.map(scriptJob),
    ].sort((left, right) =>
      (right.startedAt ?? '').localeCompare(left.startedAt ?? ''),
    );

    return {
      generatedAt: this.now().toISOString(),
      partial: unavailableDomains.length > 0,
      unavailableDomains,
      events,
      jobs,
    };
  }
}
