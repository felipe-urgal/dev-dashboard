import type {
  ManagedProcess,
  ProcessLogSnapshot,
  ProjectTestFile,
  ProjectTestOverview,
  TestExecutionEvent,
  TestExecutionHistory,
  TestIntelligenceSuggestion,
} from '@dev-dashboard/contracts';

import { followEventStream, requestJson } from './core';

interface ProcessResponse {
  process: ManagedProcess | null;
}

interface ProcessLogResponse {
  log: ProcessLogSnapshot;
}

interface ProjectTestsResponse {
  tests: ProjectTestOverview;
}

interface ProjectTestIntelligenceResponse {
  suggestion: TestIntelligenceSuggestion;
}

export interface ProjectRelatedTests {
  baseBranch: string;
  currentBranch: string;
  changedFiles: string[];
  testFiles: ProjectTestFile[];
}

interface ProjectRelatedTestsResponse {
  related: ProjectRelatedTests;
}

function environmentQuery(environmentInstanceId?: string): string {
  return environmentInstanceId
    ? `?environmentInstanceId=${encodeURIComponent(environmentInstanceId)}`
    : '';
}

function appendEnvironmentInstance(
  query: URLSearchParams,
  environmentInstanceId?: string,
): void {
  if (environmentInstanceId) {
    query.set('environmentInstanceId', environmentInstanceId);
  }
}

export async function fetchProjectTests(
  projectId: string,
  options: { refresh?: boolean; environmentInstanceId?: string } = {},
): Promise<ProjectTestOverview> {
  const parameters = new URLSearchParams();
  if (options.refresh) parameters.set('refresh', 'true');
  appendEnvironmentInstance(parameters, options.environmentInstanceId);
  const query = parameters.size > 0 ? `?${parameters}` : '';
  const response = await requestJson<ProjectTestsResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests${query}`,
  );
  return response.tests;
}

export async function fetchProjectTestIntelligence(
  projectId: string,
  commandId: string,
  environmentInstanceId?: string,
): Promise<TestIntelligenceSuggestion> {
  const response = await requestJson<ProjectTestIntelligenceResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests/${encodeURIComponent(commandId)}/intelligence${environmentQuery(environmentInstanceId)}`,
  );
  return response.suggestion;
}

export async function fetchProjectTestProcess(
  projectId: string,
  environmentInstanceId?: string,
): Promise<ManagedProcess | null> {
  const response = await requestJson<ProcessResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests/process${environmentQuery(environmentInstanceId)}`,
  );
  return response.process;
}

export async function startProjectTest(
  projectId: string,
  commandId: string,
  environmentInstanceId?: string,
): Promise<ManagedProcess> {
  const response = await requestJson<ProcessResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests/${encodeURIComponent(commandId)}/start${environmentQuery(environmentInstanceId)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    },
  );
  if (!response.process) {
    throw new Error('A API não retornou o processo iniciado.');
  }
  return response.process;
}

export async function fetchProjectRelatedTests(
  projectId: string,
  commandId: string,
  environmentInstanceId?: string,
): Promise<ProjectRelatedTests> {
  const response = await requestJson<ProjectRelatedTestsResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests/${encodeURIComponent(commandId)}/related${environmentQuery(environmentInstanceId)}`,
  );
  return response.related;
}

export async function startProjectRelatedTests(
  projectId: string,
  commandId: string,
  environmentInstanceId?: string,
): Promise<ManagedProcess> {
  const response = await requestJson<ProcessResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests/${encodeURIComponent(commandId)}/related/start${environmentQuery(environmentInstanceId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
  );
  if (!response.process) {
    throw new Error('A API não retornou o processo iniciado.');
  }
  return response.process;
}

export async function stopProjectTest(
  projectId: string,
  environmentInstanceId?: string,
): Promise<ManagedProcess> {
  const response = await requestJson<ProcessResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests/process/stop${environmentQuery(environmentInstanceId)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    },
  );
  if (!response.process) {
    throw new Error('A API não retornou o processo interrompido.');
  }
  return response.process;
}

export async function fetchProjectTestLog(
  projectId: string,
  maxBytes = 65_536,
  environmentInstanceId?: string,
): Promise<ProcessLogSnapshot> {
  const parameters = new URLSearchParams({ maxBytes: String(maxBytes) });
  appendEnvironmentInstance(parameters, environmentInstanceId);
  const response = await requestJson<ProcessLogResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests/process/logs?${parameters}`,
  );
  return response.log;
}

export async function clearProjectTestLog(
  projectId: string,
  environmentInstanceId?: string,
): Promise<ProcessLogSnapshot> {
  const response = await requestJson<ProcessLogResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests/process/logs${environmentQuery(environmentInstanceId)}`,
    { method: 'DELETE' },
  );
  return response.log;
}

interface ProjectTestFilesResponse {
  files: ProjectTestFile[];
}

export async function fetchProjectTestFiles(
  projectId: string,
  commandId: string,
  environmentInstanceId?: string,
): Promise<ProjectTestFile[]> {
  const response = await requestJson<ProjectTestFilesResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests/${encodeURIComponent(commandId)}/files${environmentQuery(environmentInstanceId)}`,
  );
  return response.files;
}

export async function startProjectTestFile(
  projectId: string,
  commandId: string,
  path: string,
  line?: number,
  namePattern?: string,
  environmentInstanceId?: string,
): Promise<ManagedProcess> {
  const response = await requestJson<ProcessResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests/${encodeURIComponent(commandId)}/files/start${environmentQuery(environmentInstanceId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path,
        ...(line === undefined ? {} : { line }),
        ...(namePattern === undefined ? {} : { namePattern }),
      }),
    },
  );
  if (!response.process) {
    throw new Error('A API não retornou o processo iniciado.');
  }
  return response.process;
}

interface TestExecutionHistoryResponse {
  history: TestExecutionHistory;
}

export async function fetchProjectTestHistory(
  projectId: string,
  page = 1,
  pageSize = 10,
  environmentInstanceId?: string,
): Promise<TestExecutionHistory> {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  appendEnvironmentInstance(query, environmentInstanceId);
  const response = await requestJson<TestExecutionHistoryResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests/history?${query}`,
  );
  return response.history;
}

interface TestExecutionHistoryClearResponse {
  history: { removedCount: number };
}

export async function clearProjectTestHistory(
  projectId: string,
  environmentInstanceId?: string,
): Promise<number> {
  const response = await requestJson<TestExecutionHistoryClearResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests/history${environmentQuery(environmentInstanceId)}`,
    { method: 'DELETE' },
  );
  return response.history.removedCount;
}

export function followTestExecutionEvents(
  projectId: string,
  onEvent: (event: TestExecutionEvent) => void,
  environmentInstanceId?: string,
): { close: () => void; done: Promise<void> } {
  return followEventStream(
    `/api/projects/${encodeURIComponent(projectId)}/tests/process/events${environmentQuery(environmentInstanceId)}`,
    onEvent,
  );
}
