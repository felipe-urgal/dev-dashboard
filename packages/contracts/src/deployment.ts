import type {
  ProductionCommandId,
  ProductionCommands,
  ProductionProvider,
} from './production.js';

export type DeploymentStatus =
  | 'planned'
  | 'preparing'
  | 'backing_up'
  | 'migrating'
  | 'deploying'
  | 'verifying'
  | 'succeeded'
  | 'failed'
  | 'recovery_required'
  | 'cancelled';

export type DeploymentStepStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type DeploymentExecutionPhase = Extract<
  DeploymentStatus,
  'preparing' | 'backing_up' | 'migrating' | 'deploying' | 'verifying'
>;

export type DeploymentScriptId = NonNullable<
  ProductionCommands[ProductionCommandId]
>;

export interface DeploymentPlanStep {
  id: ProductionCommandId;
  script: DeploymentScriptId;
  phase: DeploymentExecutionPhase;
  mutating: boolean;
  irreversible: boolean;
}

export interface DeploymentPlan {
  projectId: string;
  projectName: string;
  provider: ProductionProvider;
  branch: string;
  revision: string;
  planHash: string;
  createdAt: string;
  steps: DeploymentPlanStep[];
}

export interface DeploymentConfirmation {
  token: string;
  projectId: string;
  revision: string;
  planHash: string;
  expiresAt: string;
}

export interface DeploymentTimelineStep extends DeploymentPlanStep {
  status: DeploymentStepStatus;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
}

export type DeploymentFailurePoint =
  | 'before-irreversible'
  | 'after-irreversible';

export interface Deployment {
  id: string;
  projectId: string;
  projectName: string;
  provider: ProductionProvider;
  branch: string;
  revision: string;
  planHash: string;
  status: DeploymentStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  currentStepId?: ProductionCommandId;
  failurePoint?: DeploymentFailurePoint;
  errorCode?: string;
  errorMessage?: string;
  timeline: DeploymentTimelineStep[];
}

export interface DeploymentHistory {
  items: Deployment[];
  page: number;
  pageSize: number;
  total: number;
}

export interface DeploymentLog {
  deploymentId: string;
  content: string;
  truncated: boolean;
  masked: boolean;
  redactionCount: number;
}
