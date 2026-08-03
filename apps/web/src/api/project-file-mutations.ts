import type {
  ProjectFileCreateRequest,
  ProjectFileMutationApplyRequest,
  ProjectFileMutationPreview,
  ProjectFileMutationPreviewRequest,
  ProjectFileMutationResult,
} from '@dev-dashboard/contracts';

import { requestJson } from './core';

function mutationPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/files`;
}

export function createProjectFileEntry(
  projectId: string,
  input: ProjectFileCreateRequest,
): Promise<ProjectFileMutationResult> {
  return requestJson<ProjectFileMutationResult>(
    `${mutationPath(projectId)}/entries`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
}

export function previewProjectFileMutation(
  projectId: string,
  input: ProjectFileMutationPreviewRequest,
): Promise<ProjectFileMutationPreview> {
  return requestJson<ProjectFileMutationPreview>(
    `${mutationPath(projectId)}/mutations/preview`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
}

export function applyProjectFileMutation(
  projectId: string,
  input: ProjectFileMutationApplyRequest,
): Promise<ProjectFileMutationResult> {
  return requestJson<ProjectFileMutationResult>(
    `${mutationPath(projectId)}/mutations/apply`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
}
