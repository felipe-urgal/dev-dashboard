export interface ProjectReadme {
  filename: string;
  content: string;
}

interface ProjectReadmeResponse {
  readme: ProjectReadme | null;
}

interface ErrorResponse {
  message?: string;
}

export async function fetchProjectReadme(
  projectId: string,
): Promise<ProjectReadme | null> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/readme`,
    {
      credentials: 'same-origin',
    },
  );

  const payload = (await response.json().catch(() => null)) as
    | ProjectReadmeResponse
    | ErrorResponse
    | null;

  if (!response.ok) {
    throw new Error(
      payload && 'message' in payload && payload.message
        ? payload.message
        : `Não foi possível carregar o README (HTTP ${response.status}).`,
    );
  }

  return (payload as ProjectReadmeResponse).readme;
}
