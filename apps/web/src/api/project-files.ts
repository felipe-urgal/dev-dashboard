import type { ProjectFileContent } from '@dev-dashboard/contracts';

import { requestJson } from './core';

function projectFilesPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/files`;
}

export function fetchProjectFileContent(
  projectId: string,
  relativePath: string,
): Promise<ProjectFileContent> {
  return requestJson<ProjectFileContent>(
    `${projectFilesPath(projectId)}/content?path=${encodeURIComponent(relativePath)}`,
  );
}
