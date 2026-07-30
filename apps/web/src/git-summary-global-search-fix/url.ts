export function buildSummaryHistorySearchUrl(
  projectId: string,
  search: string,
  page: number,
): string {
  const query = new URLSearchParams({
    page: String(Math.max(1, Math.floor(page))),
    pageSize: '10',
  });
  const normalized = search.trim();
  if (normalized) query.set('search', normalized);
  return `/api/projects/${encodeURIComponent(projectId)}/git/commits?${query.toString()}`;
}
