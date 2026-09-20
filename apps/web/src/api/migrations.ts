import { requestJson } from './core';

export type MigrationOverviewStatus =
  'up-to-date' | 'pending' | 'unavailable' | 'unknown';

export interface MigrationEntry {
  id: string;
  name?: string;
}

export interface MigrationOverview {
  provider: string;
  status: MigrationOverviewStatus;
  database: string;
  applied: MigrationEntry[];
  pending: MigrationEntry[];
  observedAt: string;
  evidence: string;
  warnings: string[];
}

export type MigrationMutationPreflightState =
  'ready' | 'blocked' | 'unavailable';

export type MigrationMutationPreflightReason =
  | 'ready'
  | 'provider-unavailable'
  | 'runtime-unsupported'
  | 'provider-evidence-mismatch'
  | 'database-evidence-mismatch'
  | 'nothing-pending'
  | 'inspection-inconclusive'
  | 'provider-plan-invalid';

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
  operation: 'apply';
  database: string;
  environmentInstanceId: string;
  runtime: 'host' | 'devcontainer';
  createdAt: string;
  overviewObservedAt?: string;
  planHash: string;
  preflight: MigrationMutationPreflight;
}

export interface MigrationMutationConfirmation {
  token: string;
  planHash: string;
  expiresAt: string;
}

export interface MigrationMutationExecutionSnapshot {
  provider: string;
  operation: 'apply';
  database: string;
  environmentInstanceId: string;
  planHash: string;
  status: 'running' | 'exited';
  buffer: string;
  truncated: boolean;
  exitCode: number | null;
  exitSignal: number | null;
  startedAt: string;
  endedAt: string | null;
}

interface MigrationOverviewResponse {
  migration: MigrationOverview;
}

interface MigrationMutationPlanResponse {
  plan: MigrationMutationPlan;
}

interface MigrationMutationConfirmationResponse {
  confirmation: MigrationMutationConfirmation;
}

interface MigrationMutationExecutionResponse {
  snapshot: MigrationMutationExecutionSnapshot;
}

interface MigrationMutationStatusResponse {
  snapshot: MigrationMutationExecutionSnapshot | null;
}

function migrationsPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/migrations`;
}

function mutationInput(
  plan: Pick<
    MigrationMutationPlan,
    'operation' | 'database' | 'environmentInstanceId'
  >,
) {
  return {
    operation: plan.operation,
    database: plan.database,
    environmentInstanceId: plan.environmentInstanceId,
  };
}

export async function fetchMigrationOverview(
  projectId: string,
  database?: string,
): Promise<MigrationOverview> {
  const query = database ? `?database=${encodeURIComponent(database)}` : '';
  const response = await requestJson<MigrationOverviewResponse>(
    `${migrationsPath(projectId)}${query}`,
  );
  return response.migration;
}

export async function planMigrationMutation(
  projectId: string,
  database?: string,
  environmentInstanceId?: string,
): Promise<MigrationMutationPlan> {
  const response = await requestJson<MigrationMutationPlanResponse>(
    `${migrationsPath(projectId)}/mutations/plan`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'apply',
        ...(database ? { database } : {}),
        ...(environmentInstanceId ? { environmentInstanceId } : {}),
      }),
    },
  );
  return response.plan;
}

export async function prepareMigrationMutation(
  projectId: string,
  plan: MigrationMutationPlan,
): Promise<MigrationMutationConfirmation> {
  const response = await requestJson<MigrationMutationConfirmationResponse>(
    `${migrationsPath(projectId)}/mutations/confirmation`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...mutationInput(plan),
        planHash: plan.planHash,
      }),
    },
  );
  return response.confirmation;
}

export async function startMigrationMutation(
  projectId: string,
  plan: MigrationMutationPlan,
  confirmationToken: string,
): Promise<MigrationMutationExecutionSnapshot> {
  const response = await requestJson<MigrationMutationExecutionResponse>(
    `${migrationsPath(projectId)}/mutations/start`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...mutationInput(plan),
        confirmationToken,
      }),
    },
  );
  return response.snapshot;
}

export async function fetchMigrationMutationStatus(
  projectId: string,
  environmentInstanceId: string,
): Promise<MigrationMutationExecutionSnapshot | null> {
  const query = new URLSearchParams({ environmentInstanceId });
  const response = await requestJson<MigrationMutationStatusResponse>(
    `${migrationsPath(projectId)}/mutations/status?${query}`,
  );
  return response.snapshot;
}

export async function cancelMigrationMutation(
  projectId: string,
  environmentInstanceId: string,
): Promise<void> {
  const query = new URLSearchParams({ environmentInstanceId });
  await requestJson(`${migrationsPath(projectId)}/mutations/cancel?${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
}

export function migrationMutationWebSocketUrl(
  projectId: string,
  environmentInstanceId: string,
): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const query = new URLSearchParams({ environmentInstanceId });
  return `${protocol}//${window.location.host}${migrationsPath(projectId)}/mutations/connect?${query}`;
}
