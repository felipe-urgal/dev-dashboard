import { createHash, randomUUID } from 'node:crypto';

import type {
  TaskContext,
  TaskContextSnapshot,
} from '@dev-dashboard/contracts';
import type {
  ActivityEventRepository,
  AppendActivityEventInput,
} from '@dev-dashboard/core';

import { AgentIntegrationDiscoveryError } from '@dev-dashboard/agent-runtime';
import type {
  AgentAuditSnapshot,
  AgentAuthorization,
  AgentConcreteProviderId,
  AgentConversationTurn,
  AgentEvidence,
  AgentIntegration,
  AgentIntegrationAuthenticationHandoff,
  AgentIntegrationAuthenticationRequest,
  AgentIntegrationCapabilityRegistry,
  AgentIntegrationDetails,
  AgentIntegrationInspectRequest,
  AgentIntegrationInstallRequest,
  AgentIntegrationListResult,
  AgentIntegrationSetEnabledRequest,
  AgentIntegrationUninstallRequest,
  AgentIntegrationUninstallResult,
  AgentIntegrationProviderCapabilities,
  AgentGitRefAdoptionRequest,
  AgentIntegrationProviderRegistry,
  AgentTaskBudget,
  AgentAuditStore,
  AgentCapability,
  AgentCheckpointStatus,
  AgentProviderId,
  AgentProviderPreference,
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
  AgentWorkflowUserTurnInput,
} from '@dev-dashboard/agent-runtime';
import type {
  AgentWorkflowRuntime,
  AgentWorkflowRuntimeErrorCode,
} from '@dev-dashboard/agent-runtime';

import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';
import type {
  AgentBacklogIssue,
  AgentBacklogSelection,
} from './github-issue-backlog-service.js';
import { GithubIssueBacklogError } from './github-issue-backlog-service.js';
import type { AgentTaskWorkspaceProvisioningService } from './agent-task-workspace-provisioning-service.js';
import type {
  GitWorktreeLifecycleService,
  PrepareGitWorktreeRemovalResult,
  RemoveGitWorktreeResult,
} from './git-worktree-lifecycle-service.js';

export type AgentRuntimeApiServiceErrorCode =
  | 'AGENT_API_PROJECT_NOT_FOUND'
  | 'AGENT_API_ENVIRONMENT_NOT_FOUND'
  | 'AGENT_API_TASK_CONTEXT_NOT_FOUND'
  | 'AGENT_API_TASK_NOT_FOUND'
  | 'AGENT_API_INVALID_REQUEST'
  | 'AGENT_API_BUDGET_EXCEEDED'
  | 'AGENT_API_EXECUTION_CONFLICT'
  | 'AGENT_API_INTEGRATION_PROVIDER_UNAVAILABLE'
  | 'AGENT_API_INTEGRATION_DISCOVERY_FAILED'
  | 'AGENT_API_BACKLOG_UNAVAILABLE'
  | 'AGENT_API_BACKLOG_ISSUE_NOT_FOUND'
  | 'AGENT_API_WORKSPACE_PROVISIONING_FAILED'
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

export interface AgentBacklogAdoptInput {
  issueNumber?: number;
  environmentInstanceId?: string;
  requestedCapabilities?: readonly AgentCapability[];
}

export type AgentBacklogAdoptResult =
  | {
      status: 'adopted';
      source: string;
      issue: AgentBacklogIssue;
      candidates: [];
      task: AgentTaskRecord;
      reused: boolean;
    }
  | {
      status: 'ambiguous';
      source: string;
      candidates: AgentBacklogIssue[];
      reused: false;
    };

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

