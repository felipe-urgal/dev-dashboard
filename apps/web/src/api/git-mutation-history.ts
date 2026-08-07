import { requestJson } from './core';

interface ClearGitMutationHistoryResponse {
  cleared: number;
}

export async function clearProjectGitMutationHistory(
  projectId: string,
): Promise<number> {
  const response = await requestJson<ClearGitMutationHistoryResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/mutation-history`,
    { method: 'DELETE' },
  );
  return response.cleared;
}
