import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  createDatabaseExplorerSession: vi.fn(),
  deleteDatabaseExplorerSession: vi.fn(),
  fetchDatabaseExplorerCatalog: vi.fn(),
}));

vi.mock('../src/api/database-explorer', () => api);

import { ApiRequestError } from '../src/api/core';
import { useDatabaseExplorerSession } from '../src/composables/useDatabaseExplorerSession';

function mountHarness(onExpired = vi.fn()) {
  let state!: ReturnType<typeof useDatabaseExplorerSession>;
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useDatabaseExplorerSession({ onExpired });
        return {};
      },
      template: '<div />',
    }),
  );
  return { wrapper, state, onExpired };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function futureExpiry(): string {
  return new Date(Date.now() + 60_000).toISOString();
}

const connection = {
  driver: 'postgresql' as const,
  host: '127.0.0.1',
  port: 5432,
  username: 'dev',
  password: 'secret',
};

describe('useDatabaseExplorerSession', () => {
  beforeEach(() => {
    api.createDatabaseExplorerSession.mockReset();
    api.deleteDatabaseExplorerSession.mockReset();
    api.fetchDatabaseExplorerCatalog.mockReset();
    api.deleteDatabaseExplorerSession.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mantém apenas metadados sem senha depois de conectar', async () => {
    api.createDatabaseExplorerSession.mockResolvedValue({
      sessionId: 'session-1',
      expiresAt: futureExpiry(),
    });
    api.fetchDatabaseExplorerCatalog.mockResolvedValue([
      { name: 'app_development' },
    ]);

    const { wrapper, state } = mountHarness();
    const databases = await state.connect(connection);

    expect(databases).toEqual([{ name: 'app_development' }]);
    expect(state.sessionId.value).toBe('session-1');
    expect(state.connection.value).toEqual({
      driver: 'postgresql',
      host: '127.0.0.1',
      port: 5432,
      username: 'dev',
    });
    expect(state.connection.value).not.toHaveProperty('password');

    wrapper.unmount();
    await flushPromises();
    expect(api.deleteDatabaseExplorerSession).toHaveBeenCalledWith('session-1');
  });

  it('segue o expiresAt absoluto retornado pelo servidor', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-29T17:00:00.000Z'));
    api.createDatabaseExplorerSession.mockResolvedValue({
      sessionId: 'session-1',
      expiresAt: '2026-08-29T17:00:01.000Z',
    });
    api.fetchDatabaseExplorerCatalog.mockResolvedValue([]);

    const { wrapper, state, onExpired } = mountHarness();
    await state.connect(connection);

    await vi.advanceTimersByTimeAsync(999);
    expect(state.sessionId.value).toBe('session-1');
    expect(onExpired).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(state.sessionId.value).toBeNull();
    expect(state.connection.value).toBeNull();
    expect(onExpired).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it('não deixa a expiração antiga cancelar um reconnect em andamento', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-29T17:00:00.000Z'));
    api.createDatabaseExplorerSession
      .mockResolvedValueOnce({
        sessionId: 'session-1',
        expiresAt: '2026-08-29T17:00:01.000Z',
      })
      .mockResolvedValueOnce({
        sessionId: 'session-2',
        expiresAt: '2026-08-29T17:00:10.000Z',
      });
    const nextCatalog = deferred<{ name: string }[]>();
    api.fetchDatabaseExplorerCatalog
      .mockResolvedValueOnce([{ name: 'old_database' }])
      .mockReturnValueOnce(nextCatalog.promise);

    const { wrapper, state, onExpired } = mountHarness();
    await state.connect(connection);

    const reconnect = state.connect({ ...connection, username: 'next' });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(state.sessionId.value).toBe('session-1');
    expect(onExpired).not.toHaveBeenCalled();

    nextCatalog.resolve([{ name: 'next_database' }]);
    await expect(reconnect).resolves.toEqual([{ name: 'next_database' }]);
    expect(state.sessionId.value).toBe('session-2');
    expect(onExpired).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('usa sessão temporária no teste e não mascara falha com erro de cleanup', async () => {
    api.createDatabaseExplorerSession.mockResolvedValue({
      sessionId: 'test-session',
      expiresAt: futureExpiry(),
    });
    api.fetchDatabaseExplorerCatalog.mockRejectedValue(
      new Error('credenciais rejeitadas'),
    );
    api.deleteDatabaseExplorerSession.mockRejectedValue(
      new Error('cleanup indisponível'),
    );

    const { wrapper, state } = mountHarness();

    await expect(state.testConnection(connection)).rejects.toThrow(
      'credenciais rejeitadas',
    );
    expect(api.deleteDatabaseExplorerSession).toHaveBeenCalledWith(
      'test-session',
    );
    expect(state.sessionId.value).toBeNull();

    wrapper.unmount();
  });

  it('faz disconnect explícito antes de limpar o estado local', async () => {
    api.createDatabaseExplorerSession.mockResolvedValue({
      sessionId: 'session-1',
      expiresAt: futureExpiry(),
    });
    api.fetchDatabaseExplorerCatalog.mockResolvedValue([]);

    const { wrapper, state } = mountHarness();
    await state.connect(connection);
    await state.disconnect();

    expect(api.deleteDatabaseExplorerSession).toHaveBeenCalledWith('session-1');
    expect(state.sessionId.value).toBeNull();
    expect(state.connection.value).toBeNull();

    wrapper.unmount();
  });

  it('limpa a sessão ao receber SESSION_EXPIRED', async () => {
    api.createDatabaseExplorerSession.mockResolvedValue({
      sessionId: 'session-1',
      expiresAt: futureExpiry(),
    });
    api.fetchDatabaseExplorerCatalog.mockResolvedValue([]);

    const { wrapper, state, onExpired } = mountHarness();
    await state.connect(connection);

    const handled = state.handleSessionError(
      new ApiRequestError({
        status: 410,
        code: 'SESSION_EXPIRED',
        message: 'Sessão expirada.',
      }),
    );

    expect(handled).toBe(true);
    expect(state.sessionId.value).toBeNull();
    expect(onExpired).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });
});
