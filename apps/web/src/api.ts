import type {
  ActivityList,
  ActivityOrigin,
  ActivityStatus,
  GitCommitResult,
  GitDiffScope,
  GitDiffSnapshot,
  GitFileDiff,
  GitMutationConfirmation,
  GitMutationOperation,
  GitStashEntry,
  ManagedProcess,
  ProcessLogSnapshot,
  Project,
  ProjectServerSettings,
  ProjectGitOverview,
  ProjectTestOverview,
  ProjectDatabaseOverview,
  ProjectDatabaseSecret,
  ProjectDatabaseStartResult,
  ProjectScriptCatalog,
  ScriptExecution,
  ScriptExecutionEvent,
  ScriptExecutionHistory,
  ScriptExecutionConfirmation,
  ScriptExecutionLog,
  Workspace,
} from '@dev-dashboard/contracts';

interface ScriptCatalogResponse { catalog: ProjectScriptCatalog }
interface ScriptExecutionResponse { execution: ScriptExecution }
interface LatestScriptExecutionResponse { execution: ScriptExecution | null }
interface ScriptExecutionHistoryResponse { history: ScriptExecutionHistory }
interface ScriptExecutionLogResponse { log: ScriptExecutionLog }
interface ScriptExecutionConfirmationResponse { confirmation: ScriptExecutionConfirmation }

export interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
}

export interface WorkspaceScanWarning {
  path: string;
  code: string;
  message: string;
}

export interface WorkspaceScanResponse {
  workspaceId: string;
  workspacePath: string;
  projects: Project[];
  warnings: WorkspaceScanWarning[];
  scannedAt: string;
}

interface ProjectsResponse {
  projects: Project[];
}

interface ProjectResponse {
  project: Project;
}

interface WorkspacesResponse {
  workspaces: Workspace[];
}

interface ErrorResponse {
  error?: string;
  message?: string;
}

export class ApiRequestError extends Error {
  public readonly status: number;
  public readonly code: string | undefined;

  public constructor(options: {
    status: number;
    code?: string;
    message: string;
  }) {
    super(options.message);
    this.name = 'ApiRequestError';
    this.status = options.status;
    this.code = options.code;
  }
}

interface ProcessResponse {
  process: ManagedProcess | null;
}

interface ProcessLogResponse {
  log: ProcessLogSnapshot;
}

interface ServerSettingsResponse {
  settings: ProjectServerSettings;
}

export interface DirectoryEntry {
  name: string;
  path: string;
}

export interface DirectoryListing {
  rootPath: string;
  currentPath: string;
  parentPath: string | null;
  directories: DirectoryEntry[];
}

async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  return requestJsonAttempt<T>(input, init, true);
}

let bootstrapPromise: Promise<void> | undefined;

const BOOTSTRAP_STORAGE_KEY = 'dev-dashboard-browser-bootstrap';

function readBrowserBootstrap(): string | null {
  const parameters = new URLSearchParams(window.location.hash.slice(1));
  const received = parameters.get('bootstrap');

  if (received) {
    window.sessionStorage.setItem(BOOTSTRAP_STORAGE_KEY, received);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    return received;
  }

  return window.sessionStorage.getItem(BOOTSTRAP_STORAGE_KEY);
}

async function bootstrapBrowserSession(): Promise<void> {
  const bootstrap = readBrowserBootstrap();
  bootstrapPromise ??= fetch('/api/auth/browser-session', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(bootstrap ? { 'X-Dev-Dashboard-Browser-Bootstrap': bootstrap } : {}),
    },
    body: '{}',
  }).then((response) => { if (!response.ok) throw new Error('Não foi possível iniciar a sessão segura do navegador.'); })
    .finally(() => { bootstrapPromise = undefined; });
  return bootstrapPromise;
}

async function requestJsonAttempt<T>(input: RequestInfo | URL, init: RequestInit | undefined, mayRenew: boolean): Promise<T> {
  let response = await fetch(input, { ...init, credentials: 'same-origin' });
  if (response.status === 401 && mayRenew) {
    await bootstrapBrowserSession();
    response = await fetch(input, { ...init, credentials: 'same-origin' });
  }

  const payload: unknown =
    response.status === 204
      ? null
      : await response.json().catch(() => null);

  if (!response.ok) {
    const errorPayload =
      payload && typeof payload === 'object'
        ? (payload as ErrorResponse)
        : null;

    throw new ApiRequestError({
      status: response.status,
      ...(errorPayload?.error
        ? { code: errorPayload.error }
        : {}),
      message:
        errorPayload?.message ??
        `A API respondeu com HTTP ${response.status}`,
    });
  }

  return payload as T;
}

