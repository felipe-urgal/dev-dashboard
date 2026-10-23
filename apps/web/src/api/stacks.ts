import type {
  Stack,
  StackCheck,
  StackDependencyDiscovery,
  StackLogsSnapshot,
  StackResource,
  StackRestartResult,
  StackStartResult,
  StackStopResult,
} from '@dev-dashboard/contracts';

import { requestJson } from './core';

interface StackListResponse {
  stacks: Stack[];
  revisions: Record<string, string>;
}

interface StackResourcesResponse {
  resources: StackResource[];
}

export async function fetchStackResources(): Promise<StackResource[]> {
  const response = await requestJson<StackResourcesResponse>('/api/stacks/resources');
  return response.resources;
}

interface StackCheckResponse {
  check: StackCheck;
}

interface StackDependencyDiscoveryResponse {
  discovery: StackDependencyDiscovery;
}

interface StackResponse {
  stack: Stack;
}

interface StackStartResponse {
  result: StackStartResult;
}

interface StackStopResponse {
  result: StackStopResult;
}

interface StackRestartResponse {
  result: StackRestartResult;
}

interface StackLogsResponse {
  logs: StackLogsSnapshot;
}

function stackUrl(stackId: string, suffix = ''): string {
  return `/api/stacks/${encodeURIComponent(stackId)}${suffix}`;
}

export async function fetchStacks(
  signal?: AbortSignal,
): Promise<StackListResponse> {
  const response = await requestJson<StackListResponse>(
    '/api/stacks',
    signal ? { signal } : {},
  );
  return response;
}

export async function saveStack(
  stack: Stack,
  expectedRevision?: string,
): Promise<Stack> {
  const response = await requestJson<StackResponse>(stackUrl(stack.id), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...stack,
      ...(expectedRevision ? { expectedRevision } : {}),
    }),
  });
  return response.stack;
}

export async function fetchStackDependencySuggestions(
  stackId: string,
  signal?: AbortSignal,
): Promise<StackDependencyDiscovery> {
  const response = await requestJson<StackDependencyDiscoveryResponse>(
    stackUrl(stackId, '/dependency-suggestions'),
    signal ? { signal } : {},
  );
  return response.discovery;
}

export async function fetchStackCheck(
  stackId: string,
  signal?: AbortSignal,
): Promise<StackCheck> {
  const response = await requestJson<StackCheckResponse>(
    stackUrl(stackId, '/check'),
    signal ? { signal } : {},
  );
  return response.check;
}

export async function startStack(
  stackId: string,
  expectedRevision: string,
): Promise<StackStartResult> {
  const response = await requestJson<StackStartResponse>(
    stackUrl(stackId, '/start'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision }),
    },
  );
  return response.result;
}

export async function stopStack(
  stackId: string,
  expectedRevision: string,
): Promise<StackStopResult> {
  const response = await requestJson<StackStopResponse>(
    stackUrl(stackId, '/stop'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision }),
    },
  );
  return response.result;
}

export async function restartStackNode(
  stackId: string,
  nodeId: string,
  expectedRevision: string,
): Promise<StackRestartResult> {
  const response = await requestJson<StackRestartResponse>(
    stackUrl(stackId, `/nodes/${encodeURIComponent(nodeId)}/restart`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision }),
    },
  );
  return response.result;
}

export async function fetchStackLogs(
  stackId: string,
  signal?: AbortSignal,
): Promise<StackLogsSnapshot> {
  const response = await requestJson<StackLogsResponse>(
    stackUrl(stackId, '/logs'),
    signal ? { signal } : {},
  );
  return response.logs;
}

export async function deleteStack(
  stackId: string,
  expectedRevision: string,
): Promise<void> {
  await requestJson<void>(stackUrl(stackId), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedRevision }),
  });
}
