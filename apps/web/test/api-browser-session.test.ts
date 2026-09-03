import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bootstrapBrowserSession,
  clearApiRequestMetrics,
  followEventStream,
  getApiRequestMetrics,
  requestJson,
} from '../src/api/core';

function resetBrowserUrl(): void {
  window.history.replaceState(null, '', '/');
}

describe('browser API session', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearApiRequestMetrics();
    window.sessionStorage.clear();
    resetBrowserUrl();
  });

  it('consome o bootstrap da URL, persiste o token e limpa o fragmento', async () => {
    window.location.hash = '#bootstrap=one-time-token';
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    await bootstrapBrowserSession();

    expect(window.sessionStorage.getItem('dev-dashboard-browser-bootstrap')).toBe(
      'one-time-token',
    );
    expect(window.location.hash).toBe('');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/browser-session',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Dev-Dashboard-Browser-Bootstrap': 'one-time-token',
        }),
      }),
    );
    expect(getApiRequestMetrics()).toEqual([
      expect.objectContaining({
        key: 'POST /api/auth/browser-session',
        calls: 1,
        successes: 1,
        failures: 0,
        lastStatus: 204,
      }),
    ]);
  });

  it('compartilha o bootstrap enquanto a primeira renovação está pendente', async () => {
    let resolveResponse!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => response);

    const first = bootstrapBrowserSession();
    const second = bootstrapBrowserSession();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveResponse(new Response(null, { status: 204 }));
    await Promise.all([first, second]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getApiRequestMetrics()).toEqual([
      expect.objectContaining({
        key: 'POST /api/auth/browser-session',
        calls: 1,
        successes: 1,
      }),
    ]);
  });

  it('libera uma nova tentativa quando o bootstrap falha', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(bootstrapBrowserSession()).rejects.toThrow(
      'Não foi possível iniciar a sessão segura do navegador.',
    );
    await expect(bootstrapBrowserSession()).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getApiRequestMetrics()).toEqual([
      expect.objectContaining({
        key: 'POST /api/auth/browser-session',
        calls: 2,
        successes: 1,
        failures: 1,
        lastStatus: 204,
      }),
    ]);
  });

  it('renova a sessão após 401 e repete a requisição original uma única vez', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Sessão expirada' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: 'renewed' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    await expect(requestJson('/api/protected')).resolves.toEqual({
      value: 'renewed',
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(getApiRequestMetrics()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'GET /api/protected',
          calls: 1,
          successes: 1,
          failures: 0,
          lastStatus: 200,
        }),
        expect.objectContaining({
          key: 'POST /api/auth/browser-session',
          calls: 1,
          successes: 1,
          failures: 0,
          lastStatus: 204,
        }),
      ]),
    );
  });

  it('preserva código e mensagem estruturados retornados pela API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'INVALID_REQUEST',
          message: 'Entrada inválida.',
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    await expect(requestJson('/api/invalid')).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_REQUEST',
      message: 'Entrada inválida.',
    });
  });

  it('usa a mensagem HTTP genérica quando a resposta de erro não é JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not-json', {
        status: 418,
        headers: { 'content-type': 'text/plain' },
      }),
    );

    await expect(requestJson('/api/teapot')).rejects.toMatchObject({
      status: 418,
      message: 'A API respondeu com HTTP 418',
    });
  });

  it('registra stream sem body como falha observável', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    );

    const stream = followEventStream('/api/empty-stream', () => undefined);

    await expect(stream.done).rejects.toThrow(
      'Não foi possível acompanhar a execução (HTTP 200).',
    );
    expect(getApiRequestMetrics()).toEqual([
      expect.objectContaining({
        key: 'GET /api/empty-stream',
        calls: 1,
        successes: 0,
        failures: 1,
        cancelled: 0,
        lastStatus: 200,
      }),
    ]);
  });
});
