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

const inFlightGetRequests = new Map<string, Promise<unknown>>();
const MAX_API_REQUEST_METRICS = 100;
const MAX_GET_RETRIES = 2;
const GET_RETRY_DELAY_MS = 150;
const GET_TIMEOUT_MS = 10_000;

export interface ApiRequestMetric {
  key: string;
  method: string;
  url: string;
  calls: number;
  deduplicated: number;
  successes: number;
  failures: number;
  cancelled: number;
  lastStatus?: number;
  lastDurationMs?: number;
}

const apiRequestMetrics = new Map<string, ApiRequestMetric>();

function metricKey(input: RequestInfo | URL, init?: RequestInit): string {
  const method = (init?.method ?? 'GET').toUpperCase();
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  return `${method} ${url}`;
}

function metricFor(key: string): ApiRequestMetric {
  const existing = apiRequestMetrics.get(key);
  if (existing) return existing;
  if (apiRequestMetrics.size >= MAX_API_REQUEST_METRICS) {
    const oldestKey = apiRequestMetrics.keys().next().value as
      string | undefined;
    if (oldestKey) apiRequestMetrics.delete(oldestKey);
  }
  const [method, ...urlParts] = key.split(' ');
  const metric: ApiRequestMetric = {
    key,
    method: method ?? 'GET',
    url: urlParts.join(' '),
    calls: 0,
    deduplicated: 0,
    successes: 0,
    failures: 0,
    cancelled: 0,
  };
  apiRequestMetrics.set(key, metric);
  return metric;
}

export function getApiRequestMetrics(): ApiRequestMetric[] {
  return [...apiRequestMetrics.values()].map((metric) => ({ ...metric }));
}

export function clearApiRequestMetrics(): void {
  apiRequestMetrics.clear();
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isGetRequest(init?: RequestInit): boolean {
  return (init?.method ?? 'GET').toUpperCase() === 'GET';
}

function isRetryableGetError(error: unknown): boolean {
  if (isAbortError(error)) return false;
  if (error instanceof ApiRequestError) {
    return (
      error.code === 'NETWORK_ERROR' ||
      error.code === 'TIMEOUT' ||
      error.status === 408 ||
      error.status === 429 ||
      error.status >= 500
    );
  }
  return error instanceof TypeError;
}

function retryDelay(attempt: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, GET_RETRY_DELAY_MS * 2 ** attempt);
  });
}

function networkError(error: unknown): ApiRequestError | unknown {
  if (isAbortError(error) || error instanceof ApiRequestError) return error;
  if (error instanceof TypeError) {
    return new ApiRequestError({
      status: 0,
      code: 'NETWORK_ERROR',
      message:
        'Não foi possível conectar à API. Verifique sua conexão e tente novamente.',
    });
  }
  return error;
}

function getRequestKey(
  input: RequestInfo | URL,
  init?: RequestInit,
): string | undefined {
  const method = (init?.method ?? 'GET').toUpperCase();
  if (method !== 'GET' || init?.signal) return undefined;

  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const headers = [...new Headers(init?.headers).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}:${value}`)
    .join('|');

  return `${method} ${url} ${headers}`;
}

export async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const key = getRequestKey(input, init);
  const metric = metricFor(metricKey(input, init));
  if (key) {
    const existing = inFlightGetRequests.get(key);
    if (existing) {
      metric.deduplicated += 1;
      return existing as Promise<T>;
    }
  }

  metric.calls += 1;
  const startedAt = performance.now();
  const pending = (async () => {
    let attempt = 0;
    while (true) {
      try {
        return await requestJsonAttempt<T>(input, init, true, metric);
      } catch (error) {
        if (
          !isGetRequest(init) ||
          attempt >= MAX_GET_RETRIES ||
          !isRetryableGetError(error)
        ) {
          throw error;
        }
        await retryDelay(attempt);
        attempt += 1;
      }
    }
  })();
  pending.then(
    () => {
      metric.successes += 1;
      metric.lastDurationMs = Math.round(performance.now() - startedAt);
    },
    (error: unknown) => {
      metric.lastDurationMs = Math.round(performance.now() - startedAt);
      if (isAbortError(error)) {
        metric.cancelled += 1;
      } else {
        metric.failures += 1;
        if (error instanceof ApiRequestError) metric.lastStatus = error.status;
      }
    },
  );
  if (key) {
    inFlightGetRequests.set(key, pending);
    pending.then(
      () => {
        if (inFlightGetRequests.get(key) === pending) {
          inFlightGetRequests.delete(key);
        }
      },
      () => {
        if (inFlightGetRequests.get(key) === pending) {
          inFlightGetRequests.delete(key);
        }
      },
    );
  }

  return pending;
}

let bootstrapPromise: Promise<void> | undefined;

const BOOTSTRAP_STORAGE_KEY = 'dev-dashboard-browser-bootstrap';

function readBrowserBootstrap(): string | null {
  const parameters = new URLSearchParams(window.location.hash.slice(1));
  const received = parameters.get('bootstrap');

  if (received) {
    window.sessionStorage.setItem(BOOTSTRAP_STORAGE_KEY, received);
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}`,
    );
    return received;
  }

  return window.sessionStorage.getItem(BOOTSTRAP_STORAGE_KEY);
}

