import type {
  ManagedProcess,
  ProcessLogSnapshot,
  ProjectTestFile,
  ProjectTestOverview,
  TestExecutionEvent,
  TestExecutionHistory,
} from '@dev-dashboard/contracts';

import { followEventStream, requestJson } from './core';

interface ProcessResponse {
  process: ManagedProcess | null;
}

interface ProcessLogResponse {
  log: ProcessLogSnapshot;
}

interface ProjectTestsResponse { tests: ProjectTestOverview; }

export async function fetchProjectTests(
  projectId: string,
  options: { refresh?: boolean } = {},
): Promise<ProjectTestOverview> {
  const query = options.refresh ? '?refresh=true' : '';
  const response = await requestJson<ProjectTestsResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests${query}`,
  );
  return response.tests;
}

export async function fetchProjectTestProcess(
  projectId: string,
): Promise<ManagedProcess | null> {
  const response = await requestJson<ProcessResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests/process`,
  );
  return response.process;
}

export async function startProjectTest(
  projectId: string,
  commandId: string,
): Promise<ManagedProcess> {
  const response = await requestJson<ProcessResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests/${encodeURIComponent(commandId)}/start`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }
  );
  if (!response.process) {
    throw new Error('A API não retornou o processo iniciado.');
  }
  return response.process;
}

export async function stopProjectTest(
  projectId: string,
): Promise<ManagedProcess> {
  const response = await requestJson<ProcessResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests/process/stop`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }
  );
  if (!response.process) {
    throw new Error('A API não retornou o processo interrompido.');
  }
  return response.process;
}

export async function fetchProjectTestLog(
  projectId: string,
  maxBytes = 65_536,
): Promise<ProcessLogSnapshot> {
  const parameters = new URLSearchParams({ maxBytes: String(maxBytes) });
  const response = await requestJson<ProcessLogResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests/process/logs?${parameters}`,
  );
  return response.log;
}

export async function clearProjectTestLog(
  projectId: string,
): Promise<ProcessLogSnapshot> {
  const response = await requestJson<ProcessLogResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests/process/logs`,
    { method: 'DELETE' },
  );
  return response.log;
}

interface ProjectTestFilesResponse { files: ProjectTestFile[] }

export async function fetchProjectTestFiles(
  projectId: string,
  commandId: string,
): Promise<ProjectTestFile[]> {
  const response = await requestJson<ProjectTestFilesResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests/${encodeURIComponent(commandId)}/files`,
  );
  return response.files;
}

export async function startProjectTestFile(
  projectId: string,
  commandId: string,
  path: string,
): Promise<ManagedProcess> {
  const response = await requestJson<ProcessResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests/${encodeURIComponent(commandId)}/files/start`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    },
  );
  if (!response.process) {
    throw new Error('A API não retornou o processo iniciado.');
  }
  return response.process;
}

interface TestExecutionHistoryResponse { history: TestExecutionHistory }

export async function fetchProjectTestHistory(
  projectId: string,
  page = 1,
  pageSize = 10,
): Promise<TestExecutionHistory> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const response = await requestJson<TestExecutionHistoryResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests/history?${query}`,
  );
  return response.history;
}

interface TestExecutionHistoryClearResponse { history: { removedCount: number } }

export async function clearProjectTestHistory(projectId: string): Promise<number> {
  const response = await requestJson<TestExecutionHistoryClearResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests/history`,
    { method: 'DELETE' },
  );
  return response.history.removedCount;
}

export function followTestExecutionEvents(
  projectId: string,
  onEvent: (event: TestExecutionEvent) => void,
): { close: () => void; done: Promise<void> } {
  return followEventStream(
    `/api/projects/${encodeURIComponent(projectId)}/tests/process/events`,
    onEvent,
  );
}
