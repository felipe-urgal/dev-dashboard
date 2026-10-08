import type { RouteLocationRaw } from 'vue-router';

import type { ReleaseReadinessActionTarget } from './release-readiness';

/**
 * Exhaustive mapping between backend action targets and registered project routes.
 * Adding a new target requires an explicit destination (no silent fallback).
 */
export const releaseReadinessActionRoutes = {
  synchronization: { name: 'project-git', query: { tab: 'sync' } },
  tests: { name: 'project-tests' },
  'pull-request': { name: 'project-git', query: { tab: 'pull-request' } },
  doctor: { name: 'project-doctor' },
  migrations: { name: 'project-migrations' },
  security: { name: 'project-security-center' },
  production: { name: 'project-production' },
} as const satisfies Record<
  ReleaseReadinessActionTarget,
  { name: string; query?: Record<string, string> }
>;

export function releaseReadinessActionRoute(
  target: ReleaseReadinessActionTarget,
  projectId: string,
): RouteLocationRaw {
  const route = releaseReadinessActionRoutes[target];
  return {
    name: route.name,
    params: { projectId },
    ...('query' in route ? { query: route.query } : {}),
  };
}
