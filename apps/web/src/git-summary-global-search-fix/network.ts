let summaryFetch: typeof window.fetch | undefined;

export function setSummaryFetcher(fetcher: typeof window.fetch): void {
  summaryFetch = fetcher;
}

export async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const fetcher = summaryFetch ?? window.fetch.bind(window);
  const response = await fetcher(url, {
    credentials: 'same-origin',
    ...(signal ? { signal } : {}),
  });
  const payload = await response.json().catch(() => null) as T | { message?: string } | null;
  if (!response.ok) {
    throw new Error(
      payload && typeof payload === 'object' && 'message' in payload && payload.message
        ? payload.message
        : `A API respondeu com HTTP ${response.status}.`,
    );
  }
  return payload as T;
}
