import type {
  ProjectEnvironmentOverview,
  ProjectEnvironmentVariableValue,
} from '@dev-dashboard/contracts';

import { requestJson } from './core';

interface ProjectEnvironmentResponse { environment: ProjectEnvironmentOverview }
interface ProjectEnvironmentVariableValueResponse { variable: ProjectEnvironmentVariableValue }

export async function fetchProjectEnvironmentVariables(projectId: string): Promise<ProjectEnvironmentOverview> {
  const response = await requestJson<ProjectEnvironmentResponse>(`/api/projects/${encodeURIComponent(projectId)}/environment-variables`);
  return response.environment;
}

export async function fetchProjectEnvironmentVariableValue(
  projectId: string,
  file: string,
  name: string,
): Promise<ProjectEnvironmentVariableValue> {
  const search = new URLSearchParams({ file, name });
  const response = await requestJson<ProjectEnvironmentVariableValueResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/environment-variables/value?${search}`,
  );
  return response.variable;
}
