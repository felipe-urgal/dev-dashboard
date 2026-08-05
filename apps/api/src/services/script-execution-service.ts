import { createWriteStream } from 'node:fs';
import type { Writable } from 'node:stream';
import { homedir } from 'node:os';
import path from 'node:path';

import type {
  Project,
  ScriptExecution,
  ScriptExecutionConfirmation,
  ScriptExecutionHistory,
  ScriptExecutionLog,
  ScriptExecutionVariables,
} from '@dev-dashboard/contracts';

import type { ScriptDetectionService } from './script-detection-service.js';
import { prepareScriptConfirmation } from './script-execution/authorization.js';
import {
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_RETENTION_DAYS,
  MAX_RETENTION_SWEEP_INTERVAL_MS,
} from './script-execution/constants.js';
import { closeAllSubscribers, subscribeToExecution } from './script-execution/events.js';
import { ScriptExecutionError } from './script-execution/errors.js';
import { cancelExecution, startExecution } from './script-execution/lifecycle.js';
import type {
  ExecutionSubscriber,
  ScriptExecutionContext,
} from './script-execution/state.js';
import {
  executionHistory,
  getExecution,
  latestExecution,
  pruneHistory,
  readExecutionLog,
  restoreExecutions,
} from './script-execution/store.js';

export { ScriptExecutionError } from './script-execution/errors.js';
export type { ScriptExecutionErrorCode } from './script-execution/errors.js';

export interface ScriptExecutionServiceOptions {
  historyLimit?: number;
  retentionMs?: number;
  sweepIntervalMs?: number;
  createLogStream?: (logPath: string) => Writable;
}

function readPositiveInteger(raw: string | undefined, fallback: number): number {
  const value = Number(raw); return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function positiveOption(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : fallback;
}

export class ScriptExecutionService {
  private readonly context: ScriptExecutionContext;
  private readonly ready: Promise<void>;
  private readonly retentionTimer: NodeJS.Timeout;

  public constructor(
    detection: ScriptDetectionService,
    stateDirectory =
      process.env.DEV_DASHBOARD_STATE_DIR?.trim() ||
      path.join(homedir(), '.local', 'state', 'dev-dashboard'),
    options: ScriptExecutionServiceOptions = {},
  ) {
    const historyLimit = positiveOption(options.historyLimit, readPositiveInteger(process.env.DEV_DASHBOARD_SCRIPT_HISTORY_LIMIT, DEFAULT_HISTORY_LIMIT));
    const retentionMs = positiveOption(options.retentionMs, readPositiveInteger(process.env.DEV_DASHBOARD_LOG_RETENTION_DAYS, DEFAULT_RETENTION_DAYS) * 86_400_000);
    this.context = {
      executions: new Map(),
      activeProjects: new Set(),
      confirmations: new Map(),
      pendingWrites: new Map(),
      subscribers: new Map(),
      eventTimers: new Map(),
      stateDirectory: path.resolve(stateDirectory, 'scripts'),
      historyLimit,
      retentionMs,
      createLogStream: options.createLogStream ?? ((logPath) =>
        createWriteStream(logPath, { flags: 'w', mode: 0o600 })),
      detection,
    };
    this.ready = restoreExecutions(this.context);
    this.retentionTimer = setInterval(() => {
      void this.ready.then(() => pruneHistory(this.context)).catch(() => undefined);
    }, positiveOption(options.sweepIntervalMs, Math.min(retentionMs, MAX_RETENTION_SWEEP_INTERVAL_MS)));
    this.retentionTimer.unref();
  }

  public close(): void {
    clearInterval(this.retentionTimer);
    closeAllSubscribers(this.context);
  }

  public async subscribe(projectId: string, executionId: string, subscriber: ExecutionSubscriber): Promise<() => void> {
    await this.ready;
    return subscribeToExecution(this.context, projectId, executionId, subscriber);
  }

  public async prepareConfirmation(
    project: Project,
    actionId: string,
    receivedVariables: ScriptExecutionVariables = {},
  ): Promise<ScriptExecutionConfirmation> {
    return prepareScriptConfirmation(this.context, project, actionId, receivedVariables);
  }

  public async start(
    project: Project,
    actionId: string,
    confirmationToken?: string,
    receivedVariables: ScriptExecutionVariables = {},
  ): Promise<ScriptExecution> {
    await this.ready;
    return startExecution(this.context, project, actionId, confirmationToken, receivedVariables);
  }

  public async get(projectId: string, executionId: string): Promise<ScriptExecution> {
    await this.ready;
    return getExecution(this.context, projectId, executionId);
  }

  public async latest(projectId: string): Promise<ScriptExecution | null> {
    await this.ready;
    return latestExecution(this.context, projectId);
  }

  public async history(projectId: string, page = 1, pageSize = 20): Promise<ScriptExecutionHistory> {
    await this.ready;
    return executionHistory(this.context, projectId, page, pageSize);
  }

  public async log(projectId: string, executionId: string): Promise<ScriptExecutionLog> {
    await this.ready;
    return readExecutionLog(this.context, projectId, executionId);
  }

  public async cancel(projectId: string, executionId: string): Promise<ScriptExecution> {
    await this.ready;
    return cancelExecution(this.context, projectId, executionId);
  }
}
