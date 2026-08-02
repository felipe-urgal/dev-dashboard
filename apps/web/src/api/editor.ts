import type {
  ProjectEditorAvailability,
  ProjectEditorId,
  ProjectEditorLaunchResult,
} from '@dev-dashboard/contracts';

import { requestJson } from './core';

export function fetchProjectEditors(
  projectId: string,
): Promise<ProjectEditorAvailability> {
  return requestJson<ProjectEditorAvailability>(
    `/api/projects/${encodeURIComponent(projectId)}/editors`,
  );
}

export function openProjectEditor(
  projectId: string,
  editorId: ProjectEditorId,
): Promise<ProjectEditorLaunchResult> {
  return requestJson<ProjectEditorLaunchResult>(
    `/api/projects/${encodeURIComponent(projectId)}/editor`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editorId }),
    },
  );
}
