import { createHash, randomUUID } from 'node:crypto';

import { grantedAgentCapabilities } from './authorization.js';
import type {
  AgentAuthorization,
  AgentCancellationRequest,
  AgentCapability,
  AgentExecution,
  AgentExecutionOwnership,
  AgentProvider,
  AgentProviderId,
  AgentProviderResult,
  AgentTaskRecord,
  AgentTaskStore,
} from './contracts.js';
import {
  AgentRuntimeStateStore,
  type AgentRuntimeState,
} from './runtime-state.js';
import { transitionAgentTask } from './state-machine.js';
import { AgentTaskLockManager } from './task-lock.js';

export type AgentWorkflowRuntimeErrorCode =
  | 'AGENT_WORKFLOW_CLOSING'
  | 'AGENT_WORKFLOW_TASK_NOT_FOUND'
  | 'AGENT_WORKFLOW_TASK_PROJECT_MISMATCH'
  | 'AGENT_WORKFLOW_TASK_NOT_RUNNABLE'
  | 'AGENT_WORKFLOW_PROVIDER_NOT_FOUND'
  | 'AGENT_WORKFLOW_AUTHORIZATION_INVALID'
  | 'AGENT_WORKFLOW_PROVIDER_FAILED'
  | 'AGENT_WORKFLOW_CANCEL_NOT_ACTIVE'
  | 'AGENT_WORKFLOW_CANCEL_OWNERSHIP_MISMATCH'
  | 'AGENT_WORKFLOW_RETRY_NOT_ALLOWED';

export class AgentWorkflowRuntimeError extends Error {
  public constructor(
    public readonly code: AgentWorkflowRuntimeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AgentWorkflowRuntimeError';
  }
}

export interface AgentWorkflowRuntimeOptions {
  taskStore: AgentTaskStore;
  providerRegistry: {
    get(providerId: AgentProviderId): AgentProvider | null;
  };
  runtimeStateStore: AgentRuntimeStateStore;
  lockManager: AgentTaskLockManager;
  now?: () => string;
  createExecutionId?: () => string;
}

export interface AgentWorkflowExecuteRequest {
  projectId: string;
  taskId: string;
  providerId?: AgentProviderId;
  authorizations?: readonly AgentAuthorization[];
}

export interface AgentWorkflowExecutionResult {
  execution: AgentExecution;
  task: AgentTaskRecord;
  providerResult: AgentProviderResult;
}

export interface AgentWorkflowTaskStatus {
  task: AgentTaskRecord;
  runtime: AgentRuntimeState;
  activeExecution?: AgentExecutionOwnership;
}

interface ActiveExecution {
  ownership: AgentExecutionOwnership;
  controller: AbortController;
  done: Promise<void>;
  resolveDone: () => void;
}

function executionLockKey(projectId: string, taskId: string): string {
  return (
    'execution-' +
    createHash('sha256')
      .update(projectId)
      .update('\0')
      .update(taskId)
      .digest('hex')
  );
}

function sameOwnership(
  left: AgentExecutionOwnership,
  right: AgentExecutionOwnership,
): boolean {
  return (
    left.projectId === right.projectId &&
    left.taskId === right.taskId &&
    left.executionId === right.executionId &&
    left.environmentInstanceId === right.environmentInstanceId
  );
}

function executionState(
  result: AgentProviderResult,
): AgentExecution['state'] {
  switch (result.outcome) {
    case 'succeeded':
      return 'succeeded';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'unknown':
      return 'unknown';
  }
}

function taskStateForResult(
  result: AgentProviderResult,
): 'review' | 'failed' | 'cancelled' | 'blocked' {
  switch (result.outcome) {
    case 'succeeded':
      return 'review';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'unknown':
      return 'blocked';
  }
}

export class AgentWorkflowRuntime {
  private readonly taskStore: AgentTaskStore;
  private readonly providerRegistry: AgentWorkflowRuntimeOptions['providerRegistry'];
  private readonly runtimeStateStore: AgentRuntimeStateStore;
  private readonly lockManager: AgentTaskLockManager;
  private readonly now: () => string;
  private readonly createExecutionId: () => string;
  private readonly active = new Map<string, ActiveExecution>();
  private closing = false;

