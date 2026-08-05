import type { ProjectFileEntry } from '@dev-dashboard/contracts';

import { requestJson } from './core';

interface ProjectMarkdownFilesResponse {
  files: ProjectFileEntry[];
  truncated: boolean;
}

export async function fetchProjectMarkdownFiles(
  projectId: string,
): Promise<ProjectMarkdownFilesResponse> {
  return requestJson<ProjectMarkdownFilesResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/readme/files`,
  );
}
