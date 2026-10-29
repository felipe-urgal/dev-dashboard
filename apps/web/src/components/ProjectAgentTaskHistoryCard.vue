<script setup lang="ts">
import { ClockIcon } from '@heroicons/vue/24/outline';

import type { AgentTaskRecord } from '../api/agent-runtime';

defineProps<{
  tasks: AgentTaskRecord[];
  selectedTaskId: string;
  showArchived: boolean;
  showAllHistory: boolean;
  historyHasMore: boolean;
  historyLoading: boolean;
  historyLoaded: boolean;
  historyError: string;
}>();

defineEmits<{
  select: [taskId: string];
  expand: [];
  collapse: [];
  'load-more': [];
  'toggle-archived': [];
  retry: [];
}>();

const taskStateSummary = (state: string): string => {
  switch (state) {
    case 'queued':
      return 'Criada';
    case 'running':
      return 'Executando';
    case 'checkpoint':
      return 'Checkpoint';
    case 'review':
      return 'Em review';
    case 'blocked':
      return 'Bloqueada';
    case 'failed':
      return 'Falhou';
    case 'completed':
      return 'Concluída';
    case 'cancelled':
      return 'Cancelada';
    default:
      return state;
  }
};
</script>

<template>
  <section class="agent-card agent-recent-history">
    <div class="agent-section-heading agent-history-heading">
      <div>
        <ClockIcon class="agent-section-icon" aria-hidden="true" />
        <strong>Histórico recente</strong>
      </div>
      <button
        class="agent-history-show-all"
        type="button"
        :disabled="historyLoading"
        @click="$emit('toggle-archived')"
      >
        {{ showArchived ? 'Ocultar arquivadas' : 'Mostrar arquivadas' }}
      </button>
      <button
        v-if="!showAllHistory && (tasks.length > 5 || historyHasMore)"
        class="agent-history-show-all"
        type="button"
        @click="$emit('expand')"
      >
        Ver mais
      </button>
      <button
        v-if="showAllHistory && historyHasMore && !historyError"
        class="agent-history-show-all"
        type="button"
        :disabled="historyLoading"
        @click="$emit('load-more')"
      >
        {{ historyLoading ? 'Carregando...' : 'Carregar mais' }}
      </button>
      <button
        v-if="showAllHistory"
        class="agent-history-show-all"
        type="button"
        @click="$emit('collapse')"
      >
        Ver menos
      </button>
    </div>

    <p v-if="historyLoading && !historyLoaded" class="agent-hint">
      Carregando histórico de tasks...
    </p>
    <p v-else-if="!tasks.length && !historyError" class="agent-hint">
      {{
        historyHasMore
          ? 'Nenhuma task encontrada nesta página. Carregue a próxima.'
          : 'Nenhuma task criada neste projeto.'
      }}
    </p>
    <p v-if="historyError" class="agent-hint" role="alert">
      {{ historyError }}
    </p>
    <button
      v-if="historyError"
      class="agent-history-show-all"
      type="button"
      :disabled="historyLoading"
      @click="$emit('retry')"
    >
      {{
        historyLoaded && historyHasMore
          ? 'Tentar novamente'
          : 'Atualizar histórico'
      }}
    </button>
    <template v-if="tasks.length">
      <button
        v-for="record in showAllHistory ? tasks : tasks.slice(0, 5)"
        :key="record.task.id"
        class="agent-history-item"
        :class="{ 'is-selected': record.task.id === selectedTaskId }"
        type="button"
        @click="$emit('select', record.task.id)"
      >
        <span
          class="agent-history-state"
          :class="'state-' + record.task.state"
          aria-hidden="true"
        />
        <div>
          <strong>{{ record.task.summary }}</strong>
          <small>
            {{ taskStateSummary(record.task.state) }} ·
            {{ new Date(record.task.updatedAt).toLocaleString() }}
            <template v-if="record.task.archivedAt"> · Arquivada </template>
          </small>
        </div>
      </button>
    </template>
  </section>
</template>

<style scoped>
.agent-section-heading {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.agent-section-heading > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.agent-section-heading strong {
  overflow: hidden;
  color: var(--text);
  font-size: var(--font-sm);
  text-overflow: ellipsis;
}

.agent-hint {
  margin: 0;
  color: var(--text-dim);
  font-size: var(--font-xs);
  line-height: 1.45;
}

.agent-section-icon {
  width: 18px;
  height: 18px;
  color: var(--accent);
  font-size: 18px;
}

.agent-history-heading > div {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-history-heading strong {
  font-size: var(--font-sm);
}

.agent-history-show-all {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-muted);
  background: transparent;
  font-size: 12px;
  cursor: pointer;
}

.agent-history-show-all:hover {
  color: var(--text);
  background: var(--surface-2);
}

.agent-history-item {
  display: grid;
  grid-template-columns: 18px 1fr;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-width: 0;
  padding: 8px 0;
  border: 0;
  border-top: 1px solid var(--border);
  color: var(--text);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.agent-history-item:first-of-type {
  border-top: 0;
}

.agent-history-item > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.agent-history-item strong {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-history-item small {
  overflow: hidden;
  color: var(--text-dim);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-history-item.is-selected {
  color: var(--accent);
}

.agent-history-state {
  width: 13px;
  height: 13px;
  border-radius: 999px;
  background: var(--text-dim);
}

.agent-history-state.state-completed {
  background: var(--success-text);
}

.agent-history-state.state-failed,
.agent-history-state.state-cancelled {
  background: var(--danger-text);
}

.agent-history-state.state-review,
.agent-history-state.state-checkpoint,
.agent-history-state.state-blocked {
  background: var(--warning-text);
}

.agent-history-state.state-running {
  background: var(--accent);
}
</style>
