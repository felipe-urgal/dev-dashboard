import type {
  ActivityList,
  ActivityOrigin,
  ActivityStatus,
} from '@dev-dashboard/contracts';

import { requestJson } from './core';

export interface ActivityQuery {
  workspaceId?: string;
  projectId?: string;
  origin?: ActivityOrigin;
  status?: ActivityStatus;
  search?: string;
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
}

interface ActivityListResponse {
  activities: ActivityList;
}

export function buildActivityQuery(query: ActivityQuery): string {
  const parameters = new URLSearchParams();
  if (query.workspaceId) parameters.set('workspaceId', query.workspaceId);
  if (query.projectId) parameters.set('projectId', query.projectId);
  if (query.origin) parameters.set('origin', query.origin);
  if (query.status) parameters.set('status', query.status);
  if (query.search) parameters.set('search', query.search);
  if (query.page !== undefined) parameters.set('page', String(query.page));
  if (query.pageSize !== undefined)
    parameters.set('pageSize', String(query.pageSize));
  return parameters.toString();
}

export async function fetchActivities(
  query: ActivityQuery = {},
): Promise<ActivityList> {
  const search = buildActivityQuery(query);
  const url = `/api/activities${search ? `?${search}` : ''}`;
  const init: RequestInit = query.signal ? { signal: query.signal } : {};
  const response = await requestJson<ActivityListResponse>(url, init);
  return response.activities;
}