  public constructor(options: AgentWorkflowRuntimeOptions) {
    this.taskStore = options.taskStore;
    this.providerRegistry = options.providerRegistry;
    this.runtimeStateStore = options.runtimeStateStore;
    this.lockManager = options.lockManager;
    this.now = options.now ?? (() => new Date().toISOString());
    this.createExecutionId = options.createExecutionId ?? randomUUID;
  }

  public async status(
    projectId: string,
    taskId: string,
  ): Promise<AgentWorkflowTaskStatus> {
    const task = await this.requireOwnedTask(projectId, taskId);
    const active = this.active.get(taskId);

    return {
      task,
      runtime: await this.runtimeStateStore.read(task),
      ...(active ? { activeExecution: active.ownership } : {}),
    };
  }

  public async execute(
    request: AgentWorkflowExecuteRequest,
  ): Promise<AgentWorkflowExecutionResult> {
    if (this.closing) {
      throw new AgentWorkflowRuntimeError(
        'AGENT_WORKFLOW_CLOSING',
        'Agent workflow runtime is shutting down.',
      );
    }

    const release = await this.lockManager.acquire(
      executionLockKey(request.projectId, request.taskId),
    );

    let active: ActiveExecution | undefined;
    let latestRecord: AgentTaskRecord | undefined;

    try {
      const current = await this.requireOwnedTask(
        request.projectId,
        request.taskId,
      );

      if (current.task.state !== 'queued') {
        throw new AgentWorkflowRuntimeError(
          'AGENT_WORKFLOW_TASK_NOT_RUNNABLE',
          'Agent task must be queued before execution starts.',
        );
      }

      const providerId = request.providerId ?? 'automatic';
      const provider = this.providerRegistry.get(providerId);
      if (!provider) {
        throw new AgentWorkflowRuntimeError(
          'AGENT_WORKFLOW_PROVIDER_NOT_FOUND',
          'Requested agent provider is not registered.',
        );
      }

      const allowedCapabilities = this.allowedCapabilities(
        current,
        request.authorizations ?? [],
      );
      const executionId = this.createExecutionId();
      if (!executionId) {
        throw new AgentWorkflowRuntimeError(
          'AGENT_WORKFLOW_PROVIDER_FAILED',
          'Agent execution identity could not be created.',
        );
      }

      const runningTask = transitionAgentTask(
        current.task,
        'running',
        this.now(),
      );
      const runningRecord = await this.taskStore.save(
        runningTask,
        current.version,
      );
      latestRecord = runningRecord;

      await this.runtimeStateStore.markRunning(runningRecord, executionId);
      await this.runtimeStateStore.recordAttempt(runningRecord);

      const controller = new AbortController();
      let resolveDone = (): void => undefined;
      const done = new Promise<void>((resolve) => {
        resolveDone = resolve;
      });
      const ownership: AgentExecutionOwnership = {
        projectId: runningRecord.task.projectId,
        taskId: runningRecord.task.id,
        executionId,
        ...(runningRecord.task.environmentInstanceId
          ? {
              environmentInstanceId:
                runningRecord.task.environmentInstanceId,
            }
          : {}),
      };
      active = { ownership, controller, done, resolveDone };
      this.active.set(request.taskId, active);

      const startedAt = this.now();
      let providerResult: AgentProviderResult;

      try {
        providerResult = await provider.execute({
          taskId: runningRecord.task.id,
          executionId,
          projectId: runningRecord.task.projectId,
          ...(runningRecord.task.environmentInstanceId
            ? {
                environmentInstanceId:
                  runningRecord.task.environmentInstanceId,
              }
            : {}),
          summary: runningRecord.task.summary,
          allowedCapabilities,
          signal: controller.signal,
        });
      } catch {
        const target = controller.signal.aborted ? 'cancelled' : 'failed';
        const failedTask = transitionAgentTask(
          runningRecord.task,
          target,
          this.now(),
        );
        latestRecord = await this.taskStore.save(
          failedTask,
          runningRecord.version,
        );

        throw new AgentWorkflowRuntimeError(
          'AGENT_WORKFLOW_PROVIDER_FAILED',
          controller.signal.aborted
            ? 'Agent provider execution was cancelled.'
            : 'Agent provider failed before returning a normalized result.',
        );
      }

      const finishedAt = this.now();
      const finalTask = transitionAgentTask(
        runningRecord.task,
        taskStateForResult(providerResult),
        finishedAt,
      );
      latestRecord = await this.taskStore.save(
        finalTask,
        runningRecord.version,
      );

      const execution: AgentExecution = {
        id: executionId,
        taskId: runningRecord.task.id,
        projectId: runningRecord.task.projectId,
        ...(runningRecord.task.environmentInstanceId
          ? {
              environmentInstanceId:
                runningRecord.task.environmentInstanceId,
            }
          : {}),
        requestedProviderId: providerId,
        providerId: providerResult.providerId,
        state: executionState(providerResult),
        startedAt,
        finishedAt,
        ...(providerResult.failure
          ? { failure: providerResult.failure }
          : {}),
      };

      return {
        execution,
        task: latestRecord,
        providerResult,
      };
    } finally {
      try {
        const persisted =
          latestRecord ??
          (await this.taskStore.get(request.taskId));
        if (
          persisted &&
          persisted.task.projectId === request.projectId
        ) {
          await this.runtimeStateStore.markIdle(persisted);
        }
      } finally {
        if (active) {
          if (this.active.get(request.taskId) === active) {
            this.active.delete(request.taskId);
          }
          active.resolveDone();
        }
        await release();
      }
    }
  }