export async function bootstrapBrowserSession(): Promise<void> {
  const bootstrap = readBrowserBootstrap();
  if (bootstrapPromise) return bootstrapPromise;
  const metric = metricFor('POST /api/auth/browser-session');
  metric.calls += 1;
  const startedAt = performance.now();
  bootstrapPromise = fetch('/api/auth/browser-session', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(bootstrap ? { 'X-Dev-Dashboard-Browser-Bootstrap': bootstrap } : {}),
    },
    body: '{}',
  })
    .then((response) => {
      metric.lastStatus = response.status;
      if (!response.ok)
        throw new Error(
          'Não foi possível iniciar a sessão segura do navegador.',
        );
      metric.successes += 1;
    })
    .catch((error: unknown) => {
      metric.lastDurationMs = Math.round(performance.now() - startedAt);
      if (isAbortError(error)) metric.cancelled += 1;
      else metric.failures += 1;
      throw error;
    })
    .finally(() => {
      metric.lastDurationMs ??= Math.round(performance.now() - startedAt);
      bootstrapPromise = undefined;
    });
  return bootstrapPromise;
}

async function requestJsonAttempt<T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  mayRenew: boolean,
  metric?: ApiRequestMetric,
): Promise<T> {
  let response = await fetchWithRequestPolicy(input, {
    ...init,
    credentials: 'same-origin',
  });
  if (metric) metric.lastStatus = response.status;
  if (response.status === 401 && mayRenew) {
    await bootstrapBrowserSession();
    response = await fetchWithRequestPolicy(input, {
      ...init,
      credentials: 'same-origin',
    });
    if (metric) metric.lastStatus = response.status;
  }

  const payload: unknown =
    response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    const errorPayload =
      payload && typeof payload === 'object'
        ? (payload as ErrorResponse)
        : null;

    throw new ApiRequestError({
      status: response.status,
      ...(errorPayload?.error ? { code: errorPayload.error } : {}),
      message: errorPayload?.message ?? apiStatusMessage(response.status),
    });
  }

  return payload as T;
}

function apiStatusMessage(status: number): string {
  if (status === 404) return 'O recurso solicitado não foi encontrado.';
  if (status === 408) return 'A API demorou para responder. Tente novamente.';
  if (status === 429)
    return 'Muitas solicitações foram feitas. Aguarde um momento e tente novamente.';
  if (status >= 500)
    return 'A API está temporariamente indisponível. Tente novamente em instantes.';
  return `A API respondeu com HTTP ${status}`;
}

async function fetchWithRequestPolicy(
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<Response> {
  if (!isGetRequest(init)) {
    try {
      return await fetch(input, init);
    } catch (error) {
      throw networkError(error);
    }
  }

  const controller = new AbortController();
  const externalSignal = init.signal;
  const abortFromCaller = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', abortFromCaller, {
        once: true,
      });
    }
  }
  const timeoutId = window.setTimeout(() => controller.abort(), GET_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && !externalSignal?.aborted) {
      throw new ApiRequestError({
        status: 408,
        code: 'TIMEOUT',
        message: 'A API demorou para responder. Tente novamente.',
      });
    }
    throw networkError(error);
  } finally {
    window.clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', abortFromCaller);
  }
}

export function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>('/api/health');
}

export function followEventStream<T>(
  url: string,
  onEvent: (event: T) => void,
  init?: RequestInit,
): { close: () => void; done: Promise<void> } {
  const controller = new AbortController();
  const requestInit: RequestInit = {
    ...init,
    credentials: 'same-origin',
    signal: controller.signal,
    headers: { Accept: 'text/event-stream', ...init?.headers },
  };
  const metric = metricFor(metricKey(url, requestInit));
  metric.calls += 1;
  const startedAt = performance.now();
  const done = (async () => {
    let response = await fetch(url, requestInit);
    metric.lastStatus = response.status;
    if (response.status === 401) {
      await bootstrapBrowserSession();
      response = await fetch(url, requestInit);
      metric.lastStatus = response.status;
    }
    if (!response.ok || !response.body)
      throw new Error(
        `Não foi possível acompanhar a execução (HTTP ${response.status}).`,
      );
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
        const data = frame
          .split('\n')
          .find((line) => line.startsWith('data: '))
          ?.slice(6);
        if (data) onEvent(JSON.parse(data) as T);
      }
    }
  })().then(
    () => {
      metric.successes += 1;
      metric.lastDurationMs = Math.round(performance.now() - startedAt);
    },
    (error: unknown) => {
      metric.lastDurationMs = Math.round(performance.now() - startedAt);
      if (controller.signal.aborted || isAbortError(error)) {
        metric.cancelled += 1;
        return;
      }
      metric.failures += 1;
      throw error;
    },
  );
  return { close: () => controller.abort(), done };
}
