<script setup lang="ts">
import { ArrowPathIcon } from '@heroicons/vue/24/outline';
import type { MachineDatabaseTable } from '@dev-dashboard/contracts';

defineProps<{
  databases: { name: string }[];
  tables: MachineDatabaseTable[];
  selectedDatabase: string;
  selectedTable: string;
  tableSearch: string;
  filteredTableCount: number;
  page: number;
  pageCount: number;
  loading: boolean;
}>();

const emit = defineEmits<{
  'select-database': [database: string];
  'search-table': [value: string];
  'select-table': [table: MachineDatabaseTable];
  'previous-page': [];
  'next-page': [];
}>();

function onDatabaseChange(event: Event): void {
  emit('select-database', (event.target as HTMLSelectElement).value);
}

function onTableSearch(event: Event): void {
  emit('search-table', (event.target as HTMLInputElement).value);
}
</script>

<template>
  <aside class="database-explorer-sidebar" aria-label="Bancos e tabelas">
    <div class="database-explorer-sidebar-heading">
      <div>
        <strong>Bancos e tabelas</strong><span>{{ databases.length }} bancos</span>
      </div>
      <ArrowPathIcon
        v-if="loading"
        class="is-spinning"
        aria-label="Carregando"
      />
    </div>
    <label v-if="tables.length" class="database-explorer-table-search">
      <span>Buscar tabela</span>
      <input
        :value="tableSearch"
        type="search"
        placeholder="Nome da tabela"
        @input="onTableSearch"
      />
    </label>
    <label class="database-explorer-select-label"
      >Banco
      <select
        :value="selectedDatabase"
        :disabled="loading"
        @change="onDatabaseChange"
      >
        <option value="">Selecione um banco</option>
        <option
          v-for="database in databases"
          :key="database.name"
          :value="database.name"
        >
          {{ database.name }}
        </option>
      </select>
    </label>
    <div v-if="selectedDatabase" class="database-explorer-table-list">
      <span>Tabelas</span>
      <button
        v-for="table in tables"
        :key="`${table.schema}.${table.name}`"
        type="button"
        :class="{ active: selectedTable === table.name }"
        :disabled="loading"
        @click="emit('select-table', table)"
      >
        {{ table.schema ? `${table.schema}.` : '' }}{{ table.name }}
      </button>
      <p v-if="!filteredTableCount && !loading">
        Nenhuma tabela encontrada para esta busca.
      </p>
      <div v-if="pageCount > 1" class="database-explorer-pagination">
        <button
          type="button"
          :disabled="page === 1"
          @click="emit('previous-page')"
        >
          Anterior
        </button>
        <span>Página {{ page }} de {{ pageCount }}</span>
        <button
          type="button"
          :disabled="page === pageCount"
          @click="emit('next-page')"
        >
          Próxima
        </button>
      </div>
    </div>
  </aside>
</template>
