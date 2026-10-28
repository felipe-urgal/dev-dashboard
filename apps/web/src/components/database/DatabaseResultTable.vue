<script setup lang="ts">
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/vue/24/outline';
import type { MachineDatabaseQueryResult } from '@dev-dashboard/contracts';

import UiButton from '../ui/UiButton.vue';
import UiSearchField from '../ui/UiSearchField.vue';

import type {
  DatabaseResultExportFormat,
  DatabaseResultSort,
} from '../../composables/useDatabaseResultView';

defineProps<{
  result: MachineDatabaseQueryResult | null;
  visibleRows: MachineDatabaseQueryResult['rows'];
  durationMs: number | null;
  search: string;
  sort: DatabaseResultSort | null;
  copiedMessage: string;
  selectedRow: number | null;
}>();

const emit = defineEmits<{
  'update:search': [value: string];
  'toggle-sort': [column: string];
  'select-row': [index: number];
  copy: [];
  export: [format: DatabaseResultExportFormat];
}>();

function cellKind(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return 'text';
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
</script>

<template>
  <div class="database-grid">
    <div v-if="result" class="database-grid-bar">
      <UiSearchField
        class="database-grid-search"
        :model-value="search"
        label="Buscar nos resultados"
        placeholder="Filtrar linhas"
        @update:model-value="(value: string) => emit('update:search', value)"
      />
      <div class="database-grid-actions">
        <span v-if="copiedMessage" role="status">{{ copiedMessage }}</span>
        <UiButton @click="emit('copy')">Copiar</UiButton>
        <UiButton @click="emit('export', 'csv')">CSV</UiButton>
        <UiButton @click="emit('export', 'json')">JSON</UiButton>
      </div>
      <span class="database-grid-count">
        {{ visibleRows.length }} de {{ result.rowCount }} linhas
        <template v-if="durationMs !== null"> · {{ durationMs }} ms</template>
        <template v-if="result.truncated"> · limitado</template>
      </span>
    </div>

    <div v-if="result" class="database-grid-wrap">
      <table>
        <thead>
          <tr>
            <th class="database-grid-index" scope="col">#</th>
            <th v-for="column in result.columns" :key="column" scope="col">
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
          <tr
            v-for="(row, rowIndex) in visibleRows"
            :key="rowIndex"
            tabindex="0"
            :data-selected="selectedRow === rowIndex"
            @click="emit('select-row', rowIndex)"
            @keydown.enter.prevent="emit('select-row', rowIndex)"
            @keydown.space.prevent="emit('select-row', rowIndex)"
          >
            <td class="database-grid-index">{{ rowIndex + 1 }}</td>
            <td
              v-for="(value, columnIndex) in row"
              :key="columnIndex"
              :data-kind="cellKind(value)"
              :title="cellText(value)"
            >
              {{ cellText(value) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.database-grid {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
}

.database-grid-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.database-grid-search {
  min-width: 240px;
  max-width: 420px;
  flex: 1 1 240px;
}

.database-grid-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--success-text);
  font-size: 12px;
}

.database-grid-count {
  margin-left: auto;
  color: var(--text-muted);
  font-size: 13px;
}

.database-grid-wrap {
  min-height: 0;
  max-height: 55vh;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-1);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

thead th {
  position: sticky;
  z-index: 1;
  top: 0;
  padding: 0;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  text-align: left;
  white-space: nowrap;
}

thead th button {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 6px;
  padding: 9px 14px;
  border: 0;
  color: var(--text-muted);
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

thead th button:hover {
  color: var(--text);
}

thead th button svg {
  width: 12px;
  height: 12px;
}

tbody tr {
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}

tbody tr:last-child {
  border-bottom: 0;
}

tbody tr:hover {
  background: var(--surface-2);
}

tbody tr[data-selected='true'] {
  background: var(--accent-soft);
}

tbody tr:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

td {
  max-width: 360px;
  padding: 9px 14px;
  overflow: hidden;
  font-family: var(--font-family-mono);
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.database-grid-index {
  width: 1%;
  padding-inline: 12px;
  color: var(--text-dim);
  font-size: 11px;
  text-align: right;
}

thead th.database-grid-index {
  padding: 9px 12px;
  font-size: 12px;
}

td[data-kind='null'] {
  color: var(--text-dim);
  font-style: italic;
}

td[data-kind='number'] {
  color: var(--accent);
  text-align: right;
}

td[data-kind='true'] {
  color: var(--success-text);
}

td[data-kind='false'] {
  color: var(--text-dim);
}
</style>
