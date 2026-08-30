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

const QUERY_HISTORY_KEY = 'dev-dashboard.database-query-history';
const QUERY_HISTORY_LIMIT = 50;
const RECENT_QUERY_LIMIT = 8;

function isHistoryItem(value: unknown): value is DatabaseQueryHistoryItem {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as DatabaseQueryHistoryItem).id === 'string' &&
    typeof (value as DatabaseQueryHistoryItem).query === 'string' &&
    typeof (value as DatabaseQueryHistoryItem).createdAt === 'string'
  );
}

export function useDatabaseQueryHistory() {
  const history = ref<DatabaseQueryHistoryItem[]>([]);
  const recent = computed(() => history.value.slice(0, RECENT_QUERY_LIMIT));

  function load(): void {
    try {
      const raw = localStorage.getItem(QUERY_HISTORY_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      history.value = Array.isArray(parsed) ? parsed.filter(isHistoryItem) : [];
    } catch {
      history.value = [];
    }
  }

  function persist(): void {
    localStorage.setItem(
      QUERY_HISTORY_KEY,
      JSON.stringify(history.value.slice(0, QUERY_HISTORY_LIMIT)),
    );
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
