import { requestJson } from './core';

export type AgentProviderId =
  'automatic' | 'codex' | 'claude-code' | 'chatgpt-browser';

export type AgentConcreteProviderId = Exclude<AgentProviderId, 'automatic'>;

export type AgentCapability =
  | 'workspace:write'
  | 'git:commit'
  | 'git:push'
  | 'github:pull-request'
  | 'github:merge'
  | 'deployment:run'
  | 'release:run';

export type AgentTaskState =
  | 'queued'
  | 'running'
  | 'checkpoint'
  | 'review'
  | 'blocked'
  | 'failed'
  | 'completed'
  | 'cancelled';

export interface AgentTask {
  id: string;
  projectId: string;
  environmentInstanceId?: string;
  taskContextId?: string;
  state: AgentTaskState;
  summary: string;
  continuationInstruction?: string;
  requestedCapabilities: AgentCapability[];
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface AgentTaskRecord {
  task: AgentTask;
  version: number;
}

export interface AgentBacklogIssue {
  repository: string;
  number: number;
  title: string;
  labels: string[];
}

export type AgentBacklogAdoptionResult =
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

export type AgentProviderDiagnosticCode =
  | 'ready'
  | 'command-unavailable'
  | 'version-unsupported'
  | 'authentication-required'
  | 'preflight-timeout'
  | 'runtime-failed'
  | 'bridge-token-missing'
  | 'bridge-unavailable'
  | 'bridge-unhealthy'
  | 'bridge-paused'
  | 'browser-extension-unavailable'
  | 'browser-extension-stale'
  | 'browser-session-unavailable'
  | 'automatic-unavailable';

export interface AgentProviderStatus {
  providerId: AgentProviderId;
  availability: 'available' | 'degraded' | 'unavailable';
  observedAt: string;
  version?: string;
  selectedProviderId?: AgentConcreteProviderId;
  reason?: string;
  diagnostic?: {
    code: AgentProviderDiagnosticCode;
    evidence?: string;
  };
  quota?: {
    status: 'available' | 'unavailable';
    label?: string;
    used?: number;
    remaining?: number;
    resetAt?: string;
    source: 'provider' | 'unavailable';
    reason?: string;
  };
}

export interface AgentRuntimeState {
  taskId: string;
  projectId: string;
  canonicalVersion: number;
  state: 'idle' | 'running' | 'interrupted';
  executionId?: string;
  processId?: number;
  attempts: number;
  startedAt?: string;
  updatedAt: string;
  lastReason?:
    'process-interrupted' | 'canonical-task-advanced' | 'operator-recovered';
}

export interface AgentExecutionOwnership {
  projectId: string;
  taskId: string;
  executionId: string;
  environmentInstanceId?: string;
}

export interface AgentTaskStatus {
  task: AgentTaskRecord;
  runtime: AgentRuntimeState;
  activeExecution?: AgentExecutionOwnership;
}

export type AgentAuthorizationScope =
  | {
      kind: 'environment';
      projectId: string;
      environmentInstanceId: string;
    }
  | {
      kind: 'branch';
      projectId: string;
      branch: string;
    }
  | {
      kind: 'repository-branch';
      repository: string;
      branch: string;
    }
  | {
      kind: 'pull-request';
      repository: string;
      number: number;
    }
  | {
      kind: 'release-target';
      projectId: string;
      target: string;
    };

export interface AgentAuthorization {
  taskId: string;
  capability: AgentCapability;
  granted: boolean;
  observedAt: string;
  scope?: AgentAuthorizationScope;
}

export interface AgentCheckpoint {
  id: string;
  taskId: string;
  executionId?: string;
  status: 'pending' | 'approved' | 'rejected';
  summary: string;
  requiredCapabilities: AgentCapability[];
  createdAt: string;
  resolvedAt?: string;
  continuationInstruction?: string;
}

export interface AgentEvent {
  id: string;
  taskId: string;
  executionId?: string;
  providerId?: AgentConcreteProviderId;
  type:
    | 'task-state'
    | 'execution-state'
    | 'checkpoint'
    | 'authorization'
    | 'evidence';
  summary: string;
  occurredAt: string;
}

export interface AgentEvidence {
  id: string;
  taskId: string;
  executionId?: string;
  kind:
    'diff' | 'test' | 'log' | 'commit' | 'pull-request' | 'readiness' | 'other';
  summary: string;
  reference?: string;
  observedAt: string;
}

export interface AgentActivity {
  authorizations: AgentAuthorization[];
  checkpoints: AgentCheckpoint[];
  events: AgentEvent[];
  evidence: AgentEvidence[];
}

export interface AgentUsageSummary {
  executionCount: number;
  inputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteInputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  reportedCostUsd?: number;
  estimatedCostUsd?: number;
  durationMs?: number;
}

export interface AgentUsageOverview {
  total: AgentUsageSummary;
  byProvider: Partial<Record<AgentConcreteProviderId, AgentUsageSummary>>;
}

export interface AgentTaskBudget {
  projectId: string;
  taskId: string;
  maxTotalTokens?: number;
  maxEstimatedCostUsd?: number;
  mode?: 'soft' | 'hard';
  updatedAt: string;
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

export interface AgentExecutionProfile {
  id: string;
  label: string;
  providerId: AgentProviderId;
  fallbackOrder?: Array<'codex' | 'claude-code'>;
  timeoutMs?: number;
  budget?: {
    maxTotalTokens?: number;
    maxEstimatedCostUsd?: number;
    mode?: 'soft' | 'hard';
  };
  requestedCapabilities: AgentCapability[];
}

export interface AgentExecutionProfileConfiguration {
  projectId: string;
  defaultProfileId?: string;
  profiles: AgentExecutionProfile[];
  updatedAt: string;
}

export interface AgentEffectiveExecutionConfiguration {
  profileId?: string;
  profileLabel?: string;
  providerId: AgentProviderId;
  fallbackOrder?: Array<'codex' | 'claude-code'>;
  timeoutMs?: number;
  budget?: {
    maxTotalTokens?: number;
    maxEstimatedCostUsd?: number;
    mode?: 'soft' | 'hard';
  };
  requestedCapabilities: AgentCapability[];
  model: { status: 'unavailable' };
  effort: { status: 'unavailable' };
}

export interface AgentExecution {
  id: string;
  taskId: string;
  projectId: string;
  environmentInstanceId?: string;
  requestedProviderId?: AgentProviderId;
  providerId: AgentConcreteProviderId;
  state:
    | 'queued'
    | 'running'
    | 'checkpoint'
    | 'succeeded'
    | 'failed'
    | 'cancelled'
    | 'unknown';
  startedAt?: string;
  finishedAt?: string;
  failure?: {
    kind: 'known' | 'ambiguous';
    code: string;
    message: string;
  };
  configuration?: AgentEffectiveExecutionConfiguration;
}

export interface AgentProviderResult {
  providerId: AgentConcreteProviderId;
  outcome: 'checkpoint' | 'succeeded' | 'failed' | 'cancelled' | 'unknown';
  summary: string;
  responseText?: string;
  evidence?: AgentEvidence[];
  failure?: {
    kind: 'known' | 'ambiguous';
    code: string;
    message: string;
  };
}

export interface AgentExecutionResult {
  execution: AgentExecution;
  task: AgentTaskRecord;
  providerResult: AgentProviderResult;
  checkpoint?: AgentCheckpoint;
}

export interface AgentAttachment {
  id: string;
  taskId: string;
  filename: string;
  mediaType:
    | 'text/plain'
    | 'text/markdown'
    | 'application/json'
    | 'image/png'
    | 'image/jpeg'
    | 'image/webp';
  byteSize: number;
  sha256: string;
  source: 'user-upload';
  createdAt: string;
  textPreview?: string;
}

export interface AgentConversationTurn {
  id: string;
  taskId: string;
  role: 'user' | 'agent';
  content: string;
  createdAt: string;
  executionId?: string;
  providerId?: AgentConcreteProviderId;
  attachmentIds?: string[];
}

export interface AgentConversationExecutionResult extends AgentExecutionResult {
  userTurn: AgentConversationTurn;
  agentTurn: AgentConversationTurn;
}

export interface AgentLiveEvent {
  seq: number;
  at: string;
  kind: 'text' | 'tool' | 'result' | 'error';
  text: string;
  tool?: string;
}

export interface AgentRealtimeSnapshot {
  status: AgentTaskStatus;
  activity: AgentActivity;
  /** Progresso ao vivo da execução em andamento. */
  live?: AgentLiveEvent[];
}

interface ProvidersResponse {
  providers: AgentProviderStatus[];
}

interface TasksResponse {
  tasks: AgentTaskRecord[];
}

export interface AgentTaskPage {
  tasks: AgentTaskRecord[];
  nextCursor: string | null;
}

interface TaskResponse {
  task: AgentTaskRecord;
}

function taskPath(projectId: string, taskId?: string): string {
  const base =
    '/api/projects/' + encodeURIComponent(projectId) + '/agent/tasks';
  return taskId ? base + '/' + encodeURIComponent(taskId) : base;
}

export async function fetchAgentProviders(): Promise<AgentProviderStatus[]> {
  return (await requestJson<ProvidersResponse>('/api/agent/providers'))
    .providers;
}

export async function fetchAgentExecutionProfiles(
  projectId: string,
): Promise<AgentExecutionProfileConfiguration | null> {
  return (
    await requestJson<{
      configuration: AgentExecutionProfileConfiguration | null;
    }>(
      '/api/projects/' +
        encodeURIComponent(projectId) +
        '/agent/execution-profiles',
    )
  ).configuration;
}

export async function setAgentExecutionProfiles(
  projectId: string,
  input: {
    defaultProfileId?: string;
    profiles: AgentExecutionProfile[];
  },
): Promise<AgentExecutionProfileConfiguration> {
  return (
    await requestJson<{ configuration: AgentExecutionProfileConfiguration }>(
      '/api/projects/' +
        encodeURIComponent(projectId) +
        '/agent/execution-profiles',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
    )
  ).configuration;
}

export async function fetchAgentTasks(
  projectId: string,
): Promise<AgentTaskRecord[]> {
  return (await requestJson<TasksResponse>(taskPath(projectId))).tasks;
}

export async function fetchAgentTaskPage(
  projectId: string,
  options: {
    limit?: number;
    cursor?: string;
    order?: 'priority';
    includeArchived?: boolean;
  } = {},
): Promise<AgentTaskPage> {
  const query = new URLSearchParams();
  query.set('limit', String(options.limit ?? 20));
  if (options.cursor) query.set('cursor', options.cursor);
  if (options.order) query.set('order', options.order);
  if (options.includeArchived !== undefined) {
    query.set('includeArchived', String(options.includeArchived));
  }
  return requestJson<AgentTaskPage>(taskPath(projectId) + '?' + query);
}

export async function archiveAgentTask(
  projectId: string,
  taskId: string,
): Promise<AgentTaskRecord> {
  return (
    await requestJson<TaskResponse>(taskPath(projectId, taskId) + '/archive', {
      method: 'POST',
    })
  ).task;
}

export async function createAgentTask(
  projectId: string,
  input: {
    summary: string;
    environmentInstanceId?: string;
    taskContextId?: string;
    requestedCapabilities: AgentCapability[];
  },
): Promise<AgentTaskRecord> {
  const response = await requestJson<TaskResponse>(taskPath(projectId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return response.task;
}

export async function adoptAgentBacklog(
  projectId: string,
  input: {
    issueNumber?: number;
    environmentInstanceId?: string;
    requestedCapabilities: AgentCapability[];
  },
): Promise<AgentBacklogAdoptionResult> {
  const response = await requestJson<{ result: AgentBacklogAdoptionResult }>(
    '/api/projects/' + encodeURIComponent(projectId) + '/agent/adopt-backlog',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return response.result;
}

export async function fetchAgentTaskStatus(
  projectId: string,
  taskId: string,
): Promise<AgentTaskStatus> {
  return requestJson<AgentTaskStatus>(taskPath(projectId, taskId) + '/status');
}

export async function fetchAgentActivity(
  projectId: string,
  taskId: string,
): Promise<AgentActivity> {
  return requestJson<AgentActivity>(taskPath(projectId, taskId) + '/activity');
}

export async function fetchAgentAttachments(
  projectId: string,
  taskId: string,
): Promise<AgentAttachment[]> {
  return (
    await requestJson<{ attachments: AgentAttachment[] }>(
      taskPath(projectId, taskId) + '/attachments',
    )
  ).attachments;
}

export async function createAgentAttachment(
  projectId: string,
  taskId: string,
  input: {
    filename: string;
    mediaType: AgentAttachment['mediaType'];
    contentBase64: string;
  },
): Promise<AgentAttachment> {
  return requestJson<AgentAttachment>(
    taskPath(projectId, taskId) + '/attachments',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
}

export async function fetchAgentConversation(
  projectId: string,
  taskId: string,
): Promise<AgentConversationTurn[]> {
  return (
    await requestJson<{ turns: AgentConversationTurn[] }>(
      taskPath(projectId, taskId) + '/conversation',
    )
  ).turns;
}

export async function executeAgentConversationTurn(
  projectId: string,
  taskId: string,
  input: {
    id: string;
    content: string;
    providerId?: AgentProviderId;
    attachmentIds?: string[];
    profileId?: string;
  },
): Promise<AgentConversationExecutionResult> {
  return requestJson<AgentConversationExecutionResult>(
    taskPath(projectId, taskId) + '/turns',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
}

export async function fetchAgentUsage(
  projectId: string,
  taskId?: string,
  period: { observedFrom?: string; observedTo?: string } = {},
): Promise<AgentUsageOverview> {
  const base = taskId
    ? taskPath(projectId, taskId) + '/usage'
    : '/api/projects/' + encodeURIComponent(projectId) + '/agent/usage';
  const query = new URLSearchParams();
  if (period.observedFrom) query.set('observedFrom', period.observedFrom);
  if (period.observedTo) query.set('observedTo', period.observedTo);
  const suffix = query.size > 0 ? '?' + query.toString() : '';
  return requestJson<AgentUsageOverview>(base + suffix);
}

export async function fetchAgentBudget(
  projectId: string,
  taskId: string,
): Promise<AgentBudgetOverview> {
  return requestJson<AgentBudgetOverview>(
    taskPath(projectId, taskId) + '/budget',
  );
}

export async function setAgentBudget(
  projectId: string,
  taskId: string,
  input: {
    maxTotalTokens?: number;
    maxEstimatedCostUsd?: number;
    mode?: 'soft' | 'hard';
  },
): Promise<AgentBudgetOverview> {
  return requestJson<AgentBudgetOverview>(
    taskPath(projectId, taskId) + '/budget',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
}

export async function clearAgentBudget(
  projectId: string,
  taskId: string,
): Promise<AgentBudgetOverview> {
  return requestJson<AgentBudgetOverview>(
    taskPath(projectId, taskId) + '/budget',
    {
      method: 'DELETE',
    },
  );
}

export async function executeAgentTask(
  projectId: string,
  taskId: string,
  providerId: AgentProviderId,
  attachmentIds: string[] = [],
  profileId?: string,
): Promise<AgentExecutionResult> {
  return requestJson<AgentExecutionResult>(
    taskPath(projectId, taskId) + '/executions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId,
        ...(attachmentIds.length ? { attachmentIds } : {}),
        ...(profileId ? { profileId } : {}),
      }),
    },
  );
}

export async function cancelAgentTask(
  projectId: string,
  taskId: string,
): Promise<AgentTaskStatus> {
  return requestJson<AgentTaskStatus>(taskPath(projectId, taskId) + '/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
}

export async function retryAgentTask(
  projectId: string,
  taskId: string,
): Promise<AgentTaskRecord> {
  return (
    await requestJson<TaskResponse>(taskPath(projectId, taskId) + '/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
  ).task;
}

export async function recoverAgentTask(
  projectId: string,
  taskId: string,
): Promise<AgentTaskStatus> {
  return requestJson<AgentTaskStatus>(
    taskPath(projectId, taskId) + '/recover',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    },
  );
}

export async function setAgentAuthorization(
  projectId: string,
  taskId: string,
  capability: AgentCapability,
  granted: boolean,
): Promise<AgentAuthorization> {
  return requestJson<AgentAuthorization>(
    taskPath(projectId, taskId) + '/authorizations',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capability, granted }),
    },
  );
}

export async function resolveAgentCheckpoint(
  projectId: string,
  taskId: string,
  checkpointId: string,
  decision: 'approved' | 'rejected',
  instruction?: string,
): Promise<{ task: AgentTaskRecord; checkpoint: AgentCheckpoint }> {
  return requestJson<{ task: AgentTaskRecord; checkpoint: AgentCheckpoint }>(
    taskPath(projectId, taskId) +
      '/checkpoints/' +
      encodeURIComponent(checkpointId) +
      '/resolve',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision,
        ...(instruction?.trim() ? { instruction: instruction.trim() } : {}),
      }),
    },
  );
}

export function agentRuntimeWebSocketUrl(
  projectId: string,
  taskId: string,
): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return (
    protocol +
    '//' +
    window.location.host +
    taskPath(projectId, taskId) +
    '/connect'
  );
}
