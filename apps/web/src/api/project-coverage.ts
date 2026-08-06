import type {
  ProjectCoverageHistory,
  ProjectCoverageSummary,
} from '@dev-dashboard/contracts';

import { requestJson } from './core';

interface ProjectCoverageResponse {
  coverage: ProjectCoverageSummary;
}

interface ProjectCoverageHistoryResponse {
  history: ProjectCoverageHistory;
}

export async function fetchProjectCoverage(
  projectId: string,
): Promise<ProjectCoverageSummary> {
  const response = await requestJson<ProjectCoverageResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/coverage`,
  );
  return response.coverage;
}

export async function fetchProjectCoverageHistory(
  projectId: string,
): Promise<ProjectCoverageHistory> {
  const response = await requestJson<ProjectCoverageHistoryResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/coverage/history`,
  );
  return response.history;
}
