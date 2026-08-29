import { onUnmounted, ref } from 'vue';

import type {
  MachineDatabaseCatalogItem,
  MachineDatabaseConnection,
} from '@dev-dashboard/contracts';

import {
  createDatabaseExplorerSession,
  deleteDatabaseExplorerSession,
  fetchDatabaseExplorerCatalog,
} from '../api/database-explorer';
import { ApiRequestError } from '../api/core';

export type DatabaseExplorerConnectionMetadata = Omit<
  MachineDatabaseConnection,
  'password'
>;

interface UseDatabaseExplorerSessionOptions {
  onExpired?: () => void;
}

function connectionWithoutSecret(
  connection: MachineDatabaseConnection,
): DatabaseExplorerConnectionMetadata {
  return {
    driver: connection.driver,
    ...(connection.host ? { host: connection.host } : {}),
    ...(connection.port ? { port: connection.port } : {}),
    ...(connection.username ? { username: connection.username } : {}),
    ...(connection.database ? { database: connection.database } : {}),
  };
}

function supersededSessionError(): Error {
  const error = new Error('A operação da sessão foi substituída.');
  error.name = 'AbortError';
  return error;
}

export function useDatabaseExplorerSession(
  options: UseDatabaseExplorerSessionOptions = {},
) {
  const sessionId = ref<string | null>(null);
  const expiresAt = ref<string | null>(null);
  const connection = ref<DatabaseExplorerConnectionMetadata | null>(null);

  let expiryTimer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;

  function clearExpiryTimer(): void {
    if (expiryTimer) clearTimeout(expiryTimer);
    expiryTimer = null;
  }

  function clearLocalSession(expired = false): void {
    clearExpiryTimer();
    sessionId.value = null;
    expiresAt.value = null;
    connection.value = null;
    if (expired) options.onExpired?.();
  }

  function scheduleExpiry(value: string): void {
    clearExpiryTimer();
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return;

    expiryTimer = setTimeout(() => {
      if (!sessionId.value) return;
      generation += 1;
      clearLocalSession(true);
    }, Math.max(0, timestamp - Date.now()));
  }

  async function deleteBestEffort(id: string): Promise<void> {
    try {
      await deleteDatabaseExplorerSession(id);
    } catch {
      // O servidor ainda aplica TTL absoluto; cleanup best-effort é usado
      // somente para sessão temporária, substituída ou desmontagem da view.
    }
  }

  async function connect(
    input: MachineDatabaseConnection,
  ): Promise<MachineDatabaseCatalogItem[]> {
    const requestGeneration = ++generation;
    const previousSessionId = sessionId.value;
    const created = await createDatabaseExplorerSession(input);

    try {
      const databases = await fetchDatabaseExplorerCatalog(created.sessionId);
      if (requestGeneration !== generation) {
        await deleteBestEffort(created.sessionId);
        throw supersededSessionError();
      }

      sessionId.value = created.sessionId;
      expiresAt.value = created.expiresAt;
      connection.value = connectionWithoutSecret(input);
      scheduleExpiry(created.expiresAt);

      if (previousSessionId && previousSessionId !== created.sessionId) {
        void deleteBestEffort(previousSessionId);
      }

      return databases;
    } catch (error) {
      if (sessionId.value !== created.sessionId) {
        await deleteBestEffort(created.sessionId);
      }
      throw error;
    }
  }

  async function testConnection(
    input: MachineDatabaseConnection,
  ): Promise<MachineDatabaseCatalogItem[]> {
    const created = await createDatabaseExplorerSession(input);
    try {
      return await fetchDatabaseExplorerCatalog(created.sessionId);
    } finally {
      await deleteBestEffort(created.sessionId);
    }
  }

  async function disconnect(): Promise<void> {
    const currentSessionId = sessionId.value;
    if (!currentSessionId) {
      generation += 1;
      clearLocalSession();
      return;
    }

    await deleteDatabaseExplorerSession(currentSessionId);
    generation += 1;
    clearLocalSession();
  }

  function handleSessionError(error: unknown): boolean {
    if (!(error instanceof ApiRequestError) || error.code !== 'SESSION_EXPIRED') {
      return false;
    }

    generation += 1;
    clearLocalSession(true);
    return true;
  }

  onUnmounted(() => {
    generation += 1;
    const currentSessionId = sessionId.value;
    clearLocalSession();
    if (currentSessionId) void deleteBestEffort(currentSessionId);
  });

  return {
    sessionId,
    expiresAt,
    connection,
    connect,
    testConnection,
    disconnect,
    handleSessionError,
  };
}
