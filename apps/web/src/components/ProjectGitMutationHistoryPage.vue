<script setup lang="ts">
import { computed } from 'vue';

import type { GitMutationHistoryEvent, Project } from '@dev-dashboard/contracts';
import { findGitMutationCatalogEntry } from '@dev-dashboard/contracts';

import { useProjectGitMutationHistoryPanel } from '../composables/useProjectGitMutationHistoryPanel';
import Card from './Card.vue';
import StatusBadge from './StatusBadge.vue';
import type { StatusBadgeTone } from './status-badge-types';

const props = defineProps<{ project: Project }>();

const { page, currentPage, loading, errorMessage, refresh, goToPage } =
  useProjectGitMutationHistoryPanel(() => props.project);

const riskLabels: Record<string, string> = {
  'read-only': 'Leitura',
  'write-safe': 'Alteração local',
  'write-remote': 'Alteração remota',
  destructive: 'Destrutiva',
};

const riskTones: Record<string, StatusBadgeTone> = {
  'read-only': 'neutral',
  'write-safe': 'info',
  'write-remote': 'warning',
  destructive: 'danger',
};

function operationLabel(event: GitMutationHistoryEvent): string {
  return findGitMutationCatalogEntry(event.operationId)?.label ?? event.operationId;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }).format(date);
}

const hasEvents = computed(() => (page.value?.events.length ?? 0) > 0);
</script>

<template>
  <Card class="git-mutation-history-page">
    <template #header>
      <h3>Histórico de mutações</h3>
      <p class="git-mutation-history-hint">
        Resultado das últimas tentativas de alterações Git deste projeto — não é o histórico de
        commits.
      </p>
    </template>

    <div v-if="errorMessage" class="project-error" role="alert">
      {{ errorMessage }}
    </div>

    <div v-if="loading && !page" class="git-mutation-history-empty">
      Consultando o histórico…
    </div>

    <div v-else-if="!hasEvents" class="git-mutation-history-empty">
      Nenhuma mutação registrada ainda para este projeto.
    </div>

    <template v-else>
      <ul class="git-mutation-history-list">
        <li v-for="event in page!.events" :key="event.id" class="git-mutation-history-item">
          <div class="git-mutation-history-item-main">
            <span class="git-mutation-history-operation">{{ operationLabel(event) }}</span>
            <StatusBadge :tone="riskTones[event.risk] ?? 'neutral'" size="sm">
              {{ riskLabels[event.risk] ?? event.risk }}
            </StatusBadge>
            <StatusBadge :tone="event.result === 'succeeded' ? 'success' : 'danger'" size="sm">
              {{ event.result === 'succeeded' ? 'Sucesso' : 'Falha' }}
            </StatusBadge>
          </div>
          <div class="git-mutation-history-item-meta">
            <span>{{ formatDate(event.occurredAt) }}</span>
            <span v-if="event.errorCode">{{ event.errorCode }}</span>
          </div>
        </li>
      </ul>

      <div v-if="page!.totalPages > 1" class="git-mutation-history-pagination">
        <button
          type="button"
          :disabled="currentPage <= 1 || loading"
          @click="goToPage(currentPage - 1)"
        >
          Anterior
        </button>
        <span>Página {{ page!.page }} de {{ page!.totalPages }}</span>
        <button
          type="button"
          :disabled="currentPage >= page!.totalPages || loading"
          @click="goToPage(currentPage + 1)"
        >
          Próxima
        </button>
        <button type="button" class="git-mutation-history-refresh" :disabled="loading" @click="refresh">
          Atualizar
        </button>
      </div>
    </template>
  </Card>
</template>

<style scoped>
.git-mutation-history-hint {
  margin: 0;
  color: var(--color-text-secondary, #666);
  font-size: 0.85rem;
}

.git-mutation-history-empty {
  padding: 1rem 0;
  color: var(--color-text-secondary, #666);
}

.git-mutation-history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.git-mutation-history-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--color-border, #e2e2e2);
}

.git-mutation-history-item:last-child {
  border-bottom: none;
}

.git-mutation-history-item-main {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.git-mutation-history-operation {
  font-weight: var(--font-weight-strong, 600);
}

.git-mutation-history-item-meta {
  display: flex;
  gap: 0.75rem;
  font-size: 0.8rem;
  color: var(--color-text-secondary, #666);
}

.git-mutation-history-pagination {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.75rem;
  font-size: 0.85rem;
}

.git-mutation-history-refresh {
  margin-left: auto;
}
</style>
