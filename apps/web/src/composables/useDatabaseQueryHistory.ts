import { computed, ref } from 'vue';

import type { MachineDatabaseConnection } from '@dev-dashboard/contracts';

import { createVersionedLocalStorage } from '../utils/versioned-local-storage';

export type DatabaseQueryHistoryItem = {
  id: string;
  query: string;
  driver: MachineDatabaseConnection['driver'];
  database: string;
  table: string;
  createdAt: string;
  favorite: boolean;
};

export type DatabaseQueryHistoryInput = Omit<
  DatabaseQueryHistoryItem,
  'id' | 'createdAt' | 'favorite'
>;

const QUERY_HISTORY_KEY = 'dev-dashboard.database-query-history';
const QUERY_HISTORY_VERSION = 1;
const QUERY_HISTORY_LIMIT = 50;
const RECENT_QUERY_LIMIT = 8;

function isExplorerDriver(
  value: unknown,
): value is MachineDatabaseConnection['driver'] {
  return value === 'postgresql' || value === 'mysql' || value === 'mariadb';
}

function sanitizeHistoryItem(value: unknown): DatabaseQueryHistoryItem | null {
  if (typeof value !== 'object' || value === null) return null;

  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== 'string' ||
    typeof item.query !== 'string' ||
    !isExplorerDriver(item.driver) ||
    typeof item.database !== 'string' ||
    typeof item.table !== 'string' ||
    typeof item.createdAt !== 'string' ||
    typeof item.favorite !== 'boolean'
  ) {
    return null;
  }

  return {
    id: item.id,
    query: item.query,
    driver: item.driver,
    database: item.database,
    table: item.table,
    createdAt: item.createdAt,
    favorite: item.favorite,
  };
}

function sanitizeQueryHistory(value: unknown): DatabaseQueryHistoryItem[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .map(sanitizeHistoryItem)
    .filter((item): item is DatabaseQueryHistoryItem => item !== null)
    .slice(0, QUERY_HISTORY_LIMIT);
}

const queryHistoryStorage = createVersionedLocalStorage<
  DatabaseQueryHistoryItem[]
>({
  key: QUERY_HISTORY_KEY,
  version: QUERY_HISTORY_VERSION,
  fallback: () => [],
  sanitize: sanitizeQueryHistory,
  migrate: (value, fromVersion) => {
    if (fromVersion === 0) return value;
    throw new Error(`Versão de histórico não suportada: ${fromVersion}`);
  },
});

export function useDatabaseQueryHistory() {
  const history = ref<DatabaseQueryHistoryItem[]>([]);
  const recent = computed(() => history.value.slice(0, RECENT_QUERY_LIMIT));

  function load(): void {
    history.value = queryHistoryStorage.read();
  }

  function persist(): void {
    queryHistoryStorage.write(history.value.slice(0, QUERY_HISTORY_LIMIT));
  }

  function remember(input: DatabaseQueryHistoryInput): void {
    if (!input.query.trim()) return;
    const item: DatabaseQueryHistoryItem = {
      ...input,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      query: input.query.trim(),
      createdAt: new Date().toISOString(),
      favorite: false,
    };
    const duplicate = history.value.find(
      (historyItem) =>
        historyItem.query === item.query &&
        historyItem.driver === item.driver &&
        historyItem.database === item.database,
    );
    history.value = [
      { ...item, favorite: duplicate?.favorite ?? false },
      ...history.value.filter(
        (historyItem) => historyItem.id !== duplicate?.id,
      ),
    ];
    persist();
  }

  function toggleFavorite(id: string): void {
    history.value = history.value.map((item) =>
      item.id === id ? { ...item, favorite: !item.favorite } : item,
    );
    persist();
  }

  function remove(id: string): void {
    history.value = history.value.filter((item) => item.id !== id);
    persist();
  }

  function clear(): void {
    history.value = [];
    persist();
  }

  return {
    history,
    recent,
    load,
    remember,
    toggleFavorite,
    remove,
    clear,
  };
}
