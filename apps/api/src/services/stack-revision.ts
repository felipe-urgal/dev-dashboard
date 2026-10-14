import { createHash } from 'node:crypto';

import type { Stack } from '@dev-dashboard/contracts';

function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const fields = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right, 'en'),
    );
    return `{${fields.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Content-derived opaque revision. Changes with topology and target ownership,
 * but not with incidental JSON object key order.
 */
export function stackRevision(stack: Stack): string {
  const definition = {
    id: stack.id,
    name: stack.name,
    nodes: [...stack.nodes].sort((a, b) => a.id.localeCompare(b.id, 'en')),
    dependencies: [...stack.dependencies].sort(
      (a, b) =>
        a.nodeId.localeCompare(b.nodeId, 'en') ||
        a.dependsOnNodeId.localeCompare(b.dependsOnNodeId, 'en'),
    ),
  };
  return createHash('sha256').update(canonical(definition)).digest('hex');
}
