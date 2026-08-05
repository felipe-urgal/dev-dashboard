import type { ProjectEnvironmentOverview } from '@dev-dashboard/contracts';

import { requestJson } from './core';

interface ProjectEnvironmentResponse { environment: ProjectEnvironmentOverview }

export async function fetchProjectEnvironmentVariables(projectId: string): Promise<ProjectEnvironmentOverview> {
  const response = await requestJson<ProjectEnvironmentResponse>(`/api/projects/${encodeURIComponent(projectId)}/environment-variables`);
  return response.environment;
}
