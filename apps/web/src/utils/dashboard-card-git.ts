import type { ProjectGitOverview } from '@dev-dashboard/contracts';
import { fetchProjectGit } from '../api';

export type CardGitState =
  | { kind: 'branch'; branch: string; dirty: boolean }
  | { kind: 'detached' }
  | { kind: 'none' }
  | { kind: 'unknown' };

const cache = new Map<string, { at: number; value: CardGitState }>();
const pending = new Map<string, Promise<CardGitState>>();
const TTL = 30_000;

export function resolveCardGit(overview: ProjectGitOverview): CardGitState {
  if (!overview.repository) return { kind: 'none' };
  if (overview.detached || !overview.branch) return { kind: 'detached' };
  return { kind: 'branch', branch: overview.branch, dirty: !overview.clean };
}

export async function getCardGit(projectId: string): Promise<CardGitState> {
  const existing = cache.get(projectId);
  if (existing && Date.now() - existing.at < TTL) return existing.value;
  const inFlight = pending.get(projectId);
  if (inFlight) return inFlight;
  const request = fetchProjectGit(projectId)
    .then(resolveCardGit)
    .catch((): CardGitState => ({ kind: 'unknown' }))
    .then((value) => {
      cache.set(projectId, { at: Date.now(), value });
      return value;
    })
    .finally(() => pending.delete(projectId));
  pending.set(projectId, request);
  return request;
}

export function invalidateCardGit(projectId?: string): void {
  if (projectId) cache.delete(projectId);
  else cache.clear();
}
