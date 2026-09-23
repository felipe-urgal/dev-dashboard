import { randomUUID } from 'node:crypto';

import type {
  TaskContext,
  TaskContextSnapshot,
} from '@dev-dashboard/contracts';
import type {
  ActivityEventRepository,
  AppendActivityEventInput,
} from '@dev-dashboard/core';

import type {
  AgentAuditSnapshot,
  AgentAuthorization,
  AgentTaskBudget,
  AgentAuditStore,
  AgentCapability,
  AgentCheckpointStatus,
  AgentProviderId,
  AgentProviderRegistry,
  AgentProviderStatus,
  AgentTask,
  AgentTaskRecord,
  AgentTaskStore,
  AgentUsageRecord,
  AgentUsageSummary,
  AgentWorkflowCheckpointResolution,
  AgentWorkflowExecutionResult,
  AgentWorkflowTaskStatus,
} from '@dev-dashboard/agent-runtime';
import type {
  AgentWorkflowRuntime,
  AgentWorkflowRuntimeErrorCode,
} from '@dev-dashboard/agent-runtime';

import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';

export type AgentRuntimeApiServiceErrorCode =
  | 'AGENT_API_PROJECT_NOT_FOUND'
  | 'AGENT_API_ENVIRONMENT_NOT_FOUND'
  | 'AGENT_API_TASK_CONTEXT_NOT_FOUND'
  | 'AGENT_API_TASK_NOT_FOUND'
  | 'AGENT_API_INVALID_REQUEST'
  | 'AGENT_API_BUDGET_EXCEEDED'
  | AgentWorkflowRuntimeErrorCode;

export class AgentRuntimeApiServiceError extends Error {
  public constructor(
    public readonly code: AgentRuntimeApiServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AgentRuntimeApiServiceError';
  }
}

export interface AgentTaskCreateInput {
  summary: string;
  environmentInstanceId?: string;
  taskContextId?: string;
  requestedCapabilities?: readonly AgentCapability[];
}

export interface AgentUsageOverview {
  total: AgentUsageSummary;
  byProvider: Partial<
    Record<'codex' | 'claude-code' | 'chatgpt-browser', AgentUsageSummary>
  >;
}

export interface AgentUsagePeriod {
  observedFrom?: string;
  observedTo?: string;
}

export interface AgentTaskBudgetInput {
  maxTotalTokens?: number;
  maxEstimatedCostUsd?: number;
  mode?: 'soft' | 'hard';
}

export interface AgentBudgetAlert {
  kind: 'total-tokens' | 'estimated-cost-usd';
  observed: number;
  threshold: number;
}

export interface AgentBudgetOverview {
  budget: AgentTaskBudget | null;
  usage: AgentUsageSummary;
  alerts: AgentBudgetAlert[];
  blocking: boolean;
}

export interface AgentRuntimeApiServicePort {
  listProviders(): Promise<AgentProviderStatus[]>;
  listTasks(projectId: string): Promise<AgentTaskRecord[]>;
  createTask(
    projectId: string,
    input: AgentTaskCreateInput,
  ): Promise<AgentTaskRecord>;
  getTask(projectId: string, taskId: string): Promise<AgentTaskRecord>;
  status(projectId: string, taskId: string): Promise<AgentWorkflowTaskStatus>;
  execute(
    projectId: string,
    taskId: string,
    providerId?: AgentProviderId,
  ): Promise<AgentWorkflowExecutionResult>;
  cancel(projectId: string, taskId: string): Promise<AgentWorkflowTaskStatus>;
  retry(projectId: string, taskId: string): Promise<AgentTaskRecord>;
  recover(projectId: string, taskId: string): Promise<AgentWorkflowTaskStatus>;
  resolveCheckpoint(
    projectId: string,
    taskId: string,
    checkpointId: string,
    status: Exclude<AgentCheckpointStatus, 'pending'>,
    continuationInstruction?: string,
  ): Promise<AgentWorkflowCheckpointResolution>;
  activity(projectId: string, taskId: string): Promise<AgentAuditSnapshot>;
  usage(
    projectId: string,
    taskId?: string,
    period?: AgentUsagePeriod,
  ): Promise<AgentUsageOverview>;
  budget(projectId: string, taskId: string): Promise<AgentBudgetOverview>;
  setBudget(
    projectId: string,
    taskId: string,
    input: AgentTaskBudgetInput,
  ): Promise<AgentBudgetOverview>;
  clearBudget(projectId: string, taskId: string): Promise<AgentBudgetOverview>;
  setAuthorization(
    projectId: string,
    taskId: string,
    capability: AgentCapability,
    granted: boolean,
  ): Promise<AgentAuthorization>;
  shutdown(): Promise<void>;
}

