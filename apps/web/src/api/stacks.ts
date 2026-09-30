import type {
  Stack,
  StackCheck,
  StackRestartResult,
  StackStartResult,
  StackStopResult,
} from '@dev-dashboard/contracts';

import { requestJson } from './core';

interface StackListResponse {
  stacks: Stack[];
}

interface StackCheckResponse {
  check: StackCheck;
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

function stackUrl(stackId: string, suffix = ''): string {
  return `/api/stacks/${encodeURIComponent(stackId)}${suffix}`;
}

export async function fetchStacks(signal?: AbortSignal): Promise<Stack[]> {
  const response = await requestJson<StackListResponse>(
    '/api/stacks',
    signal ? { signal } : {},
  );
  return response.stacks;
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

export async function startStack(stackId: string): Promise<StackStartResult> {
  const response = await requestJson<StackStartResponse>(
    stackUrl(stackId, '/start'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    },
  );
  return response.result;
}

export async function stopStack(stackId: string): Promise<StackStopResult> {
  const response = await requestJson<StackStopResponse>(
    stackUrl(stackId, '/stop'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    },
  );
  return response.result;
}

export async function restartStackNode(
  stackId: string,
  nodeId: string,
): Promise<StackRestartResult> {
  const response = await requestJson<StackRestartResponse>(
    stackUrl(stackId, `/nodes/${encodeURIComponent(nodeId)}/restart`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    },
  );
  return response.result;
}
