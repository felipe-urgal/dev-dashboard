<script setup lang="ts">
import type { DatabaseQueryHistoryItem } from '../../composables/useDatabaseQueryHistory';

defineProps<{
  query: string;
  loading: boolean;
  historyOpen: boolean;
  historyCount: number;
  recentQueries: DatabaseQueryHistoryItem[];
}>();

const emit = defineEmits<{
  'update:query': [value: string];
  'toggle-history': [];
  'clear-history': [];
  'restore-query': [item: DatabaseQueryHistoryItem];
  'toggle-favorite': [id: string];
  'remove-history': [id: string];
  reset: [];
  run: [];
}>();

function onQueryInput(event: Event): void {
  emit('update:query', (event.target as HTMLTextAreaElement).value);
}
</script>

<template>
  <div class="database-explorer-query-box">
    <div class="database-explorer-query-heading">
      <div>
        <label for="database-query">Consulta SELECT/WITH</label>
        <span>Ctrl/Cmd + Enter para executar</span>
      </div>
      <button type="button" @click="emit('toggle-history')">Histórico</button>
    </div>
    <div v-if="historyOpen" class="database-explorer-history">
      <div class="database-explorer-history-heading">
        <span>Consultas recentes</span>
        <button
          type="button"
          :disabled="!historyCount"
          @click="emit('clear-history')"
        >
          Limpar histórico
        </button>
      </div>
      <p v-if="!recentQueries.length">
        Nenhuma consulta executada nesta sessão do navegador.
      </p>
      <div
        v-for="item in recentQueries"
        :key="item.id"
        class="database-explorer-history-item"
      >
        <button
          type="button"
          class="database-explorer-history-query"
          @click="emit('restore-query', item)"
        >
          <strong>{{ item.favorite ? '★' : '☆' }}</strong>
          <code>{{ item.query }}</code>
        </button>
        <button
          type="button"
          :aria-label="
            item.favorite ? 'Remover favorito' : 'Favoritar consulta'
          "
          @click="emit('toggle-favorite', item.id)"
        >
          {{ item.favorite ? '★' : '☆' }}
        </button>
        <button
          type="button"
          aria-label="Remover consulta do histórico"
          @click="emit('remove-history', item.id)"
        >
          ×
        </button>
      </div>
    </div>
    <textarea
      id="database-query"
      :value="query"
      maxlength="4000"
      rows="3"
      spellcheck="false"
      @input="onQueryInput"
      @keydown.ctrl.enter.prevent="emit('run')"
      @keydown.meta.enter.prevent="emit('run')"
    />
    <div class="database-explorer-query-actions">
      <button type="button" :disabled="loading" @click="emit('reset')">
        Limpar consulta
      </button>
      <button
        type="button"
        class="database-primary-button"
        :disabled="loading"
        @click="emit('run')"
      >
        {{ loading ? 'Consultando…' : 'Executar leitura' }}
      </button>
    </div>
  </div>
</template>
