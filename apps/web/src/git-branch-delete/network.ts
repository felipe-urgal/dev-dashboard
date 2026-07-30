export async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
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
