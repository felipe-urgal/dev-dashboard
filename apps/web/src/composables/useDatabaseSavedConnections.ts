import { ref } from 'vue';

import type { MachineDatabaseConnection } from '@dev-dashboard/contracts';

import { createVersionedLocalStorage } from '../utils/versioned-local-storage';

export type SavedDatabaseConnection = Omit<
  MachineDatabaseConnection,
  'password'
> & {
  id: string;
  label: string;
};

const SAVED_CONNECTIONS_KEY = 'dev-dashboard.database-connections';
const SAVED_CONNECTIONS_VERSION = 1;

function connectionWithoutSecret(
  connection: MachineDatabaseConnection,
): Omit<MachineDatabaseConnection, 'password'> {
  return {
    driver: connection.driver,
    ...(connection.host ? { host: connection.host } : {}),
    ...(connection.port ? { port: connection.port } : {}),
    ...(connection.username ? { username: connection.username } : {}),
    ...(connection.database ? { database: connection.database } : {}),
  };
}

function savedConnectionId(connection: MachineDatabaseConnection): string {
  return [
    connection.driver,
    connection.host ?? '127.0.0.1',
    connection.port ?? '',
    connection.username ?? '',
    connection.database ?? '',
  ].join('|');
}

function savedConnectionLabel(connection: MachineDatabaseConnection): string {
  const address = `${connection.host ?? '127.0.0.1'}:${connection.port ?? ''}`;
  return `${connection.driver} · ${address}${connection.username ? ` · ${connection.username}` : ''}`;
}

function isExplorerDriver(
  value: unknown,
): value is MachineDatabaseConnection['driver'] {
  return value === 'postgresql' || value === 'mysql' || value === 'mariadb';
}

function sanitizeSavedConnection(
  value: unknown,
): SavedDatabaseConnection | null {
  if (typeof value !== 'object' || value === null) return null;

  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== 'string' ||
    typeof item.label !== 'string' ||
    !isExplorerDriver(item.driver)
  ) {
    return null;
  }

  return {
    id: item.id,
    label: item.label,
    driver: item.driver,
    ...(typeof item.host === 'string' ? { host: item.host } : {}),
    ...(typeof item.port === 'number' ? { port: item.port } : {}),
    ...(typeof item.username === 'string' ? { username: item.username } : {}),
    ...(typeof item.database === 'string' ? { database: item.database } : {}),
  };
}

function sanitizeSavedConnections(
  value: unknown,
): SavedDatabaseConnection[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .map(sanitizeSavedConnection)
    .filter((item): item is SavedDatabaseConnection => item !== null);
}

const savedConnectionsStorage = createVersionedLocalStorage<
  SavedDatabaseConnection[]
>({
  key: SAVED_CONNECTIONS_KEY,
  version: SAVED_CONNECTIONS_VERSION,
  fallback: () => [],
  sanitize: sanitizeSavedConnections,
  migrate: (value, fromVersion) => {
    if (fromVersion === 0) return value;
    throw new Error(`Versão de conexões não suportada: ${fromVersion}`);
  },
});

export function useDatabaseSavedConnections() {
  const connections = ref<SavedDatabaseConnection[]>([]);
  const selectedId = ref('');

  function load(): void {
    connections.value = savedConnectionsStorage.read();
  }

  function persist(): void {
    savedConnectionsStorage.write(connections.value);
  }

  function save(
    connection: MachineDatabaseConnection,
  ): SavedDatabaseConnection {
    const metadata = connectionWithoutSecret(connection);
    const saved: SavedDatabaseConnection = {
      ...metadata,
      id: savedConnectionId(metadata),
      label: savedConnectionLabel(metadata),
    };
    connections.value = [
      saved,
      ...connections.value.filter((item) => item.id !== saved.id),
    ];
    persist();
    return saved;
  }

  function select(id: string): SavedDatabaseConnection | undefined {
    selectedId.value = id;
    return connections.value.find((item) => item.id === id);
  }

  function remove(id: string): void {
    connections.value = connections.value.filter((item) => item.id !== id);
    if (selectedId.value === id) selectedId.value = '';
    persist();
  }

  return {
    connections,
    selectedId,
    load,
    save,
    select,
    remove,
  };
}
