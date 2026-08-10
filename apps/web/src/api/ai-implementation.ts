import type {
  AiImplementationExecution,
  AiImplementationExecutionList,
  ProjectWorkspaceEditResult,
} from '@dev-dashboard/contracts';

import { requestJson } from './core';

function implementationPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/ai/implementations`;
}

export function fetchProjectAiImplementation(
  projectId: string,
): Promise<AiImplementationExecutionList> {
  return requestJson<AiImplementationExecutionList>(
    implementationPath(projectId),
  );
}

export function startProjectAiImplementation(
  projectId: string,
  model: string,
  prompt: string,
): Promise<{ execution: AiImplementationExecution }> {
  return requestJson<{ execution: AiImplementationExecution }>(
    implementationPath(projectId),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt }),
    },
  );
}

export function cancelProjectAiImplementation(
  projectId: string,
  executionId: string,
): Promise<{ execution: AiImplementationExecution }> {
  return requestJson<{ execution: AiImplementationExecution }>(
    `${implementationPath(projectId)}/${encodeURIComponent(executionId)}/cancel`,
    { method: 'POST' },
  );
}

export function applyProjectWorkspaceEdit(
  projectId: string,
  confirmationToken: string,
): Promise<ProjectWorkspaceEditResult> {
  return requestJson<ProjectWorkspaceEditResult>(
    `/api/projects/${encodeURIComponent(projectId)}/files/workspace-edits/apply`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmationToken }),
    },
  );
}