export function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>('/api/health');
}

export async function fetchProjectScripts(projectId: string, query: URLSearchParams): Promise<ProjectScriptCatalog> {
  const response = await requestJson<ScriptCatalogResponse>(`/api/projects/${encodeURIComponent(projectId)}/scripts?${query.toString()}`);
  return response.catalog;
}

export async function prepareScriptExecution(projectId: string, actionId: string): Promise<ScriptExecutionConfirmation> {
  const response = await requestJson<ScriptExecutionConfirmationResponse>(`/api/projects/${encodeURIComponent(projectId)}/scripts/confirmations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actionId }) });
  return response.confirmation;
}
export async function startScriptExecution(projectId: string, actionId: string, confirmationToken?: string): Promise<ScriptExecution> {
  const response = await requestJson<ScriptExecutionResponse>(`/api/projects/${encodeURIComponent(projectId)}/scripts/executions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actionId, ...(confirmationToken ? { confirmationToken } : {}) }) });
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
  const controller = new AbortController();
  const done = (async () => {
    let response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/scripts/executions/${encodeURIComponent(executionId)}/events`, {
      credentials: 'same-origin', signal: controller.signal, headers: { Accept: 'text/event-stream' },
    });
    if (response.status === 401) {
      await bootstrapBrowserSession();
      response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/scripts/executions/${encodeURIComponent(executionId)}/events`, {
        credentials: 'same-origin', signal: controller.signal, headers: { Accept: 'text/event-stream' },
      });
    }
    if (!response.ok || !response.body) throw new Error(`Não foi possível acompanhar a execução (HTTP ${response.status}).`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done: ended } = await reader.read();
      if (ended) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const data = frame.split('\n').find((line) => line.startsWith('data: '))?.slice(6);
        if (data) onEvent(JSON.parse(data) as ScriptExecutionEvent);
      }
    }
  })().catch((error: unknown) => {
    if (!controller.signal.aborted) throw error;
  });
  return { close: () => controller.abort(), done };
}

export async function cancelScriptExecution(projectId: string, executionId: string): Promise<ScriptExecution> {
  const response = await requestJson<ScriptExecutionResponse>(`/api/projects/${encodeURIComponent(projectId)}/scripts/executions/${encodeURIComponent(executionId)}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); return response.execution;
}

export async function fetchProject(
  projectId: string,
): Promise<Project> {
  const response = await requestJson<ProjectResponse>(
    `/api/projects/${encodeURIComponent(projectId)}`,
  );

  return response.project;
}

export async function fetchProjects(): Promise<Project[]> {
  const response =
    await requestJson<ProjectsResponse>('/api/projects');

  return response.projects;
}

export async function fetchWorkspaces(): Promise<Workspace[]> {
  const response =
    await requestJson<WorkspacesResponse>('/api/workspaces');

  return response.workspaces;
}

export function createWorkspace(input: {
  name: string;
  path: string;
}): Promise<Workspace> {
  return requestJson<Workspace>('/api/workspaces', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
}

export function scanWorkspace(
  workspaceId: string,
): Promise<WorkspaceScanResponse> {
  return requestJson<WorkspaceScanResponse>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/scan`,
    {
      method: 'POST',
    },
  );
}

export async function deleteWorkspace(
  workspaceId: string,
): Promise<void> {
  await requestJson<null>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}`,
    {
      method: 'DELETE',
    },
  );
}

export async function fetchProjectProcess(
  projectId: string,
): Promise<ManagedProcess | null> {
  const response = await requestJson<ProcessResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/process`,
  );

  return response.process;
}

export async function startProjectProcess(
  projectId: string,
  input: {
    port?: number | null;
  } = {},
): Promise<ManagedProcess> {
  const response = await requestJson<ProcessResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/process/start`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
  );

  if (!response.process) {
    throw new Error('A API não retornou o processo iniciado.');
  }

  return response.process;
}

export async function fetchProjectServerSettings(
  projectId: string,
): Promise<ProjectServerSettings> {
  const response = await requestJson<ServerSettingsResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/server-settings`,
  );

  return response.settings;
}

