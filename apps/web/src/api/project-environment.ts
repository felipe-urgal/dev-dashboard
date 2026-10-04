import type {
  ProjectEnvironmentContract,
  ProjectEnvironmentOverview,
  ProjectEnvironmentVariableValue,
} from '@dev-dashboard/contracts';

import { requestJson } from './core';

interface ProjectEnvironmentResponse {
  environment: ProjectEnvironmentOverview;
}
interface ProjectEnvironmentContractResponse {
  contract: ProjectEnvironmentContract;
}
interface ProjectEnvironmentVariableValueResponse {
  variable: ProjectEnvironmentVariableValue;
}

function environmentQuery(environmentInstanceId?: string): string {
  if (!environmentInstanceId) return '';
  const search = new URLSearchParams({ environmentInstanceId });
  return `?${search.toString()}`;
}

export async function fetchProjectEnvironmentVariables(
  projectId: string,
  environmentInstanceId?: string,
): Promise<ProjectEnvironmentOverview> {
  const response = await requestJson<ProjectEnvironmentResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/environment-variables${environmentQuery(environmentInstanceId)}`,
  );
  return response.environment;
}

export async function fetchProjectEnvironmentContract(
  projectId: string,
  environmentInstanceId?: string,
): Promise<ProjectEnvironmentContract> {
  const response = await requestJson<ProjectEnvironmentContractResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/environment-contract${environmentQuery(environmentInstanceId)}`,
  );
  return response.contract;
}

export async function fetchProjectEnvironmentVariableValue(
  projectId: string,
  file: string,
  name: string,
  environmentInstanceId?: string,
): Promise<ProjectEnvironmentVariableValue> {
  const response = await requestJson<ProjectEnvironmentVariableValueResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/environment-variables/reveal${environmentQuery(environmentInstanceId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, name }),
      cache: 'no-store',
    },
  );
  return response.variable;
}
