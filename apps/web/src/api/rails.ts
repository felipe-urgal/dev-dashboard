import type {
  DatabaseRestoreResult,
  DatabaseServiceAction,
  DatabaseSnapshot,
  DatabaseSnapshotConfirmation,
  DatabaseSnapshotList,
  ManagedProcess,
  MachineDatabaseService,
  ProcessLogSnapshot,
  ProjectDatabaseOverview,
  ProjectDatabaseSecret,
  ProjectDatabaseServiceActionResult,
  RailsCredentialsOverview,
  RailsGeneratorConfirmation,
  RailsGeneratorField,
  RailsGeneratorKind,
  RailsGeneratorResult,
  RailsMigrationMutationOperation,
  RailsMigrationsOverview,
  RailsWorkerId,
  RailsWorkerOverview,
} from '@dev-dashboard/contracts';

import { followEventStream, requestJson } from './core';

interface ProjectDatabaseResponse {
  database: ProjectDatabaseOverview;
}
interface ProjectDatabaseSecretResponse {
  secret: ProjectDatabaseSecret;
}
interface ProjectDatabaseServiceActionResponse {
  action: ProjectDatabaseServiceActionResult;
}

interface MachineDatabaseServicesResponse {
  services: MachineDatabaseService[];
}

export async function fetchMachineDatabaseServices(): Promise<
  MachineDatabaseService[]
> {
  const response =
    await requestJson<MachineDatabaseServicesResponse>('/api/database');
  return response.services;
}

export async function runMachineDatabaseServiceAction(
  serviceId: string,
  action: DatabaseServiceAction,
): Promise<void> {
  await requestJson(
    `/api/database/${encodeURIComponent(serviceId)}/${action}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
  );
}

export async function installMachineDatabaseService(
  serviceId: string,
): Promise<void> {
  await requestJson(`/api/database/${encodeURIComponent(serviceId)}/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

export async function fetchProjectDatabase(
  projectId: string,
  page = 1,
): Promise<ProjectDatabaseOverview> {
  const query = new URLSearchParams({ page: String(page), pageSize: '20' });
  const response = await requestJson<ProjectDatabaseResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/database?${query}`,
  );
  return response.database;
}

export async function revealProjectDatabaseUrl(
  projectId: string,
  environmentId: string,
): Promise<ProjectDatabaseSecret> {
  const response = await requestJson<ProjectDatabaseSecretResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/database/${encodeURIComponent(environmentId)}/reveal`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
  );
  return response.secret;
}

export async function runProjectDatabaseServiceAction(
  projectId: string,
  environmentId: string,
  action: DatabaseServiceAction,
): Promise<ProjectDatabaseServiceActionResult> {
  const response = await requestJson<ProjectDatabaseServiceActionResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/database/${encodeURIComponent(environmentId)}/${action}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
  );
  return response.action;
}

interface ProjectDatabaseSnapshotsResponse {
  snapshots: DatabaseSnapshotList;
}
interface ProjectDatabaseSnapshotResponse {
  snapshot: DatabaseSnapshot;
}
interface ProjectDatabaseSnapshotConfirmationResponse {
  confirmation: DatabaseSnapshotConfirmation;
}
interface ProjectDatabaseRestoreResponse {
  restore: DatabaseRestoreResult;
}

function snapshotsPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/database/snapshots`;
}

export async function fetchProjectDatabaseSnapshots(
  projectId: string,
): Promise<DatabaseSnapshotList> {
  const response = await requestJson<ProjectDatabaseSnapshotsResponse>(
    snapshotsPath(projectId),
  );
  return response.snapshots;
}

export async function createProjectDatabaseSnapshot(
  projectId: string,
  environmentId: string,
): Promise<DatabaseSnapshot> {
  const response = await requestJson<ProjectDatabaseSnapshotResponse>(
    snapshotsPath(projectId),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ environmentId }),
    },
  );
  return response.snapshot;
}

export async function prepareProjectDatabaseRestore(
  projectId: string,
  snapshotId: string,
): Promise<DatabaseSnapshotConfirmation> {
  const response =
    await requestJson<ProjectDatabaseSnapshotConfirmationResponse>(
      `${snapshotsPath(projectId)}/${encodeURIComponent(snapshotId)}/restore/confirmation`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
    );
  return response.confirmation;
}

export async function restoreProjectDatabaseSnapshot(
  projectId: string,
  snapshotId: string,
  confirmationToken: string,
): Promise<DatabaseRestoreResult> {
  const response = await requestJson<ProjectDatabaseRestoreResponse>(
    `${snapshotsPath(projectId)}/${encodeURIComponent(snapshotId)}/restore`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmationToken }),
    },
  );
  return response.restore;
}

interface ProjectRailsMigrationsResponse {
  migrations: RailsMigrationsOverview;
}

export async function fetchProjectRailsMigrations(
  projectId: string,
  database?: string,
): Promise<RailsMigrationsOverview> {
  const query = database ? `?${new URLSearchParams({ database })}` : '';
  const response = await requestJson<ProjectRailsMigrationsResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/rails/migrations${query}`,
  );
  return response.migrations;
}

