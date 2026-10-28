<script setup lang="ts">
import { computed } from 'vue';

import type { DatabaseQueryHistoryItem } from '../../composables/useDatabaseQueryHistory';

const props = defineProps<{
  query: string;
  loading: boolean;
  historyOpen: boolean;
  historyCount: number;
  recentQueries: DatabaseQueryHistoryItem[];
  savedQueries: DatabaseQueryHistoryItem[];
  redis: boolean;
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

const label = computed(() =>
  props.redis ? 'Comando Redis de leitura' : 'Consulta SELECT/WITH',
);

function isSaved(item: DatabaseQueryHistoryItem): boolean {
  return props.savedQueries.some(
    (saved) =>
      saved.query === item.query &&
      saved.driver === item.driver &&
      saved.database === item.database,
  );
}

function onQueryInput(event: Event): void {
  emit('update:query', (event.target as HTMLTextAreaElement).value);
}
</script>

<template>
  <section class="database-editor">
    <div class="database-editor-bar">
      <label for="database-query">{{ label }}</label>
      <span class="database-editor-badge">Somente leitura</span>
      <span class="database-editor-hint">Ctrl/Cmd + Enter para executar</span>
      <div class="database-editor-actions">
        <button type="button" @click="emit('toggle-history')">Histórico</button>
        <button type="button" :disabled="loading" @click="emit('reset')">
          Limpar
        </button>
        <button
          type="button"
          class="database-editor-run"
          :disabled="loading"
          @click="emit('run')"
        >
          {{ loading ? 'Executando…' : 'Executar' }}
        </button>
      </div>
    </div>

    <div v-if="historyOpen" class="database-editor-history">
      <div class="database-editor-history-title">
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
      <div v-for="item in recentQueries" :key="item.id" class="history-item">
        <button
          type="button"
          class="history-query"
          @click="emit('restore-query', item)"
        >
          <code>{{ item.query }}</code>
        </button>
        <button
          type="button"
          :aria-label="
            isSaved(item)
              ? 'Remover consulta salva'
              : 'Salvar consulta permanentemente'
          "
          @click="emit('toggle-favorite', item.id)"
        >
          {{ isSaved(item) ? '★' : '☆' }}
        </button>
        <button
          type="button"
          aria-label="Remover consulta do histórico"
          @click="emit('remove-history', item.id)"
        >
          ×
        </button>
      </div>
      <div class="database-editor-history-title">
        <span>Consultas salvas explicitamente</span>
      </div>
      <p>
        Consultas salvas permanecem neste navegador e podem conter dados
        sensíveis. Salve somente se desejar essa persistência.
      </p>
      <div v-for="item in savedQueries" :key="item.id" class="history-item">
        <button
          type="button"
          class="history-query"
          @click="emit('restore-query', item)"
        >
          <code>{{ item.query }}</code>
        </button>
        <button
          type="button"
          aria-label="Remover consulta salva"
          @click="emit('toggle-favorite', item.id)"
        >
          ★
        </button>
      </div>
    </div>

    <textarea
      id="database-query"
      :value="query"
      maxlength="4000"
      rows="5"
      spellcheck="false"
      @input="onQueryInput"
      @keydown.ctrl.enter.prevent="emit('run')"
      @keydown.meta.enter.prevent="emit('run')"
    />
  </section>
</template>

<style scoped>
.database-editor {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-1);
}

.database-editor-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}

label {
  color: var(--text);
  font-size: 13px;
  font-weight: 650;
}

.database-editor-badge {
  padding: 2px 10px;
  border-radius: 999px;
  color: var(--accent);
  background: var(--accent-soft);
  font-size: 12px;
  font-weight: 650;
}

.database-editor-hint {
  color: var(--text-dim);
  font-size: 12px;
}

.database-editor-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.database-editor-actions button {
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  color: var(--text);
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.database-editor-actions button:hover:not(:disabled) {
  background: var(--surface-3);
}

.database-editor-actions .database-editor-run {
  border-color: var(--accent-strong);
  color: #fff;
  background: var(--accent-strong);
}

.database-editor-actions .database-editor-run:hover:not(:disabled) {
  background: var(--accent);
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

textarea {
  display: block;
  width: 100%;
  min-height: 120px;
  padding: 14px 16px;
  border: 0;
  color: var(--text);
  background: transparent;
  font-family: var(--font-family-mono);
  font-size: 13px;
  line-height: 1.7;
  resize: vertical;
  outline: 0;
}

textarea:focus-visible {
  box-shadow: inset 0 0 0 2px var(--accent);
}

.database-editor-history {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}

.database-editor-history p {
  margin: 0;
  color: var(--text-dim);
  font-size: 12px;
}

.database-editor-history-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 650;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.history-item button {
  border: 0;
  color: var(--text-muted);
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.history-query {
  min-width: 0;
  flex: 1;
  padding: 6px 8px;
  border-radius: 8px;
  text-align: left;
}

.history-query:hover {
  background: var(--surface-2);
}

.history-query code {
  display: block;
  overflow: hidden;
  font-family: var(--font-family-mono);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
