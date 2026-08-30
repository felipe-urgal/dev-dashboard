<script setup lang="ts">
import {
  ChevronDownIcon,
  ChevronUpIcon,
  MagnifyingGlassIcon,
} from '@heroicons/vue/24/outline';
import type { MachineDatabaseQueryResult } from '@dev-dashboard/contracts';

import type {
  DatabaseResultExportFormat,
  DatabaseResultSort,
} from '../../composables/useDatabaseResultView';

defineProps<{
  table: string;
  result: MachineDatabaseQueryResult | null;
  visibleRows: MachineDatabaseQueryResult['rows'];
  durationMs: number | null;
  search: string;
  sort: DatabaseResultSort | null;
  copiedMessage: string;
}>();

const emit = defineEmits<{
  'update:search': [value: string];
  'toggle-sort': [column: string];
  copy: [];
  export: [format: DatabaseResultExportFormat];
}>();

function onSearch(event: Event): void {
  emit('update:search', (event.target as HTMLInputElement).value);
}
</script>

<template>
  <div class="database-explorer-result-heading">
    <div>
      <span>Visualização</span>
      <h3>{{ table }}</h3>
    </div>
    <span v-if="result">
      {{ visibleRows.length }} de {{ result.rowCount }} linhas
      <template v-if="durationMs !== null"> · {{ durationMs }} ms </template>
      <template v-if="result.truncated"> · resultado limitado </template>
    </span>
  </div>
  <div v-if="result" class="database-explorer-result-tools">
    <label>
      <MagnifyingGlassIcon aria-hidden="true" />
      <span class="sr-only">Buscar nos resultados</span>
      <input
        :value="search"
        type="search"
        placeholder="Buscar nos resultados"
        @input="onSearch"
      />
    </label>
    <div>
      <button type="button" @click="emit('copy')">Copiar</button>
      <button type="button" @click="emit('export', 'csv')">CSV</button>
      <button type="button" @click="emit('export', 'json')">JSON</button>
      <span v-if="copiedMessage" role="status">
        {{ copiedMessage }}
      </span>
    </div>
  </div>
  <div v-if="result" class="database-explorer-table-wrap">
    <table>
      <thead>
        <tr>
          <th v-for="column in result.columns" :key="column">
            <button type="button" @click="emit('toggle-sort', column)">
              {{ column }}
              <ChevronUpIcon
                v-if="sort?.column === column && sort.direction === 'asc'"
                aria-hidden="true"
              />
              <ChevronDownIcon
                v-else-if="sort?.column === column"
                aria-hidden="true"
              />
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, rowIndex) in visibleRows" :key="rowIndex">
          <td v-for="(value, columnIndex) in row" :key="columnIndex">
            {{ value ?? 'NULL' }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
