export type StackNodeKind =
  'environment' | 'process' | 'compose-service' | 'health-check';

export type StackNodeState =
  'ready' | 'starting' | 'stopped' | 'failed' | 'blocked' | 'unknown';

export interface StackEnvironmentTarget {
  kind: 'environment';
  projectId: string;
  environmentInstanceId: string;
}

export interface StackProcessTarget {
  kind: 'process';
  projectId: string;
  environmentInstanceId: string;
  processId: string;
}

export interface StackComposeServiceTarget {
  kind: 'compose-service';
  projectId: string;
  environmentInstanceId: string;
  service: string;
}

export interface StackHealthCheckTarget {
  kind: 'health-check';
  projectId: string;
  environmentInstanceId?: string;
  checkId: string;
}

export type StackNodeTarget =
  | StackEnvironmentTarget
  | StackProcessTarget
  | StackComposeServiceTarget
  | StackHealthCheckTarget;

export interface StackNode {
  id: string;
  name: string;
  target: StackNodeTarget;
}

export interface StackDependency {
  nodeId: string;
  dependsOnNodeId: string;
}

export type StackDependencySuggestionSource = 'compose';

export interface StackDependencySuggestionEvidence {
  source: StackDependencySuggestionSource;
  projectId: string;
  environmentInstanceId: string;
  service: string;
  dependsOnService: string;
  observedAt: string;
}

export interface StackDependencySuggestion {
  dependency: StackDependency;
  evidence: StackDependencySuggestionEvidence;
}

export interface StackDependencyDiscoveryDiagnostic {
  source: StackDependencySuggestionSource;
  projectId: string;
  environmentInstanceId: string;
  message: string;
}

export interface StackDependencyDiscovery {
  stackId: string;
  suggestions: StackDependencySuggestion[];
  diagnostics: StackDependencyDiscoveryDiagnostic[];
}

export interface Stack {
  id: string;
  name: string;
  nodes: StackNode[];
  dependencies: StackDependency[];
}

/** Browser-safe choices derived from backend-owned resources, never commands or paths. */
export interface StackResource {
  name: string;
  target: StackNodeTarget;
}

export interface StackTopologyPlan {
  stackId: string;
  startOrder: string[];
  stopOrder: string[];
}

export interface StackNodeHealth {
  nodeId: string;
  state: StackNodeState;
  observedAt: string;
  diagnostic?: string;
}

export interface StackHealth {
  stackId: string;
  state: StackNodeState;
  observedAt: string;
  nodes: StackNodeHealth[];
}

export interface StackCheck {
  stack: Stack;
  topology: StackTopologyPlan;
  health: StackHealth;
}

export type StackStartStepState =
  'already-ready' | 'started' | 'blocked' | 'failed';

export interface StackStartStep {
  nodeId: string;
  state: StackStartStepState;
  diagnostic?: string;
}

export type StackStartState = 'completed' | 'blocked' | 'failed';

export interface StackStartResult {
  stackId: string;
  state: StackStartState;
  steps: StackStartStep[];
  check: StackCheck;
}

export type StackStopStepState =
  'already-stopped' | 'stopped' | 'retained' | 'blocked' | 'failed';

export interface StackStopStep {
  nodeId: string;
  state: StackStopStepState;
  diagnostic?: string;
}

export type StackStopState = 'completed' | 'blocked' | 'failed';

export interface StackStopResult {
  stackId: string;
  state: StackStopState;
  steps: StackStopStep[];
  check: StackCheck;
}

export type StackRestartState = 'restarted' | 'blocked' | 'failed';

export interface StackRestartResult {
  stackId: string;
  nodeId: string;
  state: StackRestartState;
  diagnostic?: string;
  check: StackCheck;
}

export type StackNodeLogState =
  'available' | 'empty' | 'unsupported' | 'unavailable';

export type StackNodeLogSource = 'compose' | 'process' | 'none';

export interface StackNodeLog {
  nodeId: string;
  state: StackNodeLogState;
  source: StackNodeLogSource;
  content?: string;
  truncated?: boolean;
  masked?: boolean;
  redactionCount?: number;
  readAt: string;
  diagnostic?: string;
}

export interface StackLogsSnapshot {
  stackId: string;
  readAt: string;
  nodes: StackNodeLog[];
}

/** Observational Stack-target lifecycle plan; never a dispatch capability. */
export interface StackLifecyclePreview {
  target: { kind: 'stack'; stackId: string };
  action: 'start' | 'stop';
  status: 'ready' | 'blocked';
  expectedRevision: string;
  planHash: string;
  observedAt: string;
  expiresAt: string;
  order: string[];
  nodes: Array<{
    nodeId: string;
    name: string;
    kind: StackNodeKind;
    state: StackNodeState;
    disposition:
      | 'willStart'
      | 'willStop'
      | 'alreadyReady'
      | 'retained'
      | 'blocked'
      | 'unsupported';
    dependencies: string[];
    /** Other Stacks using this exact target (not all external consumers). */
    otherStackConsumers: number;
    diagnostic?: string;
  }>;
  diagnostics: string[];
  executable: false;
}