export interface AgentRuntimeApiServiceOptions {
  taskStore: AgentTaskStore;
  auditStore: Pick<
    AgentAuditStore,
    | 'snapshot'
    | 'listAuthorizations'
    | 'setAuthorization'
    | 'appendExecutionResult'
  >;
  providerRegistry: AgentProviderRegistry;
  workflowRuntime: Pick<
    AgentWorkflowRuntime,
    | 'status'
    | 'execute'
    | 'cancel'
    | 'retry'
    | 'recover'
    | 'resolveCheckpoint'
    | 'shutdown'
  >;
  projectStore: Pick<ProjectStore, 'findProject'>;
  developmentEnvironmentInstanceStore: Pick<
    DevelopmentEnvironmentInstanceStore,
    'resolveForProject'
  >;
  taskContextRepository?: {
    find(taskContextId: string): TaskContext | null;
  };
  taskContextSnapshotReader?: {
    snapshot(
      projectId: string,
      taskContextId: string,
    ): Promise<TaskContextSnapshot>;
  };
  activityEventStore?: Pick<ActivityEventRepository, 'append'>;
  usageStore?: {
    append(record: AgentUsageRecord): Promise<AgentUsageRecord>;
    summary?(query?: {
      projectId?: string;
      taskId?: string;
      providerId?: 'codex' | 'claude-code' | 'chatgpt-browser';
      observedFrom?: string;
      observedTo?: string;
    }): Promise<AgentUsageSummary>;
  };
  budgetStore?: {
    get(projectId: string, taskId: string): Promise<AgentTaskBudget | null>;
    set(budget: AgentTaskBudget): Promise<AgentTaskBudget>;
    clear(projectId: string, taskId: string): Promise<void>;
  };
  now?: () => string;
  createTaskId?: () => string;
  createEvidenceId?: () => string;
}

const MAX_SUMMARY_CHARS = 4_000;

function uniqueCapabilities(
  capabilities: readonly AgentCapability[],
): AgentCapability[] {
  return [...new Set(capabilities)];
}

export class AgentRuntimeApiService implements AgentRuntimeApiServicePort {
  private readonly now: () => string;
  private readonly createTaskId: () => string;
  private readonly createEvidenceId: () => string;

  public constructor(private readonly options: AgentRuntimeApiServiceOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.createTaskId = options.createTaskId ?? randomUUID;
    this.createEvidenceId = options.createEvidenceId ?? randomUUID;
  }

  public async listProviders(): Promise<AgentProviderStatus[]> {
    return Promise.all(
      this.options.providerRegistry.list().map((provider) => provider.status()),
    );
  }

  public async listTasks(projectId: string): Promise<AgentTaskRecord[]> {
    this.requireProject(projectId);
    return this.options.taskStore.list(projectId);
  }

