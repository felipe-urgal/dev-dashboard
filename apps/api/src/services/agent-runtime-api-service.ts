import { randomUUID } from 'node:crypto';

import type {
  AgentCapability,
  AgentProviderId,
  AgentProviderRegistry,
  AgentProviderStatus,
  AgentTask,
  AgentTaskRecord,
  AgentTaskStore,
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
  | 'AGENT_API_TASK_NOT_FOUND'
  | 'AGENT_API_INVALID_REQUEST'
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
  requestedCapabilities?: readonly AgentCapability[];
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
  shutdown(): Promise<void>;
}

export interface AgentRuntimeApiServiceOptions {
  taskStore: AgentTaskStore;
  providerRegistry: AgentProviderRegistry;
  workflowRuntime: Pick<
    AgentWorkflowRuntime,
    'status' | 'execute' | 'cancel' | 'retry' | 'recover' | 'shutdown'
  >;
  projectStore: Pick<ProjectStore, 'findProject'>;
  developmentEnvironmentInstanceStore: Pick<
    DevelopmentEnvironmentInstanceStore,
    'resolveForProject'
  >;
  now?: () => string;
  createTaskId?: () => string;
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

  public constructor(private readonly options: AgentRuntimeApiServiceOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.createTaskId = options.createTaskId ?? randomUUID;
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

    const executionContext =
      this.options.developmentEnvironmentInstanceStore.resolveForProject(
        projectId,
        input.environmentInstanceId,
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
      state: 'queued',
      summary,
      requestedCapabilities: uniqueCapabilities(
        input.requestedCapabilities ?? [],
      ),
      createdAt: observedAt,
      updatedAt: observedAt,
    };

    return this.options.taskStore.save(task, null);
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
    await this.getTask(projectId, taskId);
    return this.withRuntimeErrors(() =>
      this.options.workflowRuntime.execute({
        projectId,
        taskId,
        ...(providerId ? { providerId } : {}),
      }),
    );
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

    return this.options.workflowRuntime.status(projectId, taskId);
  }

  public async retry(
    projectId: string,
    taskId: string,
  ): Promise<AgentTaskRecord> {
    await this.getTask(projectId, taskId);
    return this.withRuntimeErrors(() =>
      this.options.workflowRuntime.retry(projectId, taskId),
    );
  }

  public async recover(
    projectId: string,
    taskId: string,
  ): Promise<AgentWorkflowTaskStatus> {
    await this.getTask(projectId, taskId);
    await this.withRuntimeErrors(() =>
      this.options.workflowRuntime.recover(projectId, taskId),
    );
    return this.options.workflowRuntime.status(projectId, taskId);
  }

  public async shutdown(): Promise<void> {
    await this.options.workflowRuntime.shutdown();
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
