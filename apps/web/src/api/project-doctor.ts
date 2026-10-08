import type { ProjectDiagnosticReport } from '@dev-dashboard/contracts';

import { requestJson } from './core';

interface ProjectDoctorResponse {
  report: ProjectDiagnosticReport;
}

export async function fetchProjectDoctor(
  projectId: string,
  refresh = false,
  environmentInstanceId?: string,
): Promise<ProjectDiagnosticReport> {
  const params = new URLSearchParams();
  if (refresh) params.set('refresh', 'true');
  if (environmentInstanceId) params.set('environmentInstanceId', environmentInstanceId);
  const query = params.size ? `?${params.toString()}` : '';
  const response = await requestJson<ProjectDoctorResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/doctor${query}`,
  );
  return response.report;
}