export interface AgentProviderPreferenceInput {
  preferredProviderId: 'codex' | 'claude-code';
  fallbackOrder?: Array<'codex' | 'claude-code'>;
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

export type AgentPullRequestFeedbackStatus =
  'no-pull-request' | 'ready' | 'attention' | 'unavailable';

export interface AgentPullRequestFeedback {
  status: AgentPullRequestFeedbackStatus;
  observedAt: string;
  evidence: AgentEvidence[];
  newEvidenceCount: number;
  automaticContinuation: false;
  pullRequest?: {
    number: number;
    url: string;
    headSha?: string;
    ciStatus?: 'success' | 'pending' | 'failure' | 'unknown';
    reviewState?:
      'approved' | 'changes-requested' | 'review-required' | 'unknown';
    unresolvedConversationsCount?: number;
    remoteStatus?:
      'available' | 'unauthenticated' | 'rate-limited' | 'unavailable';
  };
}

export type AgentTaskCleanupStatus =
  | 'not-applicable'
  | 'eligible'
  | 'blocked'
  | 'already-cleaned'
  | 'removed'
  | 'cleanup-required'
  | 'failed'
  | 'unverified';

export interface AgentTaskCleanupResult {
  status: AgentTaskCleanupStatus;
  worktreeId?: string;
  environmentInstanceId?: string;
  confirmationToken?: string;
  expiresAt?: string;
  diagnostic?: string;
}

export interface AgentTaskCompletionResult {
  task: AgentTaskRecord;
  handoffEvidence: AgentEvidence;
  cleanup: AgentTaskCleanupResult;
}

export interface AgentRuntimeApiServicePort {
  listProviders(): Promise<AgentProviderStatus[]>;
  getProviderPreference(
    projectId: string,
  ): Promise<AgentProviderPreference | null>;
  setProviderPreference(
    projectId: string,
    input: AgentProviderPreferenceInput,
  ): Promise<AgentProviderPreference>;
  clearProviderPreference(projectId: string): Promise<void>;
  listIntegrationCapabilities(): AgentIntegrationProviderCapabilities[];
  listIntegrations(
    projectId: string,
    providerId: AgentConcreteProviderId,
    environmentInstanceId?: string,
  ): Promise<AgentIntegrationListResult>;
  inspectIntegration(
    projectId: string,
    providerId: AgentConcreteProviderId,
    input: Omit<AgentIntegrationInspectRequest, 'cwd'>,
    environmentInstanceId?: string,
  ): Promise<AgentIntegrationDetails>;
  installIntegration(
    projectId: string,
    providerId: AgentConcreteProviderId,
    input: Omit<AgentIntegrationInstallRequest, 'cwd'>,
    environmentInstanceId?: string,
  ): Promise<AgentIntegration>;
  prepareIntegrationAuthentication(
    projectId: string,
    providerId: AgentConcreteProviderId,
    input: Omit<AgentIntegrationAuthenticationRequest, 'cwd'>,
    environmentInstanceId?: string,
  ): Promise<AgentIntegrationAuthenticationHandoff>;
  setIntegrationEnabled(
    projectId: string,
    providerId: AgentConcreteProviderId,
    input: Omit<AgentIntegrationSetEnabledRequest, 'cwd'>,
    environmentInstanceId?: string,
  ): Promise<AgentIntegration>;
  uninstallIntegration(
    projectId: string,
    providerId: AgentConcreteProviderId,
    input: Omit<AgentIntegrationUninstallRequest, 'cwd'>,
    environmentInstanceId?: string,
  ): Promise<AgentIntegrationUninstallResult>;
  listTasks(projectId: string): Promise<AgentTaskRecord[]>;
  adoptBacklog?(
    projectId: string,
    input: AgentBacklogAdoptInput,
  ): Promise<AgentBacklogAdoptResult>;
  createTask(
    projectId: string,
    input: AgentTaskCreateInput,
  ): Promise<AgentTaskRecord>;
  getTask(projectId: string, taskId: string): Promise<AgentTaskRecord>;
  adoptGitRef(
    projectId: string,
    taskId: string,
    input: AgentGitRefAdoptionRequest,
  ): Promise<AgentTaskRecord>;
  status(projectId: string, taskId: string): Promise<AgentWorkflowTaskStatus>;
  conversation(
    projectId: string,
    taskId: string,
  ): Promise<AgentConversationTurn[]>;
  execute(
    projectId: string,
    taskId: string,
    providerId?: AgentProviderId,
    userTurn?: AgentWorkflowUserTurnInput,
  ): Promise<AgentWorkflowExecutionResult>;
  cancel(projectId: string, taskId: string): Promise<AgentWorkflowTaskStatus>;
  retry(projectId: string, taskId: string): Promise<AgentTaskRecord>;
  recover(projectId: string, taskId: string): Promise<AgentWorkflowTaskStatus>;
  completeTask(
    projectId: string,
    taskId: string,
    confirmed: boolean,
  ): Promise<AgentTaskCompletionResult>;
  cleanupCompletedTask(
    projectId: string,
    taskId: string,
    confirmationToken: string,
  ): Promise<AgentTaskCleanupResult>;
  resolveCheckpoint(
    projectId: string,
    taskId: string,
    checkpointId: string,
    status: Exclude<AgentCheckpointStatus, 'pending'>,
    continuationInstruction?: string,
  ): Promise<AgentWorkflowCheckpointResolution>;
  activity(projectId: string, taskId: string): Promise<AgentAuditSnapshot>;
  refreshPullRequestFeedback(
    projectId: string,
    taskId: string,
  ): Promise<AgentPullRequestFeedback>;
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
    | 'appendEvidence'
  >;
  providerRegistry: AgentProviderRegistry;
  providerPreferenceStore?: {
    get(projectId: string): Promise<AgentProviderPreference | null>;
    set(preference: AgentProviderPreference): Promise<AgentProviderPreference>;
    clear(projectId: string): Promise<void>;
  };
  integrationCapabilityRegistry?: AgentIntegrationCapabilityRegistry;
  integrationProviderRegistry?: AgentIntegrationProviderRegistry;
  workflowRuntime: Pick<
    AgentWorkflowRuntime,
    | 'status'
    | 'execute'
    | 'cancel'
    | 'retry'
    | 'recover'
    | 'complete'
    | 'resolveCheckpoint'
    | 'shutdown'
  > &
    Partial<Pick<AgentWorkflowRuntime, 'adoptGitRef' | 'conversation'>>;
  projectStore: Pick<ProjectStore, 'findProject'>;
  worktreeLifecycle?: Pick<
    GitWorktreeLifecycleService,
    'prepareRemoval' | 'remove'
  >;
  developmentEnvironmentInstanceStore: Pick<
    DevelopmentEnvironmentInstanceStore,
    'resolveForProject'
  >;
  taskContextRepository?: {
    find(taskContextId: string): TaskContext | null;
    list?(projectId: string): readonly TaskContext[];
    update?(
      taskContextId: string,
      input: {
        environmentInstanceId?: string | null;
        worktreeId?: string | null;
      },
    ): Promise<TaskContext>;
  };
  taskContextCreator?: {
    create(
      projectId: string,
      input: {
        environmentInstanceId?: string;
        issue?: { repository: string; number: number };
      },
    ): Promise<TaskContext>;
  };
  backlogReader?: {
    select(
      projectPath: string,
      issueNumber?: number,
    ): Promise<AgentBacklogSelection>;
  };
  workspaceProvisioner?: Pick<
    AgentTaskWorkspaceProvisioningService,
    'provision'
  >;
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
const MAX_PR_CHECK_NAMES = 6;

function deterministicEvidenceId(
  taskId: string,
  parts: readonly (string | number | undefined)[],
): string {
  return (
    'pr-feedback-' +
    createHash('sha256')
      .update(taskId)
      .update('\0')
      .update(parts.map((part) => String(part ?? '')).join('\0'))
      .digest('hex')
  );
}

function completionEvidenceId(
  taskId: string,
  completedAt: string,
): string {
  return (
    'completion-' +
    createHash('sha256')
      .update(taskId)
      .update('\0')
      .update(completedAt)
      .digest('hex')
  );
}

function cleanupFromPreparation(
  prepared: PrepareGitWorktreeRemovalResult,
): AgentTaskCleanupResult {
  if (prepared.state === 'ready') {
    return {
      status: 'eligible',
      worktreeId: prepared.worktreeId,
      ...(prepared.environmentInstanceId
        ? { environmentInstanceId: prepared.environmentInstanceId }
        : {}),
      ...(prepared.confirmationToken
        ? { confirmationToken: prepared.confirmationToken }
        : {}),
      ...(prepared.expiresAt ? { expiresAt: prepared.expiresAt } : {}),
    };
  }
  if (prepared.state === 'not-found') {
    return { status: 'already-cleaned', worktreeId: prepared.worktreeId };
  }
  return {
    status: 'blocked',
    worktreeId: prepared.worktreeId,
    ...(prepared.environmentInstanceId
      ? { environmentInstanceId: prepared.environmentInstanceId }
      : {}),
    ...(prepared.diagnostic ? { diagnostic: prepared.diagnostic } : {}),
  };
}

function cleanupFromRemoval(
  removed: RemoveGitWorktreeResult,
): AgentTaskCleanupResult {
  const status: AgentTaskCleanupStatus =
    removed.state === 'removed' || removed.state === 'already-absent'
      ? 'removed'
      : removed.state === 'cleanup-required'
        ? 'cleanup-required'
        : removed.state;
  return {
    status,
    worktreeId: removed.worktreeId,
    ...(removed.environmentInstanceId
      ? { environmentInstanceId: removed.environmentInstanceId }
      : {}),
    ...(removed.diagnostic ? { diagnostic: removed.diagnostic } : {}),
  };
}

function uniqueCapabilities(
  capabilities: readonly AgentCapability[],
): AgentCapability[] {
  return [...new Set(capabilities)];
}

export class AgentRuntimeApiService implements AgentRuntimeApiServicePort {
  private readonly now: () => string;
  private readonly createTaskId: () => string;
  private readonly createEvidenceId: () => string;
  private readonly adoptionLocks = new Map<
    string,
    Promise<AgentBacklogAdoptResult>
  >();
  private readonly issueAdoptionLocks = new Map<
    string,
    Promise<AgentBacklogAdoptResult>
  >();

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

