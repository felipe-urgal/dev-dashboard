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

export interface AgentTask {
  id: string;
  projectId: string;
  environmentInstanceId?: string;
  state: AgentTaskState;
  summary: string;
  continuationInstruction?: string;
  requestedCapabilities: AgentCapability[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentExecutionFailure {
  kind: 'known' | 'ambiguous';
  code: string;
  message: string;
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
}

export type AgentProviderAvailability =
  'available' | 'degraded' | 'unavailable';

export interface AgentProviderStatus {
  providerId: AgentProviderId;
  availability: AgentProviderAvailability;
  observedAt: string;
  version?: string;
  reason?: string;
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

export interface AgentAuthorization {
  taskId: string;
  capability: AgentCapability;
  granted: boolean;
  observedAt: string;
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

export interface AgentProviderExecutionRequest {
  taskId: string;
  executionId: string;
  projectId: string;
  environmentInstanceId?: string;
  summary: string;
  allowedCapabilities: readonly AgentCapability[];
  continuationInstruction?: string;
  signal?: AbortSignal;
}

export interface AgentProviderResult {
  providerId: AgentConcreteProviderId;
  outcome: 'checkpoint' | 'succeeded' | 'failed' | 'cancelled' | 'unknown';
  summary: string;
  checkpoint?: AgentCheckpointRequest;
  evidence?: AgentEvidence[];
  failure?: AgentExecutionFailure;
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
