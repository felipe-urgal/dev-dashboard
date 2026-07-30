import type {
  BundlerOverview,
  ProjectDatabaseOverview,
  ProjectDatabaseSecret,
  ProjectDatabaseStartResult,
  RailsMigrationMutationConfirmation,
  RailsMigrationMutationOperation,
  RailsMigrationMutationResult,
  RailsMigrationsOverview,
  RailsRoutesOverview,
} from '@dev-dashboard/contracts';

import { requestJson } from './core';

interface ProjectDatabaseResponse { database: ProjectDatabaseOverview; }
interface ProjectDatabaseSecretResponse { secret: ProjectDatabaseSecret; }
interface ProjectDatabaseStartResponse { start: ProjectDatabaseStartResult; }

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

export async function startProjectDatabase(projectId: string, environmentId: string): Promise<ProjectDatabaseStartResult> {
  const response = await requestJson<ProjectDatabaseStartResponse>(`/api/projects/${encodeURIComponent(projectId)}/database/${encodeURIComponent(environmentId)}/start`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  });
  return response.start;
}

interface ProjectRailsMigrationsResponse { migrations: RailsMigrationsOverview; }
interface ProjectRailsRoutesResponse { routes: RailsRoutesOverview; }

export async function fetchProjectRailsMigrations(projectId: string): Promise<RailsMigrationsOverview> {
  const response = await requestJson<ProjectRailsMigrationsResponse>(`/api/projects/${encodeURIComponent(projectId)}/rails/migrations`);
  return response.migrations;
}

export async function fetchProjectRailsRoutes(projectId: string): Promise<RailsRoutesOverview> {
  const response = await requestJson<ProjectRailsRoutesResponse>(`/api/projects/${encodeURIComponent(projectId)}/rails/routes`);
  return response.routes;
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

interface ProjectBundlerResponse { bundler: BundlerOverview; }

export async function fetchProjectBundler(projectId: string): Promise<BundlerOverview> {
  const response = await requestJson<ProjectBundlerResponse>(`/api/projects/${encodeURIComponent(projectId)}/bundler`);
  return response.bundler;
}