  public async createTask(
    projectId: string,
    input: AgentTaskCreateInput,
  ): Promise<AgentTaskRecord> {
    this.requireProject(projectId);

    const summary = input.summary.trim();
    if (!summary || summary.length > MAX_SUMMARY_CHARS) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_INVALID_REQUEST',
        'Agent task summary is invalid.',
      );
    }

    const taskContext = input.taskContextId
      ? this.requireTaskContext(projectId, input.taskContextId)
      : null;
    if (
      taskContext?.environmentInstanceId &&
      input.environmentInstanceId &&
      taskContext.environmentInstanceId !== input.environmentInstanceId
    ) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_INVALID_REQUEST',
        'Agent task environment must match the selected Task Context.',
      );
    }

    const requestedEnvironmentInstanceId =
      taskContext?.environmentInstanceId ?? input.environmentInstanceId;
    const executionContext =
      this.options.developmentEnvironmentInstanceStore.resolveForProject(
        projectId,
        requestedEnvironmentInstanceId,
      );
    if (!executionContext) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_ENVIRONMENT_NOT_FOUND',
        'Development environment instance was not found for this project.',
      );
    }

    const taskId = this.createTaskId().trim();
    if (!taskId) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_INVALID_REQUEST',
        'Agent task identity could not be created.',
      );
    }

    const observedAt = this.now();
    const task: AgentTask = {
      id: taskId,
      projectId,
      environmentInstanceId: executionContext.environmentInstanceId,
      ...(taskContext ? { taskContextId: taskContext.id } : {}),
      state: 'queued',
      summary,
      requestedCapabilities: uniqueCapabilities(
        input.requestedCapabilities ?? [],
      ),
      createdAt: observedAt,
      updatedAt: observedAt,
    };

    const record = await this.options.taskStore.save(task, null);
    await this.recordActivity({
      projectId,
      ...(task.environmentInstanceId
        ? { environmentInstanceId: task.environmentInstanceId }
        : {}),
      type: 'agent.task.created',
      status: 'started',
      summary: 'Agent task created.',
      occurredAt: observedAt,
      resourceRef: { kind: 'agent-task', id: task.id },
      jobId: task.id,
    });
    return record;
  }

  public async getTask(
    projectId: string,
    taskId: string,
  ): Promise<AgentTaskRecord> {
    this.requireProject(projectId);
    const record = await this.options.taskStore.get(taskId);
    if (!record || record.task.projectId !== projectId) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_TASK_NOT_FOUND',
        'Agent task was not found.',
      );
    }
    return record;
  }

  public async status(
    projectId: string,
    taskId: string,
  ): Promise<AgentWorkflowTaskStatus> {
    await this.getTask(projectId, taskId);
    return this.withRuntimeErrors(() =>
      this.options.workflowRuntime.status(projectId, taskId),
    );
  }

  public async execute(
    projectId: string,
    taskId: string,
    providerId?: AgentProviderId,
  ): Promise<AgentWorkflowExecutionResult> {
    const taskRecord = await this.getTask(projectId, taskId);
    this.validateTaskContextBinding(taskRecord.task);
    const budgetOverview = await this.budget(projectId, taskId);
    if (budgetOverview.blocking) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_BUDGET_EXCEEDED',
        'Agent hard budget has been reached. Adjust or remove the budget before starting a new execution.',
      );
    }
    const authorizations =
      await this.options.auditStore.listAuthorizations(taskId);
    await this.recordActivity({
      projectId,
      ...(taskRecord.task.environmentInstanceId
        ? { environmentInstanceId: taskRecord.task.environmentInstanceId }
        : {}),
      type: 'agent.execution.started',
      status: 'started',
      summary: 'Agent execution started.',
      occurredAt: this.now(),
      resourceRef: { kind: 'agent-task', id: taskId },
      jobId: taskId,
    });

    let result: AgentWorkflowExecutionResult;
    try {
      result = await this.withRuntimeErrors(() =>
        this.options.workflowRuntime.execute({
          projectId,
          taskId,
          ...(providerId ? { providerId } : {}),
          authorizations,
        }),
      );
    } catch (error) {
      await this.recordActivity({
        projectId,
        ...(taskRecord.task.environmentInstanceId
          ? { environmentInstanceId: taskRecord.task.environmentInstanceId }
          : {}),
        type: 'agent.execution.failed',
        status: 'failed',
        summary: 'Agent execution failed.',
        occurredAt: this.now(),
        resourceRef: { kind: 'agent-task', id: taskId },
        jobId: taskId,
      });
      throw error;
    }

    const providerEvidence = (result.providerResult.evidence ?? []).map(
      (item) => ({
        ...item,
        taskId,
        executionId: result.execution.id,
      }),
    );
    const contextEvidence = await this.taskContextEvidence(
      taskRecord.task,
      result.execution.id,
    );
    const evidence = [...providerEvidence, ...contextEvidence];
    await this.options.auditStore.appendExecutionResult(
      taskId,
      result.execution.id,
      result.providerResult.providerId,
      result.providerResult.summary,
      result.execution.finishedAt ?? this.now(),
      evidence,
    );

    if (result.execution.usage && this.options.usageStore) {
      try {
        await this.options.usageStore.append({
          executionId: result.execution.id,
          taskId,
          projectId,
          providerId: result.execution.providerId,
          observedAt: result.execution.finishedAt ?? this.now(),
          usage: result.execution.usage,
        });
      } catch {
        // Usage is observational and must not change execution authority/state.
      }
    }

    await this.recordActivity({
      projectId,
      ...(result.execution.environmentInstanceId
        ? { environmentInstanceId: result.execution.environmentInstanceId }
        : {}),
      type: 'agent.provider.selected',
      status: 'succeeded',
      summary: `Agent provider selected: ${result.providerResult.providerId}.`,
      occurredAt: result.execution.finishedAt ?? this.now(),
      resourceRef: { kind: 'agent-task', id: taskId },
      jobId: taskId,
    });
    await this.recordActivity({
      projectId,
      ...(result.execution.environmentInstanceId
        ? { environmentInstanceId: result.execution.environmentInstanceId }
        : {}),
      type: `agent.execution.${result.providerResult.outcome}`,
      status:
        result.providerResult.outcome === 'succeeded'
          ? 'succeeded'
          : result.providerResult.outcome === 'cancelled'
            ? 'cancelled'
            : result.providerResult.outcome === 'checkpoint' ||
                result.providerResult.outcome === 'unknown'
              ? 'warning'
              : 'failed',
      summary:
        result.providerResult.outcome === 'succeeded'
          ? 'Agent execution completed.'
          : result.providerResult.outcome === 'checkpoint'
            ? 'Agent execution opened a checkpoint.'
            : result.providerResult.outcome === 'cancelled'
              ? 'Agent execution was cancelled.'
              : result.providerResult.outcome === 'unknown'
                ? 'Agent execution ended with unknown outcome.'
                : 'Agent execution failed.',
      occurredAt: result.execution.finishedAt ?? this.now(),
      resourceRef: { kind: 'agent-task', id: taskId },
      jobId: taskId,
    });

    return {
      ...result,
      providerResult: {
        ...result.providerResult,
        ...(evidence.length > 0 ? { evidence } : {}),
      },
    };
  }

  public async cancel(
    projectId: string,
    taskId: string,
  ): Promise<AgentWorkflowTaskStatus> {
    const status = await this.status(projectId, taskId);
    if (!status.activeExecution) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_WORKFLOW_CANCEL_NOT_ACTIVE',
        'Agent execution is not active.',
      );
    }

    await this.withRuntimeErrors(async () => {
      this.options.workflowRuntime.cancel({
        ownership: status.activeExecution!,
        requestedAt: this.now(),
      });
    });

    const nextStatus = await this.options.workflowRuntime.status(
      projectId,
      taskId,
    );
    await this.recordActivity({
      projectId,
      ...(nextStatus.task.task.environmentInstanceId
        ? {
            environmentInstanceId: nextStatus.task.task.environmentInstanceId,
          }
        : {}),
      type: 'agent.execution.cancelled',
      status: 'cancelled',
      summary: 'Agent execution cancellation requested.',
      occurredAt: this.now(),
      resourceRef: { kind: 'agent-task', id: taskId },
      jobId: taskId,
    });
    return nextStatus;
  }

  public async retry(
    projectId: string,
    taskId: string,
  ): Promise<AgentTaskRecord> {
    await this.getTask(projectId, taskId);
    const record = await this.withRuntimeErrors(() =>
      this.options.workflowRuntime.retry(projectId, taskId),
    );
    await this.recordActivity({
      projectId,
      ...(record.task.environmentInstanceId
        ? { environmentInstanceId: record.task.environmentInstanceId }
        : {}),
      type: 'agent.retry',
      status: 'started',
      summary: 'Agent task queued for retry.',
      occurredAt: this.now(),
      resourceRef: { kind: 'agent-task', id: taskId },
      jobId: taskId,
    });
    return record;
  }

  public async recover(
    projectId: string,
    taskId: string,
  ): Promise<AgentWorkflowTaskStatus> {
    await this.getTask(projectId, taskId);
    await this.withRuntimeErrors(() =>
      this.options.workflowRuntime.recover(projectId, taskId),
    );
    const nextStatus = await this.options.workflowRuntime.status(
      projectId,
      taskId,
    );
    await this.recordActivity({
      projectId,
      ...(nextStatus.task.task.environmentInstanceId
        ? {
            environmentInstanceId: nextStatus.task.task.environmentInstanceId,
          }
        : {}),
      type: 'agent.recover',
      status: 'succeeded',
      summary: 'Agent task recovery completed.',
      occurredAt: this.now(),
      resourceRef: { kind: 'agent-task', id: taskId },
      jobId: taskId,
    });
    return nextStatus;
  }

  public async resolveCheckpoint(
    projectId: string,
    taskId: string,
    checkpointId: string,
    status: Exclude<AgentCheckpointStatus, 'pending'>,
    continuationInstruction?: string,
  ): Promise<AgentWorkflowCheckpointResolution> {
    const taskRecord = await this.getTask(projectId, taskId);
    const resolution = await this.withRuntimeErrors(() =>
      this.options.workflowRuntime.resolveCheckpoint(
        projectId,
        taskId,
        checkpointId,
        status,
        continuationInstruction,
      ),
    );
    await this.recordActivity({
      projectId,
      ...(taskRecord.task.environmentInstanceId
        ? { environmentInstanceId: taskRecord.task.environmentInstanceId }
        : {}),
      type: `agent.checkpoint.${status}`,
      status: status === 'approved' ? 'succeeded' : 'warning',
      summary:
        status === 'approved'
          ? 'Agent checkpoint approved.'
          : 'Agent checkpoint rejected.',
      occurredAt: this.now(),
      resourceRef: { kind: 'agent-task', id: taskId },
      jobId: taskId,
    });
    return resolution;
  }

  public async activity(
    projectId: string,
    taskId: string,
  ): Promise<AgentAuditSnapshot> {
    await this.getTask(projectId, taskId);
    return this.options.auditStore.snapshot(taskId);
  }

  public async usage(
    projectId: string,
    taskId?: string,
    period: AgentUsagePeriod = {},
  ): Promise<AgentUsageOverview> {
    this.requireProject(projectId);
    if (taskId) await this.getTask(projectId, taskId);

    const usageStore = this.options.usageStore;
    if (!usageStore?.summary) {
      return {
        total: { executionCount: 0 },
        byProvider: {},
      };
    }

    const observedFrom =
      period.observedFrom !== undefined
        ? Date.parse(period.observedFrom)
        : null;
    const observedTo =
      period.observedTo !== undefined ? Date.parse(period.observedTo) : null;
    if (
      (observedFrom !== null && !Number.isFinite(observedFrom)) ||
      (observedTo !== null && !Number.isFinite(observedTo)) ||
      (observedFrom !== null &&
        observedTo !== null &&
        observedFrom > observedTo)
    ) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_INVALID_REQUEST',
        'Agent usage period is invalid.',
      );
    }

    const query = {
      projectId,
      ...(taskId ? { taskId } : {}),
      ...(period.observedFrom ? { observedFrom: period.observedFrom } : {}),
      ...(period.observedTo ? { observedTo: period.observedTo } : {}),
    };
    const [total, codex, claudeCode, chatgptBrowser] = await Promise.all([
      usageStore.summary(query),
      usageStore.summary({ ...query, providerId: 'codex' }),
      usageStore.summary({ ...query, providerId: 'claude-code' }),
      usageStore.summary({ ...query, providerId: 'chatgpt-browser' }),
    ]);

    return {
      total,
      byProvider: {
        ...(codex.executionCount > 0 ? { codex } : {}),
        ...(claudeCode.executionCount > 0 ? { 'claude-code': claudeCode } : {}),
        ...(chatgptBrowser.executionCount > 0
          ? { 'chatgpt-browser': chatgptBrowser }
          : {}),
      },
    };
  }

  public async budget(
    projectId: string,
    taskId: string,
  ): Promise<AgentBudgetOverview> {
    await this.getTask(projectId, taskId);
    const [budget, usage] = await Promise.all([
      this.options.budgetStore?.get(projectId, taskId) ?? Promise.resolve(null),
      this.options.usageStore?.summary?.({ projectId, taskId }) ??
        Promise.resolve({ executionCount: 0 }),
    ]);

    const alerts = this.evaluateBudgetAlerts(budget, usage);
    return {
      budget,
      usage,
      alerts,
      blocking: budget?.mode === 'hard' && alerts.length > 0,
    };
  }

  public async setBudget(
    projectId: string,
    taskId: string,
    input: AgentTaskBudgetInput,
  ): Promise<AgentBudgetOverview> {
    await this.getTask(projectId, taskId);
    const maxTotalTokens = input.maxTotalTokens;
    const maxEstimatedCostUsd = input.maxEstimatedCostUsd;
    const mode = input.mode ?? 'soft';
    if (
      (maxTotalTokens === undefined && maxEstimatedCostUsd === undefined) ||
      (maxTotalTokens !== undefined &&
        (!Number.isSafeInteger(maxTotalTokens) || maxTotalTokens <= 0)) ||
      (maxEstimatedCostUsd !== undefined &&
        (!Number.isFinite(maxEstimatedCostUsd) || maxEstimatedCostUsd <= 0)) ||
      (mode !== 'soft' && mode !== 'hard')
    ) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_INVALID_REQUEST',
        'Agent task budget is invalid.',
      );
    }
    if (!this.options.budgetStore) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_INVALID_REQUEST',
        'Agent task budgets are unavailable.',
      );
    }

    await this.options.budgetStore.set({
      projectId,
      taskId,
      ...(maxTotalTokens !== undefined ? { maxTotalTokens } : {}),
      ...(maxEstimatedCostUsd !== undefined ? { maxEstimatedCostUsd } : {}),
      mode,
      updatedAt: this.now(),
    });
    return this.budget(projectId, taskId);
  }

  public async clearBudget(
    projectId: string,
    taskId: string,
  ): Promise<AgentBudgetOverview> {
    await this.getTask(projectId, taskId);
    await this.options.budgetStore?.clear(projectId, taskId);
    return this.budget(projectId, taskId);
  }

  private evaluateBudgetAlerts(
    budget: AgentTaskBudget | null,
    usage: AgentUsageSummary,
  ): AgentBudgetAlert[] {
    if (!budget) return [];
    const alerts: AgentBudgetAlert[] = [];
    if (
      budget.maxTotalTokens !== undefined &&
      usage.totalTokens !== undefined &&
      usage.totalTokens >= budget.maxTotalTokens
    ) {
      alerts.push({
        kind: 'total-tokens',
        observed: usage.totalTokens,
        threshold: budget.maxTotalTokens,
      });
    }
    if (
      budget.maxEstimatedCostUsd !== undefined &&
      usage.estimatedCostUsd !== undefined &&
      usage.estimatedCostUsd >= budget.maxEstimatedCostUsd
    ) {
      alerts.push({
        kind: 'estimated-cost-usd',
        observed: usage.estimatedCostUsd,
        threshold: budget.maxEstimatedCostUsd,
      });
    }
    return alerts;
  }

  public async setAuthorization(
    projectId: string,
    taskId: string,
    capability: AgentCapability,
    granted: boolean,
  ): Promise<AgentAuthorization> {
    const record = await this.getTask(projectId, taskId);
    if (!record.task.requestedCapabilities.includes(capability)) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_INVALID_REQUEST',
        'Agent capability was not requested by this task.',
      );
    }

    const observedAt = this.now();
    const authorization = await this.options.auditStore.setAuthorization(
      taskId,
      capability,
      granted,
      observedAt,
    );
    await this.recordActivity({
      projectId,
      ...(record.task.environmentInstanceId
        ? { environmentInstanceId: record.task.environmentInstanceId }
        : {}),
      type: granted
        ? 'agent.authorization.granted'
        : 'agent.authorization.revoked',
      status: granted ? 'succeeded' : 'warning',
      summary: `Agent capability ${capability} ${granted ? 'granted' : 'revoked'}.`,
      occurredAt: observedAt,
      resourceRef: { kind: 'agent-task', id: taskId },
      jobId: taskId,
    });
    return authorization;
  }

  public async shutdown(): Promise<void> {
    await this.options.workflowRuntime.shutdown();
  }

  private async recordActivity(
    input: Omit<AppendActivityEventInput, 'domain'>,
  ): Promise<void> {
    if (!this.options.activityEventStore) return;
    try {
      await this.options.activityEventStore.append({
        ...input,
        domain: 'agent',
      });
    } catch {
      // Activity is observational; it must never become Agent authority.
    }
  }

  private requireTaskContext(
    projectId: string,
    taskContextId: string,
  ): TaskContext {
    const context = this.options.taskContextRepository?.find(taskContextId);
    if (!context || context.projectId !== projectId) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_TASK_CONTEXT_NOT_FOUND',
        'Task Context was not found for this project.',
      );
    }
    if (!context.environmentInstanceId) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_INVALID_REQUEST',
        'Task Context does not identify a Development Environment Instance.',
      );
    }
    return context;
  }

  private validateTaskContextBinding(task: AgentTask): void {
    if (!task.taskContextId) return;
    const context = this.requireTaskContext(task.projectId, task.taskContextId);
    if (context.environmentInstanceId !== task.environmentInstanceId) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_INVALID_REQUEST',
        'Agent task no longer matches its Task Context environment.',
      );
    }
  }

  private async taskContextEvidence(
    task: AgentTask,
    executionId: string,
  ): Promise<
    NonNullable<AgentWorkflowExecutionResult['providerResult']['evidence']>
  > {
    if (!task.taskContextId || !this.options.taskContextSnapshotReader) {
      return [];
    }

    let snapshot: TaskContextSnapshot;
    try {
      snapshot = await this.options.taskContextSnapshotReader.snapshot(
        task.projectId,
        task.taskContextId,
      );
    } catch {
      return [];
    }

    const evidence: NonNullable<
      AgentWorkflowExecutionResult['providerResult']['evidence']
    > = [];
    const observedAt = snapshot.evidence?.observedAt ?? this.now();

    if (snapshot.evidence?.headSha) {
      evidence.push({
        id: this.createEvidenceId(),
        taskId: task.id,
        executionId,
        kind: 'other',
        summary: `Task Context HEAD ${snapshot.evidence.headSha}.`,
        reference: snapshot.evidence.headSha,
        observedAt,
      });
    }

    if (snapshot.evidence?.pullRequest) {
      const pullRequest = snapshot.evidence.pullRequest;
      evidence.push({
        id: this.createEvidenceId(),
        taskId: task.id,
        executionId,
        kind: 'pull-request',
        summary: `PR #${pullRequest.number}: ${pullRequest.title}.`,
        reference: pullRequest.url,
        observedAt: snapshot.evidence.pullRequestObservedAt ?? observedAt,
      });
    }

    if (snapshot.evidence?.readiness) {
      evidence.push({
        id: this.createEvidenceId(),
        taskId: task.id,
        executionId,
        kind: 'readiness',
        summary: `Release Readiness: ${snapshot.evidence.readiness.status}.`,
        observedAt: snapshot.evidence.readiness.observedAt,
      });
    }

    return evidence;
  }

  private requireProject(projectId: string): void {
    if (!this.options.projectStore.findProject(projectId)) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_PROJECT_NOT_FOUND',
        'Project was not found.',
      );
    }
  }

  private async withRuntimeErrors<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        typeof (error as { code?: unknown }).code === 'string' &&
        String((error as { code: string }).code).startsWith('AGENT_WORKFLOW_')
      ) {
        throw new AgentRuntimeApiServiceError(
          (error as { code: AgentWorkflowRuntimeErrorCode }).code,
          error instanceof Error ? error.message : 'Agent workflow failed.',
        );
      }
      throw error;
    }
  }
}
