import type {
  TaskContext,
  TaskContextSnapshot,
} from '@dev-dashboard/contracts';

import { requestJson } from './core';

interface TaskContextsResponse {
  contexts: TaskContext[];
}

interface TaskContextSnapshotResponse {
  snapshot: TaskContextSnapshot;
}

export async function fetchTaskContexts(
  projectId: string,
  signal?: AbortSignal,
): Promise<TaskContext[]> {
  const response = await requestJson<TaskContextsResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/task-contexts`,
    signal ? { signal } : {},
  );
  return response.contexts;
}

export async function fetchTaskContextSnapshot(
  projectId: string,
  taskContextId: string,
  signal?: AbortSignal,
): Promise<TaskContextSnapshot> {
  const response = await requestJson<TaskContextSnapshotResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/task-contexts/${encodeURIComponent(taskContextId)}`,
    signal ? { signal } : {},
  );
  return response.snapshot;
}
