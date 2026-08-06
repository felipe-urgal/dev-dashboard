import type { GitPullRequestLookup } from '@dev-dashboard/contracts';

import type { ResolvedPullRequestContext } from './context.js';

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

export function githubRepositoryParts(
  ownerRepo: string,
): [string, string] | null {
  const parts = ownerRepo.split('/').filter(Boolean);
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return [parts[0], parts[1]];
}

export function githubLookupFromPayload(
  payload: unknown,
  context: ResolvedPullRequestContext,
): GitPullRequestLookup | null {
  if (!Array.isArray(payload)) return null;
  if (payload.length === 0) return { checked: true };
  const item = asRecord(payload[0]);
  const number = item?.number;
  const title = item?.title;
  const htmlUrl = item?.html_url;
  if (
    typeof number !== 'number' ||
    typeof title !== 'string' ||
    typeof htmlUrl !== 'string'
  ) {
    return null;
  }
  return {
    checked: true,
    existing: {
      provider: 'github',
      number,
      title,
      url: htmlUrl,
      sourceBranch: context.sourceBranch,
      baseBranch: context.baseBranch,
    },
  };
}
