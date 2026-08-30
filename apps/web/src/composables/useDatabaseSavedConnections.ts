import { ref } from 'vue';

import type { MachineDatabaseConnection } from '@dev-dashboard/contracts';

export type SavedDatabaseConnection = Omit<
  MachineDatabaseConnection,
  'password'
> & {
  id: string;
  label: string;
};

const SAVED_CONNECTIONS_KEY = 'dev-dashboard.database-connections';

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

function isSavedConnection(value: unknown): value is SavedDatabaseConnection {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as SavedDatabaseConnection).id === 'string' &&
    typeof (value as SavedDatabaseConnection).label === 'string'
  );
}

export function useDatabaseSavedConnections() {
  const connections = ref<SavedDatabaseConnection[]>([]);
  const selectedId = ref('');

  function load(): void {
    try {
      const raw = localStorage.getItem(SAVED_CONNECTIONS_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      connections.value = Array.isArray(parsed)
        ? parsed.filter(isSavedConnection)
        : [];
    } catch {
      connections.value = [];
    }
  }

  function persist(): void {
    localStorage.setItem(SAVED_CONNECTIONS_KEY, JSON.stringify(connections.value));
  }

  function save(connection: MachineDatabaseConnection): SavedDatabaseConnection {
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
