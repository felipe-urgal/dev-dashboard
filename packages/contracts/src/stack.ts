export type StackNodeKind =
  | 'environment'
  | 'process'
  | 'compose-service'
  | 'health-check';

export type StackNodeState =
  | 'ready'
  | 'starting'
  | 'stopped'
  | 'failed'
  | 'blocked'
  | 'unknown';

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

export interface Stack {
  id: string;
  name: string;
  nodes: StackNode[];
  dependencies: StackDependency[];
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
