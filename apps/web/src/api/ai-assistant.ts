import type {
  AiChatMessage,
  AiChatStreamEvent,
  AiCompletionResult,
  AiExecutionMode,
  AiModelPullStreamEvent,
  AiProviderId,
  AiRecommendedModelName,
  ProjectAiProvidersStatus,
  ProjectAiStatus,
} from '@dev-dashboard/contracts';

import { followEventStream, requestJson } from './core';

function projectAiPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/ai`;
}

export function fetchProjectAiStatus(
  projectId: string,
): Promise<ProjectAiStatus> {
  return requestJson<ProjectAiStatus>(`${projectAiPath(projectId)}/status`);
}

export function fetchProjectAiProviders(
  projectId: string,
): Promise<ProjectAiProvidersStatus> {
  return requestJson<ProjectAiProvidersStatus>(
    `${projectAiPath(projectId)}/providers`,
  );
}

export function updateProjectAiSelection(
  projectId: string,
  provider: AiProviderId,
  mode: AiExecutionMode,
): Promise<ProjectAiProvidersStatus> {
  return requestJson<ProjectAiProvidersStatus>(
    `${projectAiPath(projectId)}/selection`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, mode }),
    },
  );
}

export function updateProjectAiProviderConsent(
  projectId: string,
  provider: AiProviderId,
  granted: boolean,
): Promise<ProjectAiProvidersStatus> {
  return requestJson<ProjectAiProvidersStatus>(
    `${projectAiPath(projectId)}/providers/${encodeURIComponent(provider)}/consent`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ granted }),
    },
  );
}

export function completeProjectAi(
  projectId: string,
  model: string,
  prefix: string,
  suffix: string,
  signal: AbortSignal,
): Promise<AiCompletionResult> {
  return requestJson<AiCompletionResult>(
    `${projectAiPath(projectId)}/complete`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prefix, ...(suffix ? { suffix } : {}) }),
      signal,
    },
  );
}

export function streamProjectAiChat(
  projectId: string,
  model: string,
  messages: AiChatMessage[],
  onEvent: (event: AiChatStreamEvent) => void,
): { close: () => void; done: Promise<void> } {
  return followEventStream<AiChatStreamEvent>(
    `${projectAiPath(projectId)}/chat`,
    onEvent,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages }),
    },
  );
}

export function streamProjectAiModelPull(
  projectId: string,
  model: AiRecommendedModelName,
  onEvent: (event: AiModelPullStreamEvent) => void,
): { close: () => void; done: Promise<void> } {
  return followEventStream<AiModelPullStreamEvent>(
    `${projectAiPath(projectId)}/models/pull`,
    onEvent,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    },
  );
}
