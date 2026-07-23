import type {
  Project
} from "@dev-dashboard/contracts";

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

interface ErrorResponse {
  error?: string;
  message?: string;
}

async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, init);

  const payload: unknown = await response
    .json()
    .catch(() => null);

  if (!response.ok) {
    const errorPayload =
      payload &&
      typeof payload === "object"
        ? payload as ErrorResponse
        : null;

    throw new Error(
      errorPayload?.message ??
        `A API respondeu com HTTP ${response.status}`
    );
  }

  return payload as T;
}

export function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>("/api/health");
}

export async function fetchProjects(): Promise<Project[]> {
  const response =
    await requestJson<ProjectsResponse>("/api/projects");

  return response.projects;
}

export function scanWorkspace(input: {
  id: string;
  path: string;
}): Promise<WorkspaceScanResponse> {
  return requestJson<WorkspaceScanResponse>(
    "/api/workspaces/scan",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify(input)
    }
  );
}
