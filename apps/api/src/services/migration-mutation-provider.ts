import type { ExecutionContext, Project } from '@dev-dashboard/contracts';

import type {
  MigrationOverview,
  MigrationProvider,
} from './migration-provider.js';

export type MigrationMutationOperation = 'apply';
export type MigrationMutationPreflightState =
  'ready' | 'blocked' | 'unavailable';

export type MigrationMutationPreflightReason =
  | 'ready'
  | 'provider-unavailable'
  | 'runtime-unsupported'
  | 'provider-evidence-mismatch'
  | 'nothing-pending'
  | 'inspection-inconclusive'
  | 'provider-plan-invalid';

export interface MigrationMutationCommand {
  file: string;
  args: string[];
}

export interface MigrationMutationPreflight {
  state: MigrationMutationPreflightState;
  reason: MigrationMutationPreflightReason;
  observedAt: string;
  evidence: string;
  diagnostic?: string;
}

export interface MigrationMutationPlan {
  projectId: string;
  provider: string;
  operation: MigrationMutationOperation;
  database: string;
  environmentInstanceId: string;
  runtime: ExecutionContext['runtime'];
  executionContextHash: string;
  createdAt: string;
  overviewObservedAt?: string;
  planHash: string;
  preflight: MigrationMutationPreflight;
  command?: MigrationMutationCommand;
}

export interface MigrationMutationPlanContext {
  project: Project;
  executionContext: ExecutionContext;
  operation: MigrationMutationOperation;
  database: string;
  overview: MigrationOverview;
  now: () => Date;
}

export interface MigrationMutationProviderPlan {
  command: MigrationMutationCommand;
}

export interface MigrationMutationProvider extends MigrationProvider {
  planMutation(
    context: MigrationMutationPlanContext,
  ): Promise<MigrationMutationProviderPlan>;
}
