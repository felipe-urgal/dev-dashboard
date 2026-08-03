import type {
  ProjectDirectoryListing,
  ProjectFileContent,
  ProjectFileSearchResult,
  ProjectFileWatchRequest,
  ProjectFileWatchResult,
  ProjectFileWriteRequest,
  ProjectWorkspaceEditApplyRequest,
  ProjectWorkspaceEditPreview,
  ProjectWorkspaceEditRequest,
  ProjectWorkspaceEditResult,
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

export function watchProjectFiles(
  projectId: string,
  input: ProjectFileWatchRequest,
): Promise<ProjectFileWatchResult> {
  return requestJson<ProjectFileWatchResult>(
    `${projectFilesPath(projectId)}/watch`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
}

export function previewProjectWorkspaceEdit(
  projectId: string,
  input: ProjectWorkspaceEditRequest,
): Promise<ProjectWorkspaceEditPreview> {
  return requestJson<ProjectWorkspaceEditPreview>(
    `${projectFilesPath(projectId)}/workspace-edits/preview`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
}

export function applyProjectWorkspaceEdit(
  projectId: string,
  input: ProjectWorkspaceEditApplyRequest,
): Promise<ProjectWorkspaceEditResult> {
  return requestJson<ProjectWorkspaceEditResult>(
    `${projectFilesPath(projectId)}/workspace-edits/apply`,
    {
      method: 'POST',
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