  public async retry(
    projectId: string,
    taskId: string,
  ): Promise<AgentTaskRecord> {
    const release = await this.lockManager.acquire(
      executionLockKey(projectId, taskId),
    );

    try {
      const current = await this.requireOwnedTask(projectId, taskId);
      if (current.task.state !== 'failed') {
        throw new AgentWorkflowRuntimeError(
          'AGENT_WORKFLOW_RETRY_NOT_ALLOWED',
          'Only a known failed agent task can be retried automatically.',
        );
      }

      return this.taskStore.save(
        transitionAgentTask(current.task, 'queued', this.now()),
        current.version,
      );
    } finally {
      await release();
    }
  }

  public async recoverInterrupted(projectId: string): Promise<string[]> {
    const tasks = await this.taskStore.list(projectId);
    return this.runtimeStateStore.recoverInterrupted(tasks);
  }

  public async recover(
    projectId: string,
    taskId: string,
  ): Promise<AgentRuntimeState> {
    const current = await this.requireOwnedTask(projectId, taskId);
    return this.runtimeStateStore.recoverTask(current);
  }

  public cancel(request: AgentCancellationRequest): void {
    const active = this.active.get(request.ownership.taskId);
    if (!active) {
      throw new AgentWorkflowRuntimeError(
        'AGENT_WORKFLOW_CANCEL_NOT_ACTIVE',
        'Agent execution is not active.',
      );
    }

    if (!sameOwnership(active.ownership, request.ownership)) {
      throw new AgentWorkflowRuntimeError(
        'AGENT_WORKFLOW_CANCEL_OWNERSHIP_MISMATCH',
        'Agent execution ownership does not match the active execution.',
      );
    }

    active.controller.abort();
  }

  public async shutdown(): Promise<void> {
    this.closing = true;
    const active = [...this.active.values()];
    for (const execution of active) execution.controller.abort();
    await Promise.all(active.map((execution) => execution.done));
  }

  private allowedCapabilities(
    record: AgentTaskRecord,
    authorizations: readonly AgentAuthorization[],
  ): AgentCapability[] {
    for (const authorization of authorizations) {
      if (authorization.taskId !== record.task.id) {
        throw new AgentWorkflowRuntimeError(
          'AGENT_WORKFLOW_AUTHORIZATION_INVALID',
          'Agent authorization does not belong to the requested task.',
        );
      }
    }

    const granted = new Set(grantedAgentCapabilities(authorizations));
    return record.task.requestedCapabilities.filter((capability) =>
      granted.has(capability),
    );
  }

  private async requireOwnedTask(
    projectId: string,
    taskId: string,
  ): Promise<AgentTaskRecord> {
    const record = await this.taskStore.get(taskId);
    if (!record) {
      throw new AgentWorkflowRuntimeError(
        'AGENT_WORKFLOW_TASK_NOT_FOUND',
        'Agent task was not found.',
      );
    }

    if (record.task.projectId !== projectId) {
      throw new AgentWorkflowRuntimeError(
        'AGENT_WORKFLOW_TASK_PROJECT_MISMATCH',
        'Agent task does not belong to the requested project.',
      );
    }

    return record;
  }
}
