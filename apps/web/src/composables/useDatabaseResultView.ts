import { computed, ref } from 'vue';

import type { MachineDatabaseQueryResult } from '@dev-dashboard/contracts';

export type DatabaseResultSort = {
  column: string;
  direction: 'asc' | 'desc';
};

export type DatabaseResultExportFormat = 'csv' | 'json';

export function useDatabaseResultView() {
  const result = ref<MachineDatabaseQueryResult | null>(null);
  const search = ref('');
  const sort = ref<DatabaseResultSort | null>(null);
  const copiedMessage = ref('');
  const durationMs = ref<number | null>(null);

  const visibleRows = computed(() => {
    if (!result.value) return [];
    const normalizedSearch = search.value.trim().toLocaleLowerCase();
    const columns = result.value.columns;
    const rows = result.value.rows.filter((row) => {
      if (!normalizedSearch) return true;
      return row.some((value) =>
        String(value ?? 'NULL')
          .toLocaleLowerCase()
          .includes(normalizedSearch),
      );
    });
    const currentSort = sort.value;
    if (!currentSort) return rows;
    const columnIndex = columns.indexOf(currentSort.column);
    if (columnIndex < 0) return rows;
    return [...rows].sort((left, right) => {
      const a = left[columnIndex];
      const b = right[columnIndex];
      if (a === b) return 0;
      if (a === null || a === undefined) {
        return currentSort.direction === 'asc' ? -1 : 1;
      }
      if (b === null || b === undefined) {
        return currentSort.direction === 'asc' ? 1 : -1;
      }
      const comparison = String(a).localeCompare(String(b), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      return currentSort.direction === 'asc' ? comparison : -comparison;
    });
  });

  function setResult(value: MachineDatabaseQueryResult | null): void {
    result.value = value;
  }

  function setDuration(value: number | null): void {
    durationMs.value = value;
  }

  function clearCopiedMessage(): void {
    copiedMessage.value = '';
  }

  function resetPresentation(): void {
    search.value = '';
    sort.value = null;
    copiedMessage.value = '';
  }

  function clear(): void {
    result.value = null;
    durationMs.value = null;
    resetPresentation();
  }

  function toggleSort(column: string): void {
    const current = sort.value;
    sort.value =
      current?.column === column
        ? {
            column,
            direction: current.direction === 'asc' ? 'desc' : 'asc',
          }
        : { column, direction: 'asc' };
  }

  function rowsAsTsv(): string {
    if (!result.value) return '';
    return [
      result.value.columns.join('\t'),
      ...visibleRows.value.map((row) =>
        row.map((value) => String(value ?? 'NULL')).join('\t'),
      ),
    ].join('\n');
  }

  async function copy(): Promise<void> {
    const text = rowsAsTsv();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      copiedMessage.value = 'Resultado copiado.';
    } catch {
      copiedMessage.value = 'Não foi possível copiar o resultado.';
    }
  }

  function downloadFile(content: string, name: string, type: string): void {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportResults(format: DatabaseResultExportFormat): void {
    if (!result.value) return;
    if (format === 'json') {
      const rows = visibleRows.value.map((row) =>
        Object.fromEntries(
          result.value!.columns.map((column, index) => [
            column,
            row[index] ?? null,
          ]),
        ),
      );
      downloadFile(
        JSON.stringify(rows, null, 2),
        'resultado.json',
        'application/json',
      );
      return;
    }

    const escapeCsv = (value: unknown) =>
      `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [
      result.value.columns.map(escapeCsv).join(','),
      ...visibleRows.value.map((row) => row.map(escapeCsv).join(',')),
    ].join('\n');
    downloadFile(csv, 'resultado.csv', 'text/csv;charset=utf-8');
  }

  return {
    result,
    search,
    sort,
    copiedMessage,
    durationMs,
    visibleRows,
    setResult,
    setDuration,
    clearCopiedMessage,
    resetPresentation,
    clear,
    toggleSort,
    copy,
    exportResults,
  };
}
