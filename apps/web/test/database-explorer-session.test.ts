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
    await state.disconnect();
    expect(api.deleteDatabaseExplorerSession).toHaveBeenCalledTimes(1);

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
  it('disconnect durante connect invalida resposta tardia e não reutiliza senha', async () => {
    const catalog = deferred<{ name: string }[]>();
    api.createDatabaseExplorerSession.mockResolvedValue({
      sessionId: 'pending-session',
      expiresAt: futureExpiry(),
    });
    api.fetchDatabaseExplorerCatalog.mockReturnValue(catalog.promise);
    const { wrapper, state } = mountHarness();
    const connecting = state.connect(connection);
    await flushPromises();
    await state.disconnect();
    catalog.resolve([{ name: 'stale' }]);
    await expect(connecting).rejects.toMatchObject({ name: 'AbortError' });
    expect(state.sessionId.value).toBeNull();
    expect(state.connection.value).toBeNull();
    expect(api.deleteDatabaseExplorerSession).toHaveBeenCalledWith(
      'pending-session',
    );
    wrapper.unmount();
  });
});
