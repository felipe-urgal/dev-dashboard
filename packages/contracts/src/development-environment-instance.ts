export type DevelopmentEnvironmentSourceKind = 'primary' | 'worktree';

export interface DevelopmentEnvironmentSource {
  kind: DevelopmentEnvironmentSourceKind;
  path: string;
  worktreeId?: string;
}

export type DevelopmentEnvironmentRuntimeKind = 'host' | 'devcontainer';

export interface DevelopmentEnvironmentRuntime {
  kind: DevelopmentEnvironmentRuntimeKind;
  runtimeId?: string;
}

export type DevelopmentEnvironmentLifecycle =
  | 'stopped'
  | 'starting'
  | 'ready'
  | 'degraded'
  | 'stopping'
  | 'failed';

export interface DevelopmentEnvironmentInstance {
  id: string;
  projectId: string;
  source: DevelopmentEnvironmentSource;
  runtime: DevelopmentEnvironmentRuntime;
  lifecycle: DevelopmentEnvironmentLifecycle;
}

export interface ExecutionContext {
  projectId: string;
  environmentInstanceId: string;
  cwd: string;
  runtime: DevelopmentEnvironmentRuntimeKind;
  environmentProfileId?: string;
}
