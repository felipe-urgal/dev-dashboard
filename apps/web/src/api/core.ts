export interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
}

interface ErrorResponse {
  error?: string;
  message?: string;
}

export class ApiRequestError extends Error {
  public readonly status: number;
  public readonly code: string | undefined;

  public constructor(options: {
    status: number;
    code?: string;
    message: string;
  }) {
    super(options.message);
    this.name = 'ApiRequestError';
    this.status = options.status;
    this.code = options.code;
  }
}

export async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  return requestJsonAttempt<T>(input, init, true);
}

let bootstrapPromise: Promise<void> | undefined;

const BOOTSTRAP_STORAGE_KEY = 'dev-dashboard-browser-bootstrap';

function readBrowserBootstrap(): string | null {
  const parameters = new URLSearchParams(window.location.hash.slice(1));
  const received = parameters.get('bootstrap');

  if (received) {
    window.sessionStorage.setItem(BOOTSTRAP_STORAGE_KEY, received);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    return received;
  }

  return window.sessionStorage.getItem(BOOTSTRAP_STORAGE_KEY);
}

export async function bootstrapBrowserSession(): Promise<void> {
  const bootstrap = readBrowserBootstrap();
  bootstrapPromise ??= fetch('/api/auth/browser-session', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(bootstrap ? { 'X-Dev-Dashboard-Browser-Bootstrap': bootstrap } : {}),
    },
    body: '{}',
  }).then((response) => { if (!response.ok) throw new Error('Não foi possível iniciar a sessão segura do navegador.'); })
    .finally(() => { bootstrapPromise = undefined; });
  return bootstrapPromise;
}

async function requestJsonAttempt<T>(input: RequestInfo | URL, init: RequestInit | undefined, mayRenew: boolean): Promise<T> {
  let response = await fetch(input, { ...init, credentials: 'same-origin' });
  if (response.status === 401 && mayRenew) {
    await bootstrapBrowserSession();
    response = await fetch(input, { ...init, credentials: 'same-origin' });
  }

  const payload: unknown =
    response.status === 204
      ? null
      : await response.json().catch(() => null);

  if (!response.ok) {
    const errorPayload =
      payload && typeof payload === 'object'
        ? (payload as ErrorResponse)
        : null;

    throw new ApiRequestError({
      status: response.status,
      ...(errorPayload?.error
        ? { code: errorPayload.error }
        : {}),
      message:
        errorPayload?.message ??
        `A API respondeu com HTTP ${response.status}`,
    });
  }

  return payload as T;
}

export function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>('/api/health');
}

export function followEventStream<T>(
  url: string,
  onEvent: (event: T) => void,
): { close: () => void; done: Promise<void> } {
  const controller = new AbortController();
  const done = (async () => {
    let response = await fetch(url, {
      credentials: 'same-origin', signal: controller.signal, headers: { Accept: 'text/event-stream' },
    });
    if (response.status === 401) {
      await bootstrapBrowserSession();
      response = await fetch(url, {
        credentials: 'same-origin', signal: controller.signal, headers: { Accept: 'text/event-stream' },
      });
    }
    if (!response.ok || !response.body) throw new Error(`Não foi possível acompanhar a execução (HTTP ${response.status}).`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done: ended } = await reader.read();
      if (ended) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const data = frame.split('\n').find((line) => line.startsWith('data: '))?.slice(6);
        if (data) onEvent(JSON.parse(data) as T);
      }
    }
  })().catch((error: unknown) => {
    if (!controller.signal.aborted) throw error;
  });
  return { close: () => controller.abort(), done };
}
