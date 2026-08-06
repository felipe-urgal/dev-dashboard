import type { ProjectCoverageSummary } from '@dev-dashboard/contracts';

import { requestJson } from './core';

interface ProjectCoverageResponse {
  coverage: ProjectCoverageSummary;
}

export async function fetchProjectCoverage(
  projectId: string,
): Promise<ProjectCoverageSummary> {
  const response = await requestJson<ProjectCoverageResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/coverage`,
  );
  return response.coverage;
}
