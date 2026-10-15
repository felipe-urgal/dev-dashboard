import { projectToolRoute } from '../project-tools';
import type { ReleaseReadinessActionTarget } from './release-readiness';

/**
 * Exhaustive mapping between backend action targets and Project Tools.
 * Adding a new target requires an explicit destination (no silent fallback).
 */
export const releaseReadinessActionRoutes = {
  synchronization: { toolId: 'git', query: { tab: 'sync' } },
  tests: { toolId: 'tests' },
  'pull-request': { toolId: 'git', query: { tab: 'pull-request' } },
  doctor: { toolId: 'doctor' },
  migrations: { toolId: 'migrations' },
  security: { toolId: 'security' },
  production: { toolId: 'production' },
} as const satisfies Record<
  ReleaseReadinessActionTarget,
  { toolId: string; query?: Record<string, string> }
>;

export function releaseReadinessActionRoute(
  target: ReleaseReadinessActionTarget,
  projectId: string,
  environmentInstanceId?: string,
) {
  const route = releaseReadinessActionRoutes[target];
  return projectToolRoute(route.toolId, projectId, {
    environmentInstanceId,
    ...('query' in route ? { query: route.query } : {}),
  });
}
