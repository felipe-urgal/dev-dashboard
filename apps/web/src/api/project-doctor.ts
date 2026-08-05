import type { ProjectDiagnosticReport } from '@dev-dashboard/contracts';

import { requestJson } from './core';

interface ProjectDoctorResponse {
  report: ProjectDiagnosticReport;
}

export async function fetchProjectDoctor(
  projectId: string,
  refresh = false,
): Promise<ProjectDiagnosticReport> {
  const query = refresh ? '?refresh=true' : '';
  const response = await requestJson<ProjectDoctorResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/doctor${query}`,
  );
  return response.report;
}
