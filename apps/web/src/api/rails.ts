import type {
  DatabaseRestoreResult,
  DatabaseServiceAction,
  DatabaseSnapshot,
  DatabaseSnapshotConfirmation,
  DatabaseSnapshotList,
  ProjectDatabaseOverview,
  ProjectDatabaseSecret,
  ProjectDatabaseServiceActionResult,
  RailsGeneratorConfirmation,
  RailsGeneratorField,
  RailsGeneratorKind,
  RailsGeneratorResult,
  RailsMigrationMutationConfirmation,
  RailsMigrationMutationOperation,
  RailsMigrationMutationResult,
  RailsMigrationsOverview,
} from '@dev-dashboard/contracts';

import { requestJson } from './core';

interface ProjectDatabaseResponse { database: ProjectDatabaseOverview; }
interface ProjectDatabaseSecretResponse { secret: ProjectDatabaseSecret; }
interface ProjectDatabaseServiceActionResponse { action: ProjectDatabaseServiceActionResult; }

export async function fetchProjectDatabase(projectId: string, page = 1): Promise<ProjectDatabaseOverview> {
  const query = new URLSearchParams({ page: String(page), pageSize: '20' });
  const response = await requestJson<ProjectDatabaseResponse>(`/api/projects/${encodeURIComponent(projectId)}/database?${query}`);
  return response.database;
}

export async function revealProjectDatabaseUrl(projectId: string, environmentId: string): Promise<ProjectDatabaseSecret> {
  const response = await requestJson<ProjectDatabaseSecretResponse>(`/api/projects/${encodeURIComponent(projectId)}/database/${encodeURIComponent(environmentId)}/reveal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  });
  return response.secret;
}

export async function runProjectDatabaseServiceAction(projectId: string, environmentId: string, action: DatabaseServiceAction): Promise<ProjectDatabaseServiceActionResult> {
  const response = await requestJson<ProjectDatabaseServiceActionResponse>(`/api/projects/${encodeURIComponent(projectId)}/database/${encodeURIComponent(environmentId)}/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  });
  return response.action;
}

interface ProjectDatabaseSnapshotsResponse { snapshots: DatabaseSnapshotList; }
interface ProjectDatabaseSnapshotResponse { snapshot: DatabaseSnapshot; }
interface ProjectDatabaseSnapshotConfirmationResponse { confirmation: DatabaseSnapshotConfirmation; }
interface ProjectDatabaseRestoreResponse { restore: DatabaseRestoreResult; }

function snapshotsPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/database/snapshots`;
}

export async function fetchProjectDatabaseSnapshots(projectId: string): Promise<DatabaseSnapshotList> {
  const response = await requestJson<ProjectDatabaseSnapshotsResponse>(snapshotsPath(projectId));
  return response.snapshots;
}

export async function createProjectDatabaseSnapshot(projectId: string, environmentId: string): Promise<DatabaseSnapshot> {
  const response = await requestJson<ProjectDatabaseSnapshotResponse>(snapshotsPath(projectId), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ environmentId }),
  });
  return response.snapshot;
}

export async function prepareProjectDatabaseRestore(projectId: string, snapshotId: string): Promise<DatabaseSnapshotConfirmation> {
  const response = await requestJson<ProjectDatabaseSnapshotConfirmationResponse>(
    `${snapshotsPath(projectId)}/${encodeURIComponent(snapshotId)}/restore/confirmation`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) },
  );
  return response.confirmation;
}

export async function restoreProjectDatabaseSnapshot(projectId: string, snapshotId: string, confirmationToken: string): Promise<DatabaseRestoreResult> {
  const response = await requestJson<ProjectDatabaseRestoreResponse>(
    `${snapshotsPath(projectId)}/${encodeURIComponent(snapshotId)}/restore`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmationToken }) },
  );
  return response.restore;
}

interface ProjectRailsMigrationsResponse { migrations: RailsMigrationsOverview; }

export async function fetchProjectRailsMigrations(projectId: string, database?: string): Promise<RailsMigrationsOverview> {
  const query = database ? `?${new URLSearchParams({ database })}` : '';
  const response = await requestJson<ProjectRailsMigrationsResponse>(`/api/projects/${encodeURIComponent(projectId)}/rails/migrations${query}`);
  return response.migrations;
}

interface RailsMutationConfirmationResponse { confirmation: RailsMigrationMutationConfirmation }
interface RailsMutationResultResponse { result: RailsMigrationMutationResult }

export async function prepareProjectRailsMutation(projectId: string, operation: RailsMigrationMutationOperation): Promise<RailsMigrationMutationConfirmation> {
  const response = await requestJson<RailsMutationConfirmationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/rails/migrations/confirmations`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation }) },
  );
  return response.confirmation;
}

export async function runProjectRailsMutation(projectId: string, operation: RailsMigrationMutationOperation, confirmationToken: string): Promise<RailsMigrationMutationResult> {
  const response = await requestJson<RailsMutationResultResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/rails/migrations/mutations`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation, confirmationToken }) },
  );
  return response.result;
}

interface RailsGeneratorConfirmationResponse { confirmation: RailsGeneratorConfirmation }
interface RailsGeneratorResultResponse { result: RailsGeneratorResult }

export async function prepareProjectRailsGenerator(
  projectId: string,
  kind: RailsGeneratorKind,
  name: string,
  fields: RailsGeneratorField[],
  database?: string,
): Promise<RailsGeneratorConfirmation> {
  const response = await requestJson<RailsGeneratorConfirmationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/rails/generate/confirmations`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, name, fields, ...(database ? { database } : {}) }) },
  );
  return response.confirmation;
}

export async function runProjectRailsGenerator(projectId: string, confirmationToken: string): Promise<RailsGeneratorResult> {
  const response = await requestJson<RailsGeneratorResultResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/rails/generate/mutations`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmationToken }) },
  );
  return response.result;
}
