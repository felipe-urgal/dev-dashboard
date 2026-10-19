/** Preview-only contract; an approved plan is NOT a lifecycle capability. */
export type ServiceLifecycleAction = 'start' | 'stop';
export type ServiceLifecycleDisposition =
  | 'willStart' | 'willStop' | 'alreadyReady'
  | 'retained' | 'blocked' | 'unsupported';

export interface ServiceLifecyclePlanNode {
  serviceRef: string;
  name: string;
  provider: 'systemd' | 'docker' | 'compose' | 'managed-process' | 'unknown';
  disposition: ServiceLifecycleDisposition;
  state: string;
  readiness: 'ready' | 'unhealthy' | 'unknown';
  relation: 'owned' | 'required' | 'observed' | 'missing';
  ports: number[];
  consumerCount: number;
  dependencies: string[];
  diagnostic?: string;
}

export interface ServiceLifecyclePlan {
  /** Binding owner, not an authority to control these services. */
  target: {
    kind: 'project-environment';
    projectId: string;
    environmentInstanceId: string;
  };
  action: ServiceLifecycleAction;
  status: 'ready' | 'blocked';
  /** Bindings collection revision. Revalidated on every preview. */
  expectedRevision: string;
  /** Fingerprint of bindings, observed states and port evidence. */
  planHash: string;
  observedAt: string;
  expiresAt: string;
  /** Dependency-first on start, reverse on stop. */
  order: string[];
  nodes: ServiceLifecyclePlanNode[];
  diagnostics: string[];
  /** Explicitly false until separate confirmation/locking execution is implemented. */
  executable: false;
}
