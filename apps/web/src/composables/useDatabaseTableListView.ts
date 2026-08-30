import { computed, ref, type Ref } from 'vue';

import type { MachineDatabaseTable } from '@dev-dashboard/contracts';

export function useDatabaseTableListView(
  tables: Ref<MachineDatabaseTable[]>,
  pageSize = 40,
) {
  const search = ref('');
  const page = ref(1);

  const filtered = computed(() => {
    const normalizedSearch = search.value.trim().toLocaleLowerCase();
    if (!normalizedSearch) return tables.value;
    return tables.value.filter((table) =>
      `${table.schema ? `${table.schema}.` : ''}${table.name}`
        .toLocaleLowerCase()
        .includes(normalizedSearch),
    );
  });

  const pageCount = computed(() =>
    Math.max(1, Math.ceil(filtered.value.length / pageSize)),
  );

  const visible = computed(() => {
    const start = (page.value - 1) * pageSize;
    return filtered.value.slice(start, start + pageSize);
  });

  function setSearch(value: string): void {
    search.value = value;
    page.value = 1;
  }

  function reset(): void {
    search.value = '';
    page.value = 1;
  }

  function previous(): void {
    page.value = Math.max(1, page.value - 1);
  }

  function next(): void {
    page.value = Math.min(pageCount.value, page.value + 1);
  }

  return {
    search,
    page,
    filtered,
    pageCount,
    visible,
    setSearch,
    reset,
    previous,
    next,
  };
}
