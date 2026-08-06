function requestUrl(input: RequestInfo | URL): URL | null {
  try {
    if (typeof Request !== 'undefined' && input instanceof Request) {
      return new URL(input.url, window.location.href);
    }
    return new URL(String(input), window.location.href);
  } catch {
    return null;
  }
}

function replaceRequestUrl(
  input: RequestInfo | URL,
  url: URL,
): RequestInfo | URL {
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return new Request(url.toString(), input);
  }
  if (input instanceof URL) return url;
  return url.toString();
}

export function isSummaryHistoryRequest(url: URL): boolean {
  return (
    /\/api\/projects\/[^/]+\/git\/commits$/.test(url.pathname) &&
    !url.searchParams.has('ref')
  );
}

export function rewriteSummaryHistoryUrl(value: string): string {
  const url = new URL(value, 'http://dashboard.local');
  if (!isSummaryHistoryRequest(url)) return url.pathname + url.search;
  url.pathname = url.pathname.replace(
    /\/git\/commits$/,
    '/git/current-branch-commits',
  );
  return url.pathname + url.search;
}

export function installGitSummaryCurrentBranchHistory(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (
    document.documentElement.dataset.gitSummaryCurrentBranchHistory === 'true'
  )
    return;
  document.documentElement.dataset.gitSummaryCurrentBranchHistory = 'true';

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = requestUrl(input);
    if (!url || !isSummaryHistoryRequest(url)) {
      return originalFetch(input, init);
    }

    url.pathname = url.pathname.replace(
      /\/git\/commits$/,
      '/git/current-branch-commits',
    );
    return originalFetch(replaceRequestUrl(input, url), init);
  };
}