  public async getProviderPreference(
    projectId: string,
  ): Promise<AgentProviderPreference | null> {
    this.requireProject(projectId);
    return this.options.providerPreferenceStore?.get(projectId) ?? null;
  }

  public async setProviderPreference(
    projectId: string,
    input: AgentProviderPreferenceInput,
  ): Promise<AgentProviderPreference> {
    this.requireProject(projectId);
    if (!this.options.providerPreferenceStore) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_INVALID_REQUEST',
        'Agent provider preference storage is unavailable.',
      );
    }

    const fallbackOrder: Array<'codex' | 'claude-code'> =
      input.fallbackOrder ??
      (input.preferredProviderId === 'codex' ? ['claude-code'] : ['codex']);
    if (
      new Set(fallbackOrder).size !== fallbackOrder.length ||
      fallbackOrder.includes(input.preferredProviderId)
    ) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_INVALID_REQUEST',
        'Agent provider fallback order is invalid.',
      );
    }

    return this.options.providerPreferenceStore.set({
      projectId,
      preferredProviderId: input.preferredProviderId,
      fallbackOrder: [...fallbackOrder],
      updatedAt: this.now(),
    });
  }

  public async clearProviderPreference(projectId: string): Promise<void> {
    this.requireProject(projectId);
    await this.options.providerPreferenceStore?.clear(projectId);
  }

  public listIntegrationCapabilities(): AgentIntegrationProviderCapabilities[] {
    return this.options.integrationCapabilityRegistry?.list() ?? [];
  }

  public async listIntegrations(
    projectId: string,
    providerId: AgentConcreteProviderId,
    environmentInstanceId?: string,
  ): Promise<AgentIntegrationListResult> {
    this.requireProject(projectId);
    const provider = this.options.integrationProviderRegistry?.get(providerId);
    if (!provider) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_INTEGRATION_PROVIDER_UNAVAILABLE',
        'Agent integration discovery is unavailable for this provider.',
      );
    }

    const executionContext =
      this.options.developmentEnvironmentInstanceStore.resolveForProject(
        projectId,
        environmentInstanceId,
      );
    if (!executionContext || executionContext.runtime !== 'host') {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_ENVIRONMENT_NOT_FOUND',
        'Development environment instance was not found for this project.',
      );
    }

    try {
      return await provider.list({ cwd: executionContext.cwd });
    } catch (error) {
      if (error instanceof AgentIntegrationDiscoveryError) {
        throw new AgentRuntimeApiServiceError(
          error.code === 'provider-unavailable'
            ? 'AGENT_API_INTEGRATION_PROVIDER_UNAVAILABLE'
            : 'AGENT_API_INTEGRATION_DISCOVERY_FAILED',
          error.message,
        );
      }
      throw error;
    }
  }

  public async inspectIntegration(
    projectId: string,
    providerId: AgentConcreteProviderId,
    input: Omit<AgentIntegrationInspectRequest, 'cwd'>,
    environmentInstanceId?: string,
  ): Promise<AgentIntegrationDetails> {
    this.requireProject(projectId);
    const provider = this.options.integrationProviderRegistry?.get(providerId);
    if (!provider?.inspect) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_INTEGRATION_PROVIDER_UNAVAILABLE',
        'Agent integration inspection is unavailable for this provider.',
      );
    }

    const executionContext =
      this.options.developmentEnvironmentInstanceStore.resolveForProject(
        projectId,
        environmentInstanceId,
      );
    if (!executionContext || executionContext.runtime !== 'host') {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_ENVIRONMENT_NOT_FOUND',
        'Development environment instance was not found for this project.',
      );
    }

    try {
      return await provider.inspect({
        ...input,
        cwd: executionContext.cwd,
      });
    } catch (error) {
      if (error instanceof AgentIntegrationDiscoveryError) {
        if (error.code === 'invalid-request') {
          throw new AgentRuntimeApiServiceError(
            'AGENT_API_INVALID_REQUEST',
            error.message,
          );
        }
        throw new AgentRuntimeApiServiceError(
          error.code === 'provider-unavailable'
            ? 'AGENT_API_INTEGRATION_PROVIDER_UNAVAILABLE'
            : 'AGENT_API_INTEGRATION_DISCOVERY_FAILED',
          error.message,
        );
      }
      throw error;
    }
  }

  public async installIntegration(
    projectId: string,
    providerId: AgentConcreteProviderId,
    input: Omit<AgentIntegrationInstallRequest, 'cwd'>,
    environmentInstanceId?: string,
  ): Promise<AgentIntegration> {
    this.requireProject(projectId);
    const provider = this.options.integrationProviderRegistry?.get(providerId);
    if (!provider?.install) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_INTEGRATION_PROVIDER_UNAVAILABLE',
        'Agent integration installation is unavailable for this provider.',
      );
    }

    const executionContext =
      this.options.developmentEnvironmentInstanceStore.resolveForProject(
        projectId,
        environmentInstanceId,
      );
    if (!executionContext || executionContext.runtime !== 'host') {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_ENVIRONMENT_NOT_FOUND',
        'Development environment instance was not found for this project.',
      );
    }

    try {
      return await provider.install({
        ...input,
        cwd: executionContext.cwd,
      });
    } catch (error) {
      if (error instanceof AgentIntegrationDiscoveryError) {
        if (error.code === 'invalid-request') {
          throw new AgentRuntimeApiServiceError(
            'AGENT_API_INVALID_REQUEST',
            error.message,
          );
        }
        throw new AgentRuntimeApiServiceError(
          error.code === 'provider-unavailable'
            ? 'AGENT_API_INTEGRATION_PROVIDER_UNAVAILABLE'
            : 'AGENT_API_INTEGRATION_DISCOVERY_FAILED',
          error.message,
        );
      }
      throw error;
    }
  }

  public async prepareIntegrationAuthentication(
    projectId: string,
    providerId: AgentConcreteProviderId,
    input: Omit<AgentIntegrationAuthenticationRequest, 'cwd'>,
    environmentInstanceId?: string,
  ): Promise<AgentIntegrationAuthenticationHandoff> {
    this.requireProject(projectId);
    const provider = this.options.integrationProviderRegistry?.get(providerId);
    if (!provider?.prepareAuthentication) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_INTEGRATION_PROVIDER_UNAVAILABLE',
        'Agent integration authentication is unavailable for this provider.',
      );
    }

    const executionContext =
      this.options.developmentEnvironmentInstanceStore.resolveForProject(
        projectId,
        environmentInstanceId,
      );
    if (!executionContext || executionContext.runtime !== 'host') {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_ENVIRONMENT_NOT_FOUND',
        'Development environment instance was not found for this project.',
      );
    }

    try {
      return await provider.prepareAuthentication({
        ...input,
        cwd: executionContext.cwd,
      });
    } catch (error) {
      if (error instanceof AgentIntegrationDiscoveryError) {
        if (error.code === 'invalid-request') {
          throw new AgentRuntimeApiServiceError(
            'AGENT_API_INVALID_REQUEST',
            error.message,
          );
        }
        throw new AgentRuntimeApiServiceError(
          error.code === 'provider-unavailable'
            ? 'AGENT_API_INTEGRATION_PROVIDER_UNAVAILABLE'
            : 'AGENT_API_INTEGRATION_DISCOVERY_FAILED',
          error.message,
        );
      }
      throw error;
    }
  }

  public async setIntegrationEnabled(
    projectId: string,
    providerId: AgentConcreteProviderId,
    input: Omit<AgentIntegrationSetEnabledRequest, 'cwd'>,
    environmentInstanceId?: string,
  ): Promise<AgentIntegration> {
    this.requireProject(projectId);
    const provider = this.options.integrationProviderRegistry?.get(providerId);
    if (!provider?.setEnabled) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_INTEGRATION_PROVIDER_UNAVAILABLE',
        'Agent integration enablement is unavailable for this provider.',
      );
    }

    const executionContext =
      this.options.developmentEnvironmentInstanceStore.resolveForProject(
        projectId,
        environmentInstanceId,
      );
    if (!executionContext || executionContext.runtime !== 'host') {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_ENVIRONMENT_NOT_FOUND',
        'Development environment instance was not found for this project.',
      );
    }

    try {
      return await provider.setEnabled({
        ...input,
        cwd: executionContext.cwd,
      });
    } catch (error) {
      if (error instanceof AgentIntegrationDiscoveryError) {
        if (error.code === 'invalid-request') {
          throw new AgentRuntimeApiServiceError(
            'AGENT_API_INVALID_REQUEST',
            error.message,
          );
        }
        throw new AgentRuntimeApiServiceError(
          error.code === 'provider-unavailable'
            ? 'AGENT_API_INTEGRATION_PROVIDER_UNAVAILABLE'
            : 'AGENT_API_INTEGRATION_DISCOVERY_FAILED',
          error.message,
        );
      }
      throw error;
    }
  }

  public async uninstallIntegration(
    projectId: string,
    providerId: AgentConcreteProviderId,
    input: Omit<AgentIntegrationUninstallRequest, 'cwd'>,
    environmentInstanceId?: string,
  ): Promise<AgentIntegrationUninstallResult> {
    this.requireProject(projectId);
    const provider = this.options.integrationProviderRegistry?.get(providerId);
    if (!provider?.uninstall) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_INTEGRATION_PROVIDER_UNAVAILABLE',
        'Agent integration uninstall is unavailable for this provider.',
      );
    }

    const executionContext =
      this.options.developmentEnvironmentInstanceStore.resolveForProject(
        projectId,
        environmentInstanceId,
      );
    if (!executionContext || executionContext.runtime !== 'host') {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_ENVIRONMENT_NOT_FOUND',
        'Development environment instance was not found for this project.',
      );
    }

    try {
      return await provider.uninstall({
        ...input,
        cwd: executionContext.cwd,
      });
    } catch (error) {
      if (error instanceof AgentIntegrationDiscoveryError) {
        if (error.code === 'invalid-request') {
          throw new AgentRuntimeApiServiceError(
            'AGENT_API_INVALID_REQUEST',
            error.message,
          );
        }
        throw new AgentRuntimeApiServiceError(
          error.code === 'provider-unavailable'
            ? 'AGENT_API_INTEGRATION_PROVIDER_UNAVAILABLE'
            : 'AGENT_API_INTEGRATION_DISCOVERY_FAILED',
          error.message,
        );
      }
      throw error;
    }
  }

  public async listTasks(projectId: string): Promise<AgentTaskRecord[]> {
    this.requireProject(projectId);
    return this.options.taskStore.list(projectId);
  }

  public async adoptBacklog(
    projectId: string,
    input: AgentBacklogAdoptInput,
  ): Promise<AgentBacklogAdoptResult> {
    const requestLockKey =
      projectId +
      ':' +
      (input.issueNumber === undefined ? 'next' : input.issueNumber);
    const existing = this.adoptionLocks.get(requestLockKey);
    if (existing) return existing;

    const pending = this.adoptBacklogUnlocked(projectId, input).finally(() => {
      if (this.adoptionLocks.get(requestLockKey) === pending) {
        this.adoptionLocks.delete(requestLockKey);
      }
    });
    this.adoptionLocks.set(requestLockKey, pending);
    return pending;
  }

  private async adoptBacklogUnlocked(
    projectId: string,
    input: AgentBacklogAdoptInput,
  ): Promise<AgentBacklogAdoptResult> {
    const project = this.options.projectStore.findProject(projectId);
    if (!project) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_PROJECT_NOT_FOUND',
        'Project was not found.',
      );
    }
    if (!this.options.backlogReader) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_BACKLOG_UNAVAILABLE',
        'GitHub backlog discovery is unavailable.',
      );
    }

    let selection: AgentBacklogSelection;
    try {
      selection = await this.options.backlogReader.select(
        project.path,
        input.issueNumber,
      );
    } catch (error) {
      if (error instanceof GithubIssueBacklogError) {
        throw new AgentRuntimeApiServiceError(
          error.code === 'GITHUB_BACKLOG_ISSUE_NOT_FOUND'
            ? 'AGENT_API_BACKLOG_ISSUE_NOT_FOUND'
            : 'AGENT_API_BACKLOG_UNAVAILABLE',
          error.message,
        );
      }
      throw error;
    }

    if (selection.status === 'ambiguous') {
      return {
        status: 'ambiguous',
        source: selection.source,
        candidates: selection.candidates,
        reused: false,
      };
    }

    const issueLockKey = projectId + ':issue:' + String(selection.issue.number);
    const existing = this.issueAdoptionLocks.get(issueLockKey);
    if (existing) return existing;

    const pending = this.adoptSelectedBacklogIssue(
      projectId,
      input,
      selection,
    ).finally(() => {
      if (this.issueAdoptionLocks.get(issueLockKey) === pending) {
        this.issueAdoptionLocks.delete(issueLockKey);
      }
    });
    this.issueAdoptionLocks.set(issueLockKey, pending);
    return pending;
  }

  private async adoptSelectedBacklogIssue(
    projectId: string,
    input: AgentBacklogAdoptInput,
    selection: Extract<AgentBacklogSelection, { status: 'selected' }>,
  ): Promise<AgentBacklogAdoptResult> {
    const issue = selection.issue;
    const contexts =
      this.options.taskContextRepository?.list?.(projectId) ?? [];
    let taskContext = [...contexts]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .find(
        (context) =>
          context.issue?.number === issue.number &&
          context.issue.repository.toLowerCase() ===
            issue.repository.toLowerCase(),
      );

    if (!taskContext) {
      if (!this.options.taskContextCreator) {
        throw new AgentRuntimeApiServiceError(
          'AGENT_API_BACKLOG_UNAVAILABLE',
          'Task Context creation is unavailable for backlog adoption.',
        );
      }

      let environmentInstanceId = input.environmentInstanceId;
      if (!environmentInstanceId && this.options.workspaceProvisioner) {
        const project = this.options.projectStore.findProject(projectId);
        if (!project) {
          throw new AgentRuntimeApiServiceError(
            'AGENT_API_PROJECT_NOT_FOUND',
            'Project was not found.',
          );
        }

        const workspace = await this.options.workspaceProvisioner.provision(
          project,
          {
            issueNumber: issue.number,
            issueTitle: issue.title,
          },
        );
        if (workspace.state !== 'ready' || !workspace.environmentInstanceId) {
          throw new AgentRuntimeApiServiceError(
            'AGENT_API_WORKSPACE_PROVISIONING_FAILED',
            workspace.diagnostic ??
              'Agent task workspace could not be provisioned safely.',
          );
        }
        environmentInstanceId = workspace.environmentInstanceId;
      }

      taskContext = await this.options.taskContextCreator.create(projectId, {
        ...(environmentInstanceId ? { environmentInstanceId } : {}),
        issue: {
          repository: issue.repository,
          number: issue.number,
        },
      });
    }

    const existingTasks = await this.options.taskStore.list(projectId);
    const existingTask = [...existingTasks]
      .sort((left, right) =>
        right.task.updatedAt.localeCompare(left.task.updatedAt),
      )
      .find((record) => record.task.taskContextId === taskContext.id);
    if (existingTask) {
      return {
        status: 'adopted',
        source: selection.source,
        issue,
        candidates: [],
        task: existingTask,
        reused: true,
      };
    }

    const task = await this.createTask(projectId, {
      summary: '#' + issue.number + ' — ' + issue.title,
      taskContextId: taskContext.id,
      requestedCapabilities: input.requestedCapabilities ?? [],
    });
    await this.recordActivity({
      projectId,
      ...(task.task.environmentInstanceId
        ? { environmentInstanceId: task.task.environmentInstanceId }
        : {}),
      type: 'agent.backlog.adopted',
      status: 'succeeded',
      summary:
        'GitHub issue #' +
        issue.number +
        ' adopted from backlog via ' +
        selection.source +
        '.',
      occurredAt: this.now(),
      resourceRef: { kind: 'agent-task', id: task.task.id },
      jobId: task.task.id,
    });
    return {
      status: 'adopted',
      source: selection.source,
      issue,
      candidates: [],
      task,
      reused: false,
    };
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

  public async adoptGitRef(
    projectId: string,
    taskId: string,
    input: AgentGitRefAdoptionRequest,
  ): Promise<AgentTaskRecord> {
    await this.getTask(projectId, taskId);
    const adoptGitRef = this.options.workflowRuntime.adoptGitRef;
    if (!adoptGitRef) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_INVALID_REQUEST',
        'Agent Git reference adoption is unavailable.',
      );
    }
    const record = await this.withRuntimeErrors(() =>
      adoptGitRef.call(this.options.workflowRuntime, projectId, taskId, input),
    );
    await this.recordActivity({
      projectId,
      ...(record.task.environmentInstanceId
        ? { environmentInstanceId: record.task.environmentInstanceId }
        : {}),
      type: 'agent.ref.adopted',
      status: 'succeeded',
      summary: 'Existing Git reference adopted for agent task.',
      occurredAt: this.now(),
      resourceRef: { kind: 'agent-task', id: taskId },
      jobId: taskId,
    });
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

  public async conversation(
    projectId: string,
    taskId: string,
  ): Promise<AgentConversationTurn[]> {
    await this.getTask(projectId, taskId);
    const conversation = this.options.workflowRuntime.conversation;
    if (!conversation) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_INVALID_REQUEST',
        'Agent conversation storage is unavailable.',
      );
    }
    return this.withRuntimeErrors(() =>
      conversation.call(this.options.workflowRuntime, projectId, taskId),
    );
  }

  public async execute(
    projectId: string,
    taskId: string,
    providerId?: AgentProviderId,
    userTurn?: AgentWorkflowUserTurnInput,
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
    const pullRequestFeedback = await this.pullRequestFeedback(taskRecord.task);
    if (pullRequestFeedback.evidence.length > 0) {
      await this.options.auditStore.appendEvidence(
        taskId,
        pullRequestFeedback.evidence,
      );
    }
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
          ...(userTurn ? { userTurn } : {}),
          ...(pullRequestFeedback.evidence.length > 0
            ? {
                contextEvidence: pullRequestFeedback.evidence.map(
                  ({ kind, summary, reference, observedAt }) => ({
                    kind,
                    summary,
                    ...(reference ? { reference } : {}),
                    observedAt,
                  }),
                ),
              }
            : {}),
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

  public async completeTask(
    projectId: string,
    taskId: string,
    confirmed: boolean,
  ): Promise<AgentTaskCompletionResult> {
    if (!confirmed) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_INVALID_REQUEST',
        'Agent task completion requires explicit confirmation.',
      );
    }

    const before = await this.getTask(projectId, taskId);
    this.validateTaskContextBinding(before.task);
    const completed = await this.withRuntimeErrors(() =>
      this.options.workflowRuntime.complete(projectId, taskId),
    );
    const completedAt = completed.task.updatedAt;
    const handoffEvidence: AgentEvidence = {
      id: completionEvidenceId(taskId, completedAt),
      taskId,
      kind: 'other',
      summary: 'Agent task completed with explicit operator confirmation.',
      observedAt: completedAt,
    };
    await this.options.auditStore.appendEvidence(taskId, [handoffEvidence]);

    let cleanup: AgentTaskCleanupResult = { status: 'not-applicable' };
    if (completed.task.taskContextId) {
      const context = this.requireTaskContext(
        projectId,
        completed.task.taskContextId,
      );
      if (context.worktreeId && this.options.worktreeLifecycle) {
        const project = this.options.projectStore.findProject(projectId);
        if (!project) {
          throw new AgentRuntimeApiServiceError(
            'AGENT_API_PROJECT_NOT_FOUND',
            'Project was not found.',
          );
        }
        cleanup = cleanupFromPreparation(
          await this.options.worktreeLifecycle.prepareRemoval(
            project,
            context.worktreeId,
          ),
        );
      }
    }

    await this.recordActivity({
      projectId,
      ...(completed.task.environmentInstanceId
        ? { environmentInstanceId: completed.task.environmentInstanceId }
        : {}),
      type: 'agent.completed',
      status: 'succeeded',
      summary:
        cleanup.status === 'eligible'
          ? 'Agent task completed; owned worktree is eligible for confirmed cleanup.'
          : cleanup.status === 'blocked'
            ? 'Agent task completed; cleanup is currently blocked.'
            : 'Agent task completed.',
      occurredAt: completedAt,
      resourceRef: { kind: 'agent-task', id: taskId },
      jobId: taskId,
    });

    return { task: completed, handoffEvidence, cleanup };
  }

  public async cleanupCompletedTask(
    projectId: string,
    taskId: string,
    confirmationToken: string,
  ): Promise<AgentTaskCleanupResult> {
    const record = await this.getTask(projectId, taskId);
    if (record.task.state !== 'completed') {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_INVALID_REQUEST',
        'Only a completed Agent Task can clean up its owned workspace.',
      );
    }
    if (!record.task.taskContextId || !this.options.worktreeLifecycle) {
      return { status: 'not-applicable' };
    }

    const context = this.requireTaskContext(
      projectId,
      record.task.taskContextId,
    );
    if (!context.worktreeId) return { status: 'already-cleaned' };

    const project = this.options.projectStore.findProject(projectId);
    if (!project) {
      throw new AgentRuntimeApiServiceError(
        'AGENT_API_PROJECT_NOT_FOUND',
        'Project was not found.',
      );
    }

    const removed = cleanupFromRemoval(
      await this.options.worktreeLifecycle.remove(project, {
        worktreeId: context.worktreeId,
        confirmationToken,
      }),
    );

    if (
      removed.status === 'removed' &&
      this.options.taskContextRepository?.update
    ) {
      await this.options.taskContextRepository.update(context.id, {
        environmentInstanceId: null,
        worktreeId: null,
      });
    }

    const observedAt = this.now();
    await this.options.auditStore.appendEvidence(taskId, [
      {
        id: this.createEvidenceId(),
        taskId,
        kind: 'other',
        summary:
          removed.status === 'removed'
            ? 'Owned Agent Task worktree cleanup completed.'
            : `Agent Task worktree cleanup result: ${removed.status}.`,
        observedAt,
      },
    ]);
    await this.recordActivity({
      projectId,
      type: 'agent.cleanup.' + removed.status,
      status:
        removed.status === 'removed' || removed.status === 'already-cleaned'
          ? 'succeeded'
          : removed.status === 'blocked' ||
              removed.status === 'cleanup-required' ||
              removed.status === 'unverified'
            ? 'warning'
            : 'failed',
      summary:
        removed.status === 'removed'
          ? 'Agent task owned workspace cleanup completed.'
          : `Agent task workspace cleanup: ${removed.status}.`,
      occurredAt: observedAt,
      resourceRef: { kind: 'agent-task', id: taskId },
      jobId: taskId,
    });
    return removed;
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

  public async refreshPullRequestFeedback(
    projectId: string,
    taskId: string,
  ): Promise<AgentPullRequestFeedback> {
    const record = await this.getTask(projectId, taskId);
    this.validateTaskContextBinding(record.task);
    const before = await this.options.auditStore.snapshot(taskId);
    const feedback = await this.pullRequestFeedback(record.task);
    if (feedback.evidence.length > 0) {
      await this.options.auditStore.appendEvidence(taskId, feedback.evidence);
    }
    const knownIds = new Set(before.evidence.map((item) => item.id));
    const newEvidenceCount = feedback.evidence.filter(
      (item) => !knownIds.has(item.id),
    ).length;

    await this.recordActivity({
      projectId,
      ...(record.task.environmentInstanceId
        ? { environmentInstanceId: record.task.environmentInstanceId }
        : {}),
      type: 'agent.pull-request.feedback',
      status:
        feedback.status === 'attention'
          ? 'warning'
          : feedback.status === 'unavailable'
            ? 'warning'
            : 'succeeded',
      summary:
        feedback.status === 'attention'
          ? 'Pull request feedback requires attention.'
          : feedback.status === 'unavailable'
            ? 'Pull request feedback is unavailable.'
            : feedback.status === 'no-pull-request'
              ? 'Agent task has no associated pull request.'
              : 'Pull request feedback is current.',
      occurredAt: feedback.observedAt,
      resourceRef: { kind: 'agent-task', id: taskId },
      jobId: taskId,
    });

    return {
      ...feedback,
      newEvidenceCount,
      automaticContinuation: false,
    };
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

  private async pullRequestFeedback(
    task: AgentTask,
  ): Promise<
    Omit<AgentPullRequestFeedback, 'newEvidenceCount' | 'automaticContinuation'>
  > {
    const observedAt = this.now();
    if (!task.taskContextId) {
      return { status: 'no-pull-request', observedAt, evidence: [] };
    }

    const context = this.requireTaskContext(task.projectId, task.taskContextId);
    if (!context.pullRequest) {
      return { status: 'no-pull-request', observedAt, evidence: [] };
    }

    if (!this.options.taskContextSnapshotReader) {
      const evidence: AgentEvidence[] = [
        {
          id: deterministicEvidenceId(task.id, [
            context.pullRequest.repository,
            context.pullRequest.number,
            'snapshot-unavailable',
          ]),
          taskId: task.id,
          kind: 'pull-request',
          summary: `PR #${context.pullRequest.number} remote feedback is unavailable.`,
          observedAt,
        },
      ];
      return { status: 'unavailable', observedAt, evidence };
    }

    let snapshot: TaskContextSnapshot;
    try {
      snapshot = await this.options.taskContextSnapshotReader.snapshot(
        task.projectId,
        task.taskContextId,
      );
    } catch {
      const evidence: AgentEvidence[] = [
        {
          id: deterministicEvidenceId(task.id, [
            context.pullRequest.repository,
            context.pullRequest.number,
            'snapshot-failed',
          ]),
          taskId: task.id,
          kind: 'pull-request',
          summary: `PR #${context.pullRequest.number} remote feedback could not be refreshed.`,
          observedAt,
        },
      ];
      return { status: 'unavailable', observedAt, evidence };
    }

    const pullRequest = snapshot.evidence?.pullRequest;
    const pullRequestObservedAt =
      snapshot.evidence?.pullRequestObservedAt ??
      snapshot.evidence?.observedAt ??
      observedAt;
    if (!pullRequest) {
      const evidence: AgentEvidence[] = [
        {
          id: deterministicEvidenceId(task.id, [
            context.pullRequest.repository,
            context.pullRequest.number,
            'remote-missing',
          ]),
          taskId: task.id,
          kind: 'pull-request',
          summary: `PR #${context.pullRequest.number} remote feedback is unavailable or stale.`,
          observedAt: pullRequestObservedAt,
        },
      ];
      return {
        status: 'unavailable',
        observedAt: pullRequestObservedAt,
        evidence,
      };
    }

    const remoteStatus = pullRequest.cockpit?.remoteStatus;
    const ciStatus = pullRequest.ciStatus ?? 'unknown';
    const reviewState = pullRequest.cockpit?.reviewState ?? 'unknown';
    const unresolvedConversationsCount =
      pullRequest.unresolvedConversationsCount ?? 0;
    const headSha = pullRequest.cockpit?.headSha;
    const failedChecks = (pullRequest.cockpit?.checks ?? [])
      .filter((check) => check.status === 'failure')
      .map((check) => check.name.slice(0, 120))
      .slice(0, MAX_PR_CHECK_NAMES);

    const summaryParts = [
      `PR #${pullRequest.number}`,
      `CI ${ciStatus}`,
      `review ${reviewState}`,
      `${unresolvedConversationsCount} unresolved conversation(s)`,
      ...(failedChecks.length > 0
        ? [`failing checks: ${failedChecks.join(', ')}`]
        : []),
      ...(remoteStatus && remoteStatus !== 'available'
        ? [`remote ${remoteStatus}`]
        : []),
    ];
    const evidence: AgentEvidence[] = [
      {
        id: deterministicEvidenceId(task.id, [
          pullRequest.url,
          headSha,
          ciStatus,
          reviewState,
          unresolvedConversationsCount,
          remoteStatus,
          failedChecks.join('|'),
        ]),
        taskId: task.id,
        kind: 'pull-request',
        summary: summaryParts.join('; ') + '.',
        reference: pullRequest.url,
        observedAt: pullRequestObservedAt,
      },
    ];

    const unavailable =
      remoteStatus !== undefined && remoteStatus !== 'available';
    const attention =
      ciStatus === 'failure' ||
      reviewState === 'changes-requested' ||
      unresolvedConversationsCount > 0;

    return {
      status: unavailable ? 'unavailable' : attention ? 'attention' : 'ready',
      observedAt: pullRequestObservedAt,
      evidence,
      pullRequest: {
        number: pullRequest.number,
        url: pullRequest.url,
        ...(headSha ? { headSha } : {}),
        ciStatus,
        reviewState,
        unresolvedConversationsCount,
        ...(remoteStatus ? { remoteStatus } : {}),
      },
    };
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
        (error as { code?: unknown }).code === 'AGENT_TASK_LOCKED'
      ) {
        throw new AgentRuntimeApiServiceError(
          'AGENT_API_EXECUTION_CONFLICT',
          error instanceof Error
            ? error.message
            : 'Agent task already has an active operation.',
        );
      }
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
