import type {
  ProjectDirectoryListing,
  ProjectFileContent,
  ProjectFileSearchResult,
  ProjectFileWriteRequest,
} from '@dev-dashboard/contracts';

import { requestJson } from './core';

function projectFilesPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/files`;
}

export function fetchProjectDirectory(
  projectId: string,
  relativePath = '',
): Promise<ProjectDirectoryListing> {
  const query = relativePath
    ? `?path=${encodeURIComponent(relativePath)}`
    : '';
  return requestJson<ProjectDirectoryListing>(
    `${projectFilesPath(projectId)}${query}`,
  );
}

export function fetchProjectFileContent(
  projectId: string,
  relativePath: string,
): Promise<ProjectFileContent> {
  return requestJson<ProjectFileContent>(
    `${projectFilesPath(projectId)}/content?path=${encodeURIComponent(relativePath)}`,
  );
}

export function saveProjectFileContent(
  projectId: string,
  input: ProjectFileWriteRequest,
): Promise<ProjectFileContent> {
  return requestJson<ProjectFileContent>(
    `${projectFilesPath(projectId)}/content`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
}

export function searchProjectFiles(
  projectId: string,
  query: string,
  limit = 50,
): Promise<ProjectFileSearchResult> {
  const parameters = new URLSearchParams({
    query,
    limit: String(limit),
  });
  return requestJson<ProjectFileSearchResult>(
    `${projectFilesPath(projectId)}/search?${parameters.toString()}`,
  );
}
