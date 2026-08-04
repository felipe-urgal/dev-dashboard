import type {
  AiChatMessage,
  AiChatStreamEvent,
  AiCompletionResult,
  ProjectAiStatus,
} from '@dev-dashboard/contracts';

import { followEventStream, requestJson } from './core';

export function fetchProjectAiStatus(projectId: string): Promise<ProjectAiStatus> {
  return requestJson<ProjectAiStatus>(
    `/api/projects/${encodeURIComponent(projectId)}/ai/status`,
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
    `/api/projects/${encodeURIComponent(projectId)}/ai/complete`,
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
    `/api/projects/${encodeURIComponent(projectId)}/ai/chat`,
    onEvent,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages }),
    },
  );
}
