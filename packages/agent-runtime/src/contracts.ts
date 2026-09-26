export type AgentProviderId =
  'automatic' | 'codex' | 'claude-code' | 'chatgpt-browser';

export type AgentConcreteProviderId = Exclude<AgentProviderId, 'automatic'>;

export type AgentTaskState =
  | 'queued'
  | 'running'
  | 'checkpoint'
  | 'review'
  | 'blocked'
  | 'failed'
  | 'completed'
  | 'cancelled';

export type AgentExecutionState =
  | 'queued'
  | 'running'
  | 'checkpoint'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'unknown';

export type AgentCapability =
  | 'workspace:write'
  | 'git:commit'
  | 'git:push'
  | 'github:pull-request'
  | 'github:merge'
  | 'deployment:run'
  | 'release:run';

export interface AgentAdoptedGitRef {
  branch: string;
  commitHash: string;
  verifiedAt: string;
}

export interface AgentTask {
  id: string;
  projectId: string;
  environmentInstanceId?: string;
  taskContextId?: string;
  state: AgentTaskState;
  summary: string;
  continuationInstruction?: string;
  adoptedGitRef?: AgentAdoptedGitRef;
  requestedCapabilities: AgentCapability[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentExecutionFailure {
  kind: 'known' | 'ambiguous';
  code: string;
  message: string;
}

export type AgentUsageSource =
  'provider' | 'estimated' | 'mixed' | 'unavailable';

export interface AgentUsage {
  providerId: AgentConcreteProviderId;
  source: AgentUsageSource;
  model?: string;
  inputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteInputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  reportedCost?: {
    amount: number;
    currency: 'USD';
  };
  estimatedCost?: {
    amount: number;
    currency: 'USD';
    pricingVersion: string;
  };
  durationMs?: number;
}

export interface AgentExecution {
  id: string;
  taskId: string;
  projectId: string;
  environmentInstanceId?: string;
  requestedProviderId?: AgentProviderId;
  providerId: AgentConcreteProviderId;
  state: AgentExecutionState;
  startedAt?: string;
  finishedAt?: string;
  failure?: AgentExecutionFailure;
  usage?: AgentUsage;
}

export type AgentProviderAvailability =
  'available' | 'degraded' | 'unavailable';

export interface AgentProviderQuota {
  status: 'available' | 'unavailable';
  label?: string;
  used?: number;
  remaining?: number;
  resetAt?: string;
  source: 'provider' | 'unavailable';
  reason?: string;
}

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

export interface AgentProviderDiagnostic {
  code: AgentProviderDiagnosticCode;
  evidence?: string;
}

export interface AgentProviderStatus {
  providerId: AgentProviderId;
  availability: AgentProviderAvailability;
  observedAt: string;
  version?: string;
  selectedProviderId?: AgentConcreteProviderId;
  reason?: string;
  diagnostic?: AgentProviderDiagnostic;
  quota?: AgentProviderQuota;
}

export type AgentCheckpointStatus = 'pending' | 'approved' | 'rejected';

export interface AgentCheckpoint {
  id: string;
  taskId: string;
  executionId?: string;
  status: AgentCheckpointStatus;
  summary: string;
  requiredCapabilities: AgentCapability[];
  createdAt: string;
  resolvedAt?: string;
  continuationInstruction?: string;
}

export interface AgentCheckpointRequest {
  summary: string;
  requiredCapabilities: AgentCapability[];
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

export type AgentEvidenceKind =
  'diff' | 'test' | 'log' | 'commit' | 'pull-request' | 'readiness' | 'other';

export interface AgentEvidence {
  id: string;
  taskId: string;
  executionId?: string;
  kind: AgentEvidenceKind;
  summary: string;
  reference?: string;
  observedAt: string;
}

export type AgentEventType =
  | 'task-state'
  | 'execution-state'
  | 'checkpoint'
  | 'authorization'
  | 'evidence';

export interface AgentEvent {
  id: string;
  taskId: string;
  executionId?: string;
  providerId?: AgentConcreteProviderId;
  type: AgentEventType;
  summary: string;
  occurredAt: string;
}

export interface AgentExecutionOwnership {
  projectId: string;
  taskId: string;
  executionId: string;
  environmentInstanceId?: string;
}

export interface AgentCancellationRequest {
  ownership: AgentExecutionOwnership;
  requestedAt: string;
}

export interface AgentProviderConversationTurn {
  role: 'user' | 'agent';
  content: string;
  providerId?: AgentConcreteProviderId;
}

export interface AgentProviderConversationContext {
  turns: readonly AgentProviderConversationTurn[];
  omittedTurns: number;
}

export interface AgentProviderExecutionRequest {
  taskId: string;
  executionId: string;
  projectId: string;
  environmentInstanceId?: string;
  summary: string;
  allowedCapabilities: readonly AgentCapability[];
  allowedAuthorizations?: readonly AgentAuthorization[];
  continuationInstruction?: string;
  conversationContext?: AgentProviderConversationContext;
  contextEvidence?: readonly Pick<
    AgentEvidence,
    'kind' | 'summary' | 'reference' | 'observedAt'
  >[];
  signal?: AbortSignal;
}

export interface AgentProviderResult {
  providerId: AgentConcreteProviderId;
  outcome: 'checkpoint' | 'succeeded' | 'failed' | 'cancelled' | 'unknown';
  summary: string;
  responseText?: string;
  checkpoint?: AgentCheckpointRequest;
  evidence?: AgentEvidence[];
  failure?: AgentExecutionFailure;
  usage?: AgentUsage;
}

export interface AgentProvider {
  readonly id: AgentProviderId;
  status(): Promise<AgentProviderStatus>;
  supports?(request: AgentProviderExecutionRequest): boolean | Promise<boolean>;
  execute(request: AgentProviderExecutionRequest): Promise<AgentProviderResult>;
}

export interface AgentTaskRecord {
  task: AgentTask;
  version: number;
}

export interface AgentTaskStore {
  get(taskId: string): Promise<AgentTaskRecord | null>;
  list(projectId: string): Promise<AgentTaskRecord[]>;
  save(
    task: AgentTask,
    expectedVersion: number | null,
  ): Promise<AgentTaskRecord>;
}

export interface AgentProviderRegistry {
  get(providerId: AgentProviderId): AgentProvider | null;
  list(): AgentProvider[];
}

export interface AgentExecutionLog {
  append(event: AgentEvent): Promise<void>;
  list(taskId: string, limit: number): Promise<AgentEvent[]>;
}

export interface AgentClock {
  now(): string;
}
