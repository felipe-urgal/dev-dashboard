import type {
  ProjectServiceBindingView,
  ServiceDiagnosticsSnapshot,
  ServiceLifecyclePlan,
} from '@dev-dashboard/contracts';

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

export async function fetchServiceDiagnostics(
  projectId: string,
  serviceRef: string,
  environmentInstanceId?: string,
  signal?: AbortSignal,
): Promise<ServiceDiagnosticsSnapshot> {
  const query = environmentInstanceId
    ? '?environmentInstanceId=' + encodeURIComponent(environmentInstanceId)
    : '';
  const response = await requestJson<{
    diagnostics: ServiceDiagnosticsSnapshot;
  }>(
    `/api/projects/${encodeURIComponent(projectId)}/services/${encodeURIComponent(serviceRef)}/diagnostics${query}`,
    signal ? { signal } : {},
  );
  return response.diagnostics;
}

/** The existing server-side Start plan is observational and never executable. */
export async function fetchServiceDependencyPreview(
  projectId: string,
  environmentInstanceId?: string,
  signal?: AbortSignal,
): Promise<ServiceLifecyclePlan> {
  const query = new URLSearchParams({ action: 'start' });
  if (environmentInstanceId) {
    query.set('environmentInstanceId', environmentInstanceId);
  }
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/service-plan?${query.toString()}`,
    signal ? { signal } : {},
  );
}