export interface RailsMigrationPtyStatusSnapshot {
  operation: RailsMigrationMutationOperation;
  status: 'running' | 'exited';
  exitCode: number | null;
  exitSignal: number | null;
  startedAt: string;
  endedAt: string | null;
}

export async function fetchProjectRailsMigrationPtyStatus(
  projectId: string,
): Promise<RailsMigrationPtyStatusSnapshot | null> {
  const response = await requestJson<{
    snapshot: RailsMigrationPtyStatusSnapshot | null;
  }>(
    `/api/projects/${encodeURIComponent(projectId)}/rails/migrations/pty/status`,
  );
  return response.snapshot;
}

export async function startProjectRailsMigrationPty(
  projectId: string,
  operation: RailsMigrationMutationOperation,
): Promise<RailsMigrationPtyStatusSnapshot> {
  const response = await requestJson<{
    snapshot: RailsMigrationPtyStatusSnapshot;
  }>(
    `/api/projects/${encodeURIComponent(projectId)}/rails/migrations/pty/start`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation }),
    },
  );
  return response.snapshot;
}

export async function cancelProjectRailsMigrationPty(
  projectId: string,
): Promise<void> {
  await requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/rails/migrations/pty/cancel`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    },
  );
}

export function projectRailsMigrationPtyWebSocketUrl(
  projectId: string,
): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/projects/${encodeURIComponent(projectId)}/rails/migrations/pty/connect`;
}

interface RailsGeneratorConfirmationResponse {
  confirmation: RailsGeneratorConfirmation;
}
interface RailsGeneratorResultResponse {
  result: RailsGeneratorResult;
}

export async function prepareProjectRailsGenerator(
  projectId: string,
  kind: RailsGeneratorKind,
  name: string,
  fields: RailsGeneratorField[],
  database?: string,
): Promise<RailsGeneratorConfirmation> {
  const response = await requestJson<RailsGeneratorConfirmationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/rails/generate/confirmations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind,
        name,
        fields,
        ...(database ? { database } : {}),
      }),
    },
  );
  return response.confirmation;
}

export async function runProjectRailsGenerator(
  projectId: string,
  confirmationToken: string,
): Promise<RailsGeneratorResult> {
  const response = await requestJson<RailsGeneratorResultResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/rails/generate/mutations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmationToken }),
    },
  );
  return response.result;
}

interface RailsWorkerOverviewResponse {
  worker: RailsWorkerOverview;
}
interface RailsWorkerProcessResponse {
  process: ManagedProcess;
}
interface RailsWorkerLogResponse {
  log: ProcessLogSnapshot;
}
interface RailsCredentialsResponse {
  credentials: RailsCredentialsOverview;
}

function workerPath(projectId: string, workerId: RailsWorkerId): string {
  return `/api/projects/${encodeURIComponent(projectId)}/rails/workers/${encodeURIComponent(workerId)}`;
}

export async function fetchProjectRailsWorker(
  projectId: string,
  workerId: RailsWorkerId,
): Promise<RailsWorkerOverview> {
  const response = await requestJson<RailsWorkerOverviewResponse>(
    workerPath(projectId, workerId),
  );
  return response.worker;
}

export async function startProjectRailsWorker(
  projectId: string,
  workerId: RailsWorkerId,
): Promise<ManagedProcess> {
  const response = await requestJson<RailsWorkerProcessResponse>(
    `${workerPath(projectId, workerId)}/start`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
  );
  return response.process;
}

export async function stopProjectRailsWorker(
  projectId: string,
  workerId: RailsWorkerId,
): Promise<ManagedProcess> {
  const response = await requestJson<RailsWorkerProcessResponse>(
    `${workerPath(projectId, workerId)}/stop`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
  );
  return response.process;
}

export async function restartProjectRailsWorker(
  projectId: string,
  workerId: RailsWorkerId,
): Promise<ManagedProcess> {
  const response = await requestJson<RailsWorkerProcessResponse>(
    `${workerPath(projectId, workerId)}/restart`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
  );
  return response.process;
}

export async function fetchProjectRailsWorkerLog(
  projectId: string,
  workerId: RailsWorkerId,
): Promise<ProcessLogSnapshot> {
  const response = await requestJson<RailsWorkerLogResponse>(
    `${workerPath(projectId, workerId)}/logs`,
  );
  return response.log;
}

export function followProjectRailsWorkerLogEvents(
  projectId: string,
  workerId: RailsWorkerId,
  onEvent: (log: ProcessLogSnapshot) => void,
): { close: () => void; done: Promise<void> } {
  return followEventStream(
    `${workerPath(projectId, workerId)}/logs/events`,
    onEvent,
  );
}

export async function clearProjectRailsWorkerLog(
  projectId: string,
  workerId: RailsWorkerId,
): Promise<ProcessLogSnapshot> {
  const response = await requestJson<RailsWorkerLogResponse>(
    `${workerPath(projectId, workerId)}/logs`,
    {
      method: 'DELETE',
    },
  );
  return response.log;
}

export async function fetchProjectRailsCredentials(
  projectId: string,
): Promise<RailsCredentialsOverview> {
  const response = await requestJson<RailsCredentialsResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/rails/credentials`,
  );
  return response.credentials;
}
