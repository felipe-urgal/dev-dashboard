import { computed, ref } from 'vue';

import type { MachineDatabaseConnection } from '@dev-dashboard/contracts';

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

const LEGACY_KEY = 'dev-dashboard.database-query-history';
const RECENT_KEY = 'dev-dashboard.database-recent-queries';
const SAVED_KEY = 'dev-dashboard.database-saved-queries';
const QUERY_LIMIT = 50;
const RECENT_DISPLAY_LIMIT = 8;

function validItem(value: unknown): DatabaseQueryHistoryItem | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== 'string' ||
    typeof item.query !== 'string' ||
    !['postgresql', 'mysql', 'mariadb'].includes(String(item.driver)) ||
    typeof item.database !== 'string' ||
    typeof item.table !== 'string' ||
    typeof item.createdAt !== 'string'
  ) return null;
  // Ignore unknown fields, including any legacy credentials.
  return {
    id: item.id,
    query: item.query,
    driver: item.driver as DatabaseQueryHistoryItem['driver'],
    database: item.database,
    table: item.table,
    createdAt: item.createdAt,
    favorite: false,
  };
}

function readItems(storage: Storage, key: string): DatabaseQueryHistoryItem[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(validItem).filter((item): item is DatabaseQueryHistoryItem => item !== null).slice(0, QUERY_LIMIT);
  } catch {
    return [];
  }
}

function writeItems(storage: Storage, key: string, items: DatabaseQueryHistoryItem[]): void {
  try {
    storage.setItem(key, JSON.stringify(items.slice(0, QUERY_LIMIT)));
  } catch {
    // Storage may be disabled; keep the in-memory state usable.
  }
}

export function useDatabaseQueryHistory() {
  const history = ref<DatabaseQueryHistoryItem[]>([]);
  const saved = ref<DatabaseQueryHistoryItem[]>([]);
  const recent = computed(() => history.value.slice(0, RECENT_DISPLAY_LIMIT));
  const savedQueries = computed(() => saved.value);
  const count = computed(() => history.value.length + saved.value.length);

  function load(): void {
    // Legacy SQL was persisted without informed consent. Never import it automatically.
    // Removing the key also removes any unexpected secrets inside its payload.
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* storage disabled */ }
    history.value = readItems(sessionStorage, RECENT_KEY);
    saved.value = readItems(localStorage, SAVED_KEY).map(item => ({ ...item, favorite: true }));
  }

  function persist(): void {
    writeItems(sessionStorage, RECENT_KEY, history.value);
    writeItems(localStorage, SAVED_KEY, saved.value);
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
    history.value = [
      item,
      ...history.value.filter(existing =>
        !(existing.query === item.query && existing.driver === item.driver && existing.database === item.database)),
    ].slice(0, QUERY_LIMIT);
    persist();
  }

  function toggleFavorite(id: string): void {
    const existingSaved = saved.value.find(item => item.id === id);
    if (existingSaved) {
      saved.value = saved.value.filter(item => item.id !== id);
      persist();
      return;
    }
    const item = history.value.find(item => item.id === id);
    if (!item) return;
    saved.value = [
      { ...item, favorite: true },
      ...saved.value.filter(existing =>
        !(existing.query === item.query && existing.driver === item.driver && existing.database === item.database)),
    ].slice(0, QUERY_LIMIT);
    persist();
  }

  function remove(id: string): void {
    history.value = history.value.filter(item => item.id !== id);
    saved.value = saved.value.filter(item => item.id !== id);
    persist();
  }

  function clear(): void {
    history.value = [];
    persist();
  }

  return {
    history,
    recent,
    savedQueries,
    count,
    load,
    remember,
    toggleFavorite,
    remove,
    clear,
  };
}
