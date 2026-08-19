import { afterEach, describe, expect, it, vi } from 'vitest';

import { requestJson } from '../src/api/core';

describe('requestJson', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
  });
});
