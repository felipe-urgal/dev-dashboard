import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearApiRequestMetrics,
  followEventStream,
  getApiRequestMetrics,
  requestJson,
} from '../src/api/core';

describe('requestJson', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearApiRequestMetrics();
  });

  it('deduplica GETs idênticos enquanto a primeira resposta está pendente', async () => {
    let resolveResponse!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => response);

    const first = requestJson<{ value: string }>('/api/project');
    const second = requestJson<{ value: string }>('/api/project');

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveResponse(
      new Response(JSON.stringify({ value: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(Promise.all([first, second])).resolves.toEqual([
      { value: 'ok' },
      { value: 'ok' },
    ]);

    expect(getApiRequestMetrics()).toEqual([
      expect.objectContaining({
        key: 'GET /api/project',
        calls: 1,
        deduplicated: 1,
        successes: 1,
        failures: 0,
        cancelled: 0,
        lastStatus: 200,
      }),
    ]);
  });

  it('não compartilha GETs que possuem AbortSignal próprio', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ value: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await Promise.all([
      requestJson('/api/processes', { signal: new AbortController().signal }),
      requestJson('/api/processes', { signal: new AbortController().signal }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getApiRequestMetrics()).toEqual([
      expect.objectContaining({
        key: 'GET /api/processes',
        calls: 2,
        successes: 2,
        failures: 0,
        cancelled: 0,
        lastStatus: 200,
      }),
    ]);
  });

  it('rastreia chamadas não deduplicáveis e registra status de sucesso', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'created' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await requestJson('/api/projects', { method: 'POST', body: '{}' });

    expect(getApiRequestMetrics()).toEqual([
      expect.objectContaining({
        key: 'POST /api/projects',
        calls: 1,
        successes: 1,
        failures: 0,
        cancelled: 0,
        lastStatus: 201,
      }),
    ]);
  });

  it('registra cancelamentos separadamente de falhas', async () => {
    const abortError = Object.assign(new Error('The operation was aborted.'), {
      name: 'AbortError',
    });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError);

    await expect(
      requestJson('/api/processes', { signal: new AbortController().signal }),
    ).rejects.toThrow();

    expect(getApiRequestMetrics()).toEqual([
      expect.objectContaining({
        key: 'GET /api/processes',
        calls: 1,
        successes: 0,
        failures: 0,
        cancelled: 1,
      }),
    ]);
  });

  it('registra streams SSE concluídos e eventos recebidos', async () => {
    const events: unknown[] = [];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"status":"done"}\n\n'),
        );
        controller.close();
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    );

    const stream = followEventStream('/api/process-stream', (event) => {
      events.push(event);
    });
    await stream.done;

    expect(events).toEqual([{ status: 'done' }]);
    expect(getApiRequestMetrics()).toEqual([
      expect.objectContaining({
        key: 'GET /api/process-stream',
        calls: 1,
        successes: 1,
        failures: 0,
        cancelled: 0,
        lastStatus: 200,
      }),
    ]);
  });

  it('registra o encerramento de um stream como cancelamento', async () => {
    const abortError = Object.assign(new Error('The operation was aborted.'), {
      name: 'AbortError',
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(abortError));
        }),
    );

    const stream = followEventStream('/api/long-process', () => undefined);
    stream.close();
    await stream.done;

    expect(getApiRequestMetrics()).toEqual([
      expect.objectContaining({
        key: 'GET /api/long-process',
        calls: 1,
        successes: 0,
        failures: 0,
        cancelled: 1,
      }),
    ]);
  });

  it('limita a quantidade de endpoints mantidos em memória', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    await Promise.all(
      Array.from({ length: 105 }, (_, index) =>
        requestJson(`/api/metric-${index}`),
      ),
    );

    const metrics = getApiRequestMetrics();
    expect(metrics).toHaveLength(100);
    expect(metrics[0]?.url).toBe('/api/metric-5');
  });
});
