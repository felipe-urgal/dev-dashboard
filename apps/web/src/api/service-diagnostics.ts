import type { ProjectServiceBindingView } from '@dev-dashboard/contracts';

import { requestJson } from './core';

export async function fetchProjectServiceBindings(
  projectId: string,
  signal?: AbortSignal,
): Promise<{
  revision: string;
  bindings: ProjectServiceBindingView[];
  partial: boolean;
}> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/service-bindings`,
    signal ? { signal } : {},
  );
}
