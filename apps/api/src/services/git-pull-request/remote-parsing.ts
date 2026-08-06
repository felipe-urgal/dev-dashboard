import type { GitPullRequestProvider } from '@dev-dashboard/contracts';

export interface ParsedRemote {
  host: string;
  ownerRepo: string;
}

export function parseRemoteUrl(remoteUrl: string): ParsedRemote | null {
  const trimmed = remoteUrl.trim();
  if (!trimmed) return null;

  const scpMatch = /^(?:[^@/]+@)?([^:/]+):(.+)$/.exec(trimmed);
  if (!trimmed.includes('://') && scpMatch) {
    const [, host, ownerRepoRaw] = scpMatch;
    if (!host || !ownerRepoRaw) return null;
    return {
      host,
      ownerRepo: ownerRepoRaw.replace(/\.git$/, '').replace(/^\/+/, ''),
    };
  }

  try {
    const url = new URL(trimmed);
    const ownerRepo = url.pathname.replace(/^\/+/, '').replace(/\.git$/, '');
    if (!url.hostname || !ownerRepo) return null;
    return { host: url.hostname, ownerRepo };
  } catch {
    return null;
  }
}

export function detectProvider(host: string): GitPullRequestProvider | null {
  const normalized = host.toLowerCase();
  if (normalized === 'github.com' || normalized.endsWith('.github.com'))
    return 'github';
  if (normalized === 'gitlab.com' || normalized.includes('gitlab'))
    return 'gitlab';
  return null;
}
