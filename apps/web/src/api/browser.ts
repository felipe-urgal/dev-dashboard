import type {
  ProjectBrowserOpenResult,
  ProjectBrowserTarget,
} from '@dev-dashboard/contracts';

import { requestJson } from './core';

export function openProjectBrowserTarget(
  projectId: string,
  target: ProjectBrowserTarget,
): Promise<ProjectBrowserOpenResult> {
  return requestJson<ProjectBrowserOpenResult>(
    `/api/projects/${encodeURIComponent(projectId)}/browser/open`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    },
  );
}
