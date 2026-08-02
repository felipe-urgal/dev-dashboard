import type {
  ProjectScriptCatalog,
  ScriptExecution,
  ScriptExecutionConfirmation,
  ScriptExecutionEvent,
  ScriptExecutionHistory,
  ScriptExecutionLog,
  ScriptExecutionVariables,
} from '@dev-dashboard/contracts';

import { followEventStream, requestJson } from './core';

interface ScriptCatalogResponse { catalog: ProjectScriptCatalog }
interface ScriptExecutionResponse { execution: ScriptExecution }
interface LatestScriptExecutionResponse { execution: ScriptExecution | null }
interface ScriptExecutionHistoryResponse { history: ScriptExecutionHistory }
interface ScriptExecutionLogResponse { log: ScriptExecutionLog }
interface ScriptExecutionConfirmationResponse { confirmation: ScriptExecutionConfirmation }

export async function fetchProjectScripts(projectId: string, query: URLSearchParams): Promise<ProjectScriptCatalog> {
  const response = await requestJson<ScriptCatalogResponse>(`/api/projects/${encodeURIComponent(projectId)}/scripts?${query.toString()}`);
  return response.catalog;
}

export async function prepareScriptExecution(projectId: string, actionId: string, variables: ScriptExecutionVariables = {}): Promise<ScriptExecutionConfirmation> {
  const response = await requestJson<ScriptExecutionConfirmationResponse>(`/api/projects/${encodeURIComponent(projectId)}/scripts/confirmations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actionId, variables }) });
  return response.confirmation;
}
export async function startScriptExecution(projectId: string, actionId: string, confirmationToken?: string, variables: ScriptExecutionVariables = {}): Promise<ScriptExecution> {
  const response = await requestJson<ScriptExecutionResponse>(`/api/projects/${encodeURIComponent(projectId)}/scripts/executions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actionId, variables, ...(confirmationToken ? { confirmationToken } : {}) }) });
  return response.execution;
}
export async function fetchScriptExecution(projectId: string, executionId: string): Promise<ScriptExecution> {
  const response = await requestJson<ScriptExecutionResponse>(`/api/projects/${encodeURIComponent(projectId)}/scripts/executions/${encodeURIComponent(executionId)}`); return response.execution;
}
export async function fetchLatestScriptExecution(projectId: string): Promise<ScriptExecution | null> {
  const response = await requestJson<LatestScriptExecutionResponse>(`/api/projects/${encodeURIComponent(projectId)}/scripts/executions/latest`); return response.execution;
}
export async function fetchScriptExecutionHistory(projectId: string, page = 1): Promise<ScriptExecutionHistory> {
  const response = await requestJson<ScriptExecutionHistoryResponse>(`/api/projects/${encodeURIComponent(projectId)}/scripts/executions?page=${page}&pageSize=10`); return response.history;
}
export async function fetchScriptExecutionLog(projectId: string, executionId: string): Promise<ScriptExecutionLog> {
  const response = await requestJson<ScriptExecutionLogResponse>(`/api/projects/${encodeURIComponent(projectId)}/scripts/executions/${encodeURIComponent(executionId)}/log`); return response.log;
}

export function followScriptExecutionEvents(
  projectId: string,
  executionId: string,
  onEvent: (event: ScriptExecutionEvent) => void,
): { close: () => void; done: Promise<void> } {
  return followEventStream(
    `/api/projects/${encodeURIComponent(projectId)}/scripts/executions/${encodeURIComponent(executionId)}/events`,
    onEvent,
  );
}

export async function cancelScriptExecution(projectId: string, executionId: string): Promise<ScriptExecution> {
  const response = await requestJson<ScriptExecutionResponse>(`/api/projects/${encodeURIComponent(projectId)}/scripts/executions/${encodeURIComponent(executionId)}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); return response.execution;
}
