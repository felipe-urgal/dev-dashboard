import type { RailsRouteEntry } from '@dev-dashboard/contracts';

const ROUTE_VERBS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
] as const;
const ROUTE_ROW = new RegExp(
  `^\\s*(?:([A-Za-z0-9_./]+)\\s+)?(${ROUTE_VERBS.join('|')})\\s+(\\S+)\\s+(.+?)\\s*$`,
);

export function parseRoutes(output: string): RailsRouteEntry[] {
  const routes: RailsRouteEntry[] = [];

  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (/^-+$/.test(line.trim())) continue;
    if (/^\s*Prefix\s+Verb\s+URI Pattern/i.test(line)) continue;

    const match = line.match(ROUTE_ROW);
    if (!match) continue;
    const [, prefix, verb, uriPattern, controllerAction] = match;
    routes.push({
      ...(prefix ? { name: prefix } : {}),
      verb: verb ?? '',
      path: uriPattern ?? '',
      controllerAction: (controllerAction ?? '').trim(),
    });
  }

  return routes;
}
