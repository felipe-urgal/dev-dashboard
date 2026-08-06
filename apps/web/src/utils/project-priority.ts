import type { Project } from '@dev-dashboard/contracts';

export function sortProjectsByPriority(
  projects: readonly Project[],
): Project[] {
  return [...projects].sort((left, right) => {
    const favoriteOrder = Number(right.favorite) - Number(left.favorite);
    if (favoriteOrder !== 0) return favoriteOrder;

    if (left.favorite && right.favorite) {
      return left.name.localeCompare(right.name);
    }

    const leftRecent = left.lastAccessedAt ?? '';
    const rightRecent = right.lastAccessedAt ?? '';
    if (leftRecent || rightRecent) {
      const recentOrder = rightRecent.localeCompare(leftRecent);
      if (recentOrder !== 0) return recentOrder;
    }

    return left.name.localeCompare(right.name);
  });
}

export function recentProjectIds(
  projects: readonly Project[],
  limit = 5,
): Set<string> {
  return new Set(
    sortProjectsByPriority(projects)
      .filter((project) => !project.favorite && project.lastAccessedAt)
      .slice(0, limit)
      .map((project) => project.id),
  );
}
