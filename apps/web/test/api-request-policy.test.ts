import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearApiRequestMetrics,
  getApiRequestMetrics,
  requestJson,
} from '../src/api/core';

describe('política HTTP do requestJson', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearApiRequestMetrics();
  });

  it('mantém um AbortSignal interno para o timeout de GETs', async () => {
    let receivedSignal: AbortSignal | null | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      receivedSignal = init?.signal;
      return new Response(JSON.stringify({ value: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    await expect(requestJson('/api/project')).resolves.toEqual({ value: 'ok' });

    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });

  it('não cria timeout implícito para mutações', async () => {
    let receivedSignal: AbortSignal | null | undefined;
    let resolveResponse!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      receivedSignal = init?.signal;
      return response;
    });

    const pending = requestJson<{ id: string }>('/api/projects', {
      method: 'POST',
      body: '{}',
    });

    expect(receivedSignal).toBeUndefined();

    resolveResponse(
      new Response(JSON.stringify({ id: 'created' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(pending).resolves.toEqual({ id: 'created' });
  });

  it('preserva AbortSignal explícito do chamador em mutações', async () => {
    const controller = new AbortController();
    const abortError = Object.assign(new Error('The operation was aborted.'), {
      name: 'AbortError',
    });
    let receivedSignal: AbortSignal | null | undefined;

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise<Response>((_, reject) => {
          receivedSignal = init?.signal;
          init?.signal?.addEventListener('abort', () => reject(abortError), {
            once: true,
          });
        }),
    );

    const pending = requestJson('/api/projects', {
      method: 'POST',
      body: '{}',
      signal: controller.signal,
    });

    expect(receivedSignal).toBe(controller.signal);

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(getApiRequestMetrics()).toEqual([
      expect.objectContaining({
        key: 'POST /api/projects',
        calls: 1,
        successes: 0,
        failures: 0,
        cancelled: 1,
      }),
    ]);
  });
});