export async function saveProjectServerSettings(
  projectId: string,
  input: {
    port: number | null;
  },
): Promise<ProjectServerSettings> {
  const response = await requestJson<ServerSettingsResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/server-settings`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
  );

  return response.settings;
}

export async function stopProjectProcess(
  projectId: string,
): Promise<ManagedProcess> {
  const response = await requestJson<ProcessResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/process/stop`,
    {
      method: 'POST',
    },
  );

  if (!response.process) {
    throw new Error('A API não retornou o processo interrompido.');
  }

  return response.process;
}

export async function fetchProjectProcessLog(
  projectId: string,
  maxBytes = 65_536,
): Promise<ProcessLogSnapshot> {
  const parameters = new URLSearchParams({
    maxBytes: String(maxBytes),
  });

  const response = await requestJson<ProcessLogResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/process/logs?${parameters}`,
  );

  return response.log;
}
export function projectFaviconUrl(
  projectId: string,
): string {
  return `/api/projects/${encodeURIComponent(projectId)}/favicon`;
}

export function fetchDirectories(
  directoryPath?: string,
): Promise<DirectoryListing> {
  const parameters = new URLSearchParams();

  if (directoryPath) {
    parameters.set('path', directoryPath);
  }

  const query = parameters.toString();

  return requestJson<DirectoryListing>(
    `/api/directories${query ? `?${query}` : ''}`,
  );
}

export async function clearProjectProcessLog(
  projectId: string,
): Promise<ProcessLogSnapshot> {
  const response = await requestJson<ProcessLogResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/process/logs`,
    {
      method: 'DELETE',
    },
  );

  return response.log;
}


interface ProjectGitResponse { git: ProjectGitOverview; }
export async function fetchProjectGit(projectId: string): Promise<ProjectGitOverview> {
  const response = await requestJson<ProjectGitResponse>(`/api/projects/${encodeURIComponent(projectId)}/git`);
  return response.git;
}

interface ProjectGitDiffResponse { diff: GitDiffSnapshot }
interface ProjectGitFileDiffResponse { file: GitFileDiff }

export async function fetchProjectGitDiff(projectId: string, scope: GitDiffScope = 'combined', signal?: AbortSignal): Promise<GitDiffSnapshot> {
  const query = new URLSearchParams({ scope });
  const init: RequestInit = signal ? { signal } : {};
  const response = await requestJson<ProjectGitDiffResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/diff?${query}`,
    init,
  );
  return response.diff;
}

export async function fetchProjectGitFileDiff(projectId: string, filePath: string, scope: GitDiffScope = 'combined', signal?: AbortSignal): Promise<GitFileDiff> {
  const query = new URLSearchParams({ path: filePath, scope });
  const init: RequestInit = signal ? { signal } : {};
  const response = await requestJson<ProjectGitFileDiffResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/diff/file?${query}`,
    init,
  );
  return response.file;
}

interface GitMutationConfirmationResponse { confirmation: GitMutationConfirmation }
interface GitBranchMutationResponse { branch: { branch: string } }

export async function prepareProjectGitMutation(projectId: string, operation: GitMutationOperation, target: string): Promise<GitMutationConfirmation> {
  const response = await requestJson<GitMutationConfirmationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/mutations/confirmations`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation, target }) },
  );
  return response.confirmation;
}

export async function createProjectGitBranch(projectId: string, name: string, confirmationToken: string): Promise<string> {
  const response = await requestJson<GitBranchMutationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/branches`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, confirmationToken }) },
  );
  return response.branch.branch;
}

export async function switchProjectGitBranch(projectId: string, name: string, confirmationToken: string): Promise<string> {
  const response = await requestJson<GitBranchMutationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/switch`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, confirmationToken }) },
  );
  return response.branch.branch;
}

export async function pullProjectGitBranch(projectId: string, confirmationToken: string): Promise<string> {
  const response = await requestJson<GitBranchMutationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/pull`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmationToken }) },
  );
  return response.branch.branch;
}

