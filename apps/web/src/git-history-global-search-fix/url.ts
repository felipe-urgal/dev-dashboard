import type { HistorySearchState } from './types';

export function isHistoryListRequest(url: URL): boolean {
  return /\/api\/projects\/[^/]+\/git\/commits$/.test(url.pathname);
}

export function applyGlobalHistoryFilters(
  value: string,
  filters: Pick<HistorySearchState, 'search' | 'author' | 'kind'>,
  forceFirstPage = false,
): string {
  const url = new URL(value, 'http://dashboard.local');
  url.pathname = url.pathname.replace(
    /\/git\/commits$/,
    '/git/exclusive-branch-commits',
  );
  const setOrDelete = (key: string, item: string): void => {
    const normalized = item.trim();
    if (normalized) url.searchParams.set(key, normalized);
    else url.searchParams.delete(key);
  };
  setOrDelete('search', filters.search);
  setOrDelete('author', filters.author);
  if (filters.kind !== 'all') url.searchParams.set('kind', filters.kind);
  else url.searchParams.delete('kind');
  if (forceFirstPage) url.searchParams.set('page', '1');
  return url.pathname + url.search;
}

export function requestUrl(input: RequestInfo | URL): URL | null {
  try {
    if (typeof Request !== 'undefined' && input instanceof Request) {
      return new URL(input.url, window.location.href);
    }
    return new URL(String(input), window.location.href);
  } catch {
    return null;
  }
}

export function replaceRequestUrl(input: RequestInfo | URL, url: URL): RequestInfo | URL {
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return new Request(url.toString(), input);
  }
  if (input instanceof URL) return url;
  return url.toString();
}
