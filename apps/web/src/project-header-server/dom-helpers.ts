export function projectIdFromLocation(): string {
  const match = window.location.pathname.match(/\/projects\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

export function serverPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/server`;
}