export async function pushProjectGitBranch(projectId: string, confirmationToken: string): Promise<string> {
  const response = await requestJson<GitBranchMutationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/push`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmationToken }) },
  );
  return response.branch.branch;
}

interface GitCommitMutationResponse { commit: GitCommitResult }
interface GitStashPushResponse { stash: GitStashEntry }
interface GitStashPopResponse { popped: GitStashEntry }

export async function commitProjectGit(projectId: string, message: string, includeAllChanges: boolean, confirmationToken: string): Promise<GitCommitResult> {
  const response = await requestJson<GitCommitMutationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/commit`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, includeAllChanges, confirmationToken }) },
  );
  return response.commit;
}

export async function stashPushProjectGit(projectId: string, confirmationToken: string): Promise<GitStashEntry> {
  const response = await requestJson<GitStashPushResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/stash`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmationToken }) },
  );
  return response.stash;
}

export async function stashPopProjectGit(projectId: string, confirmationToken: string): Promise<GitStashEntry> {
  const response = await requestJson<GitStashPopResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/stash/pop`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmationToken }) },
  );
  return response.popped;
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

interface ProjectDatabaseResponse { database: ProjectDatabaseOverview; }
interface ProjectDatabaseSecretResponse { secret: ProjectDatabaseSecret; }
interface ProjectDatabaseStartResponse { start: ProjectDatabaseStartResult; }

export async function fetchProjectDatabase(projectId: string, page = 1): Promise<ProjectDatabaseOverview> {
  const query = new URLSearchParams({ page: String(page), pageSize: '20' });
  const response = await requestJson<ProjectDatabaseResponse>(`/api/projects/${encodeURIComponent(projectId)}/database?${query}`);
  return response.database;
}

export async function revealProjectDatabaseUrl(projectId: string, environmentId: string): Promise<ProjectDatabaseSecret> {
  const response = await requestJson<ProjectDatabaseSecretResponse>(`/api/projects/${encodeURIComponent(projectId)}/database/${encodeURIComponent(environmentId)}/reveal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  });
  return response.secret;
}

export async function startProjectDatabase(projectId: string, environmentId: string): Promise<ProjectDatabaseStartResult> {
  const response = await requestJson<ProjectDatabaseStartResponse>(`/api/projects/${encodeURIComponent(projectId)}/database/${encodeURIComponent(environmentId)}/start`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  });
  return response.start;
}

export interface ActivityQuery {
  workspaceId?: string;
  projectId?: string;
  origin?: ActivityOrigin;
  status?: ActivityStatus;
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
}

interface ActivityListResponse { activities: ActivityList }

export function buildActivityQuery(query: ActivityQuery): string {
  const parameters = new URLSearchParams();
  if (query.workspaceId) parameters.set('workspaceId', query.workspaceId);
  if (query.projectId) parameters.set('projectId', query.projectId);
  if (query.origin) parameters.set('origin', query.origin);
  if (query.status) parameters.set('status', query.status);
  if (query.page !== undefined) parameters.set('page', String(query.page));
  if (query.pageSize !== undefined) parameters.set('pageSize', String(query.pageSize));
  return parameters.toString();
}

export interface ProcessesQuery {
  workspaceId?: string;
  projectId?: string;
  kind?: 'server' | 'test';
  signal?: AbortSignal;
}

interface ProcessesResponse { processes: ManagedProcess[] }

export function buildProcessesQuery(query: ProcessesQuery): string {
  const parameters = new URLSearchParams();
  if (query.workspaceId) parameters.set('workspaceId', query.workspaceId);
  if (query.projectId) parameters.set('projectId', query.projectId);
  if (query.kind) parameters.set('kind', query.kind);
  return parameters.toString();
}

export async function fetchManagedProcesses(query: ProcessesQuery = {}): Promise<ManagedProcess[]> {
  const search = buildProcessesQuery(query);
  const url = `/api/processes${search ? `?${search}` : ''}`;
  const init: RequestInit = query.signal ? { signal: query.signal } : {};
  const response = await requestJson<ProcessesResponse>(url, init);
  return response.processes;
}

interface CleanupResponse { removed: unknown[]; removedCount: number }

export async function cleanupManagedProcesses(): Promise<number> {
  const response = await requestJson<CleanupResponse>('/api/processes/cleanup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  return response.removedCount;
}

export async function fetchActivities(query: ActivityQuery = {}): Promise<ActivityList> {
  const search = buildActivityQuery(query);
  const url = `/api/activities${search ? `?${search}` : ''}`;
  const init: RequestInit = query.signal ? { signal: query.signal } : {};
  const response = await requestJson<ActivityListResponse>(url, init);
  return response.activities;
}
