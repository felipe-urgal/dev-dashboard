<script setup lang="ts">
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  ListBulletIcon,
  TableCellsIcon,
  XCircleIcon,
} from '@heroicons/vue/24/outline';
import { computed, ref } from 'vue';

import type { GitMutationHistoryEvent, Project } from '@dev-dashboard/contracts';
import { findGitMutationCatalogEntry } from '@dev-dashboard/contracts';

import { useProjectGitMutationHistoryPanel } from '../composables/useProjectGitMutationHistoryPanel';
import Card from './Card.vue';
import StatusBadge from './StatusBadge.vue';
import type { StatusBadgeTone } from './status-badge-types';

const props = defineProps<{ project: Project }>();

const { page, currentPage, loading, errorMessage, refresh, goToPage } =
  useProjectGitMutationHistoryPanel(() => props.project);

const selectedPrototype = ref<1 | 2 | 3>(1);

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

function operationDescription(event: GitMutationHistoryEvent): string {
  return (
    findGitMutationCatalogEntry(event.operationId)?.description ??
    'Operação Git executada no projeto.'
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
}

function formatDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

const hasEvents = computed(() => (page.value?.events.length ?? 0) > 0);
const successCount = computed(
  () => page.value?.events.filter((event) => event.result === 'succeeded').length ?? 0,
);
const failureCount = computed(
  () => page.value?.events.filter((event) => event.result === 'failed').length ?? 0,
);
</script>

<template>
  <section class="git-mutation-history-page">
    <nav class="git-mutation-prototype-switch" aria-label="Protótipos do histórico de mutações">
      <span>Escolha uma versão para avaliar</span>
      <div role="tablist" aria-label="Versões do histórico de mutações">
        <button
          type="button"
          role="tab"
          :aria-selected="selectedPrototype === 1"
          :class="{ active: selectedPrototype === 1 }"
          @click="selectedPrototype = 1"
        >
          <ListBulletIcon aria-hidden="true" />
          1. Lista compacta
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="selectedPrototype === 2"
          :class="{ active: selectedPrototype === 2 }"
          @click="selectedPrototype = 2"
        >
          <ClockIcon aria-hidden="true" />
          2. Linha do tempo
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="selectedPrototype === 3"
          :class="{ active: selectedPrototype === 3 }"
          @click="selectedPrototype = 3"
        >
          <TableCellsIcon aria-hidden="true" />
          3. Tabela
        </button>
      </div>
    </nav>

    <div v-if="errorMessage" class="project-error" role="alert">
      {{ errorMessage }}
    </div>

    <div v-if="loading && !page" class="git-mutation-history-empty">
      <ArrowPathIcon class="spinning" aria-hidden="true" />
      <strong>Consultando o histórico…</strong>
    </div>

    <div v-else-if="!hasEvents" class="git-mutation-history-empty">
      <ClockIcon aria-hidden="true" />
      <strong>Nenhuma mutação registrada</strong>
      <span>As próximas alterações Git deste projeto aparecerão aqui.</span>
    </div>

    <template v-else>
      <Card
        v-if="selectedPrototype === 1"
        class="git-mutation-prototype git-mutation-prototype-list"
      >
        <template #header>
          <div class="git-mutation-heading">
            <h3>Histórico de mutações</h3>
            <p>
              {{ page!.total }} tentativa{{ page!.total === 1 ? '' : 's' }} registrada{{
                page!.total === 1 ? '' : 's'
              }}
            </p>
          </div>
        </template>
        <template #actions>
          <button
            type="button"
            class="git-mutation-refresh"
            :disabled="loading"
            @click="refresh"
          >
            <ArrowPathIcon :class="{ spinning: loading }" aria-hidden="true" />
            {{ loading ? 'Atualizando…' : 'Atualizar' }}
          </button>
        </template>

        <div class="git-mutation-summary" aria-label="Resumo da página atual">
          <span>
            <CheckCircleIcon aria-hidden="true" />
            {{ successCount }} sucesso{{ successCount === 1 ? '' : 's' }}
          </span>
          <span>
            <XCircleIcon aria-hidden="true" />
            {{ failureCount }} falha{{ failureCount === 1 ? '' : 's' }}
          </span>
        </div>

        <ul class="git-mutation-compact-list">
          <li
            v-for="event in page!.events"
            :key="event.id"
            :class="{ failed: event.result === 'failed' }"
          >
            <span class="git-mutation-result-icon" aria-hidden="true">
              <CheckCircleIcon v-if="event.result === 'succeeded'" />
              <XCircleIcon v-else />
            </span>
            <div class="git-mutation-compact-content">
              <div>
                <strong>{{ operationLabel(event) }}</strong>
                <span>{{ formatDate(event.occurredAt) }}</span>
              </div>
              <code v-if="event.errorCode">{{ event.errorCode }}</code>
            </div>
            <StatusBadge :tone="riskTones[event.risk] ?? 'neutral'" size="sm">
              {{ riskLabels[event.risk] ?? event.risk }}
            </StatusBadge>
          </li>
        </ul>
      </Card>

      <Card
        v-else-if="selectedPrototype === 2"
        class="git-mutation-prototype git-mutation-prototype-timeline"
      >
        <template #header>
          <div class="git-mutation-heading">
            <h3>Atividade Git</h3>
            <p>Ordem cronológica das últimas alterações executadas.</p>
          </div>
        </template>
        <template #actions>
          <button
            type="button"
            class="git-mutation-refresh git-mutation-refresh-icon"
            :disabled="loading"
            aria-label="Atualizar histórico"
            @click="refresh"
          >
            <ArrowPathIcon :class="{ spinning: loading }" aria-hidden="true" />
          </button>
        </template>

        <ol class="git-mutation-timeline">
          <li v-for="event in page!.events" :key="event.id">
            <div class="git-mutation-timeline-time">
              <strong>{{ formatTime(event.occurredAt) }}</strong>
              <span>{{ formatDay(event.occurredAt) }}</span>
            </div>
            <span
              class="git-mutation-timeline-marker"
              :class="event.result === 'succeeded' ? 'succeeded' : 'failed'"
              aria-hidden="true"
            >
              <CheckCircleIcon v-if="event.result === 'succeeded'" />
              <XCircleIcon v-else />
            </span>
            <article :class="{ failed: event.result === 'failed' }">
              <header>
                <strong>{{ operationLabel(event) }}</strong>
                <StatusBadge
                  :tone="event.result === 'succeeded' ? 'success' : 'danger'"
                  size="sm"
                >
                  {{ event.result === 'succeeded' ? 'Sucesso' : 'Falha' }}
                </StatusBadge>
              </header>
              <p>{{ operationDescription(event) }}</p>
              <footer>
                <span>{{ riskLabels[event.risk] ?? event.risk }}</span>
                <code v-if="event.errorCode">{{ event.errorCode }}</code>
              </footer>
            </article>
          </li>
        </ol>
      </Card>

      <Card
        v-else
        class="git-mutation-prototype git-mutation-prototype-table"
        :padded="false"
      >
        <header class="git-mutation-table-head">
          <div class="git-mutation-heading">
            <h3>Histórico de mutações</h3>
            <p>Visão operacional para comparar rapidamente resultado, risco e horário.</p>
          </div>
          <button
            type="button"
            class="git-mutation-refresh"
            :disabled="loading"
            @click="refresh"
          >
            <ArrowPathIcon :class="{ spinning: loading }" aria-hidden="true" />
            {{ loading ? 'Atualizando…' : 'Atualizar' }}
          </button>
        </header>

        <div class="git-mutation-table-wrapper">
          <table class="git-mutation-table">
            <thead>
              <tr>
                <th scope="col">Data e hora</th>
                <th scope="col">Operação</th>
                <th scope="col">Risco</th>
                <th scope="col">Resultado</th>
                <th scope="col">Detalhe</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="event in page!.events" :key="event.id">
                <td class="git-mutation-table-date">{{ formatDate(event.occurredAt) }}</td>
                <td><strong>{{ operationLabel(event) }}</strong></td>
                <td>
                  <StatusBadge :tone="riskTones[event.risk] ?? 'neutral'" size="sm">
                    {{ riskLabels[event.risk] ?? event.risk }}
                  </StatusBadge>
                </td>
                <td>
                  <span class="git-mutation-table-result" :class="event.result">
                    <CheckCircleIcon
                      v-if="event.result === 'succeeded'"
                      aria-hidden="true"
                    />
                    <XCircleIcon v-else aria-hidden="true" />
                    {{ event.result === 'succeeded' ? 'Sucesso' : 'Falha' }}
                  </span>
                </td>
                <td>
                  <code v-if="event.errorCode">{{ event.errorCode }}</code>
                  <span v-else>—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <nav
        v-if="page!.totalPages > 1"
        class="git-mutation-pagination"
        aria-label="Paginação do histórico de mutações"
      >
        <span>Página {{ page!.page }} de {{ page!.totalPages }}</span>
        <div>
          <button
            type="button"
            :disabled="currentPage <= 1 || loading"
            @click="goToPage(currentPage - 1)"
          >
            Anterior
          </button>
          <button
            type="button"
            :disabled="currentPage >= page!.totalPages || loading"
            @click="goToPage(currentPage + 1)"
          >
            Próxima
          </button>
        </div>
      </nav>
    </template>
  </section>
</template>

<style scoped>
.git-mutation-history-page {
  display: grid;
  min-width: 0;
  gap: var(--space-4);
  color: var(--text);
  font-family: var(--font-family);
}

.git-mutation-prototype-switch {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
}

.git-mutation-prototype-switch > span {
  color: var(--text-muted);
  font-size: var(--font-sm);
  font-weight: var(--font-weight-strong);
}

.git-mutation-prototype-switch div {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.git-mutation-prototype-switch button,
.git-mutation-refresh,
.git-mutation-pagination button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 11px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-muted);
  font-size: var(--font-sm);
  font-weight: var(--font-weight-strong);
  cursor: pointer;
}

.git-mutation-prototype-switch button:hover:not(:disabled),
.git-mutation-refresh:hover:not(:disabled),
.git-mutation-pagination button:hover:not(:disabled) {
  border-color: var(--border-strong);
  color: var(--text);
}

.git-mutation-prototype-switch button.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}

.git-mutation-prototype-switch svg,
.git-mutation-refresh svg {
  width: 15px;
  height: 15px;
}

.git-mutation-heading h3 {
  margin: 0;
  font-size: 1rem;
}

.git-mutation-heading p {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.git-mutation-refresh-icon {
  width: 34px;
  height: 34px;
  padding: 0;
}

.git-mutation-summary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.git-mutation-summary span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.git-mutation-summary svg {
  width: 16px;
  height: 16px;
}

.git-mutation-summary span:first-child svg {
  color: var(--success-text);
}

.git-mutation-summary span:last-child svg {
  color: var(--danger-text);
}

.git-mutation-compact-list,
.git-mutation-timeline {
  margin: 0;
  padding: 0;
  list-style: none;
}

.git-mutation-compact-list {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.git-mutation-compact-list li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  min-height: 56px;
  padding: 9px var(--space-3);
  border-bottom: 1px solid var(--border);
  background: var(--surface-1);
}

.git-mutation-compact-list li:last-child {
  border-bottom: 0;
}

.git-mutation-compact-list li:hover {
  background: var(--surface-2);
}

.git-mutation-compact-list li.failed {
  box-shadow: inset 3px 0 0 var(--danger-text);
}

.git-mutation-result-icon {
  display: grid;
  place-items: center;
}

.git-mutation-result-icon svg {
  width: 20px;
  height: 20px;
  color: var(--success-text);
}

.failed .git-mutation-result-icon svg {
  color: var(--danger-text);
}

.git-mutation-compact-content {
  min-width: 0;
}

.git-mutation-compact-content > div {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px var(--space-3);
}

.git-mutation-compact-content strong {
  font-size: var(--font-sm);
}

.git-mutation-compact-content span,
.git-mutation-compact-content code {
  color: var(--text-dim);
  font-size: var(--font-xs);
}

.git-mutation-compact-content code {
  display: inline-block;
  margin-top: 3px;
  color: var(--danger-text);
}

.git-mutation-timeline {
  display: grid;
  gap: 0;
}

.git-mutation-timeline li {
  display: grid;
  grid-template-columns: 120px 30px minmax(0, 1fr);
  align-items: stretch;
}

.git-mutation-timeline-time {
  padding: 14px var(--space-3) 14px 0;
  text-align: right;
}

.git-mutation-timeline-time strong,
.git-mutation-timeline-time span {
  display: block;
  font-variant-numeric: tabular-nums;
}

.git-mutation-timeline-time strong {
  font-size: var(--font-sm);
}

.git-mutation-timeline-time span {
  margin-top: 2px;
  color: var(--text-dim);
  font-size: var(--font-xs);
}

.git-mutation-timeline-marker {
  position: relative;
  display: grid;
  place-items: start center;
  padding-top: 14px;
}

.git-mutation-timeline-marker::after {
  position: absolute;
  top: 35px;
  bottom: 0;
  width: 1px;
  background: var(--border);
  content: '';
}

.git-mutation-timeline li:last-child .git-mutation-timeline-marker::after {
  display: none;
}

.git-mutation-timeline-marker svg {
  position: relative;
  z-index: 1;
  width: 20px;
  height: 20px;
  background: var(--surface-1);
}

.git-mutation-timeline-marker.succeeded svg {
  color: var(--success-text);
}

.git-mutation-timeline-marker.failed svg {
  color: var(--danger-text);
}

.git-mutation-timeline article {
  margin: 6px 0 var(--space-3) var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
}

.git-mutation-timeline article.failed {
  border-color: var(--danger-text);
  background: var(--danger-surface);
}

.git-mutation-timeline article header,
.git-mutation-timeline article footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.git-mutation-timeline article p {
  margin: 7px 0;
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.git-mutation-timeline article footer {
  justify-content: flex-start;
  color: var(--text-dim);
  font-size: var(--font-xs);
}

.git-mutation-timeline article footer code {
  color: var(--danger-text);
}

.git-mutation-table-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border);
}

.git-mutation-table-wrapper {
  min-width: 0;
  overflow-x: auto;
}

.git-mutation-table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
}

.git-mutation-table th,
.git-mutation-table td {
  padding: 10px var(--space-4);
  border-bottom: 1px solid var(--border);
  font-size: var(--font-sm);
  text-align: left;
  vertical-align: middle;
}

.git-mutation-table th {
  background: var(--surface-2);
  color: var(--text-muted);
  font-weight: var(--font-weight-strong);
}

.git-mutation-table tbody tr:last-child td {
  border-bottom: 0;
}

.git-mutation-table tbody tr:hover td {
  background: var(--surface-2);
}

.git-mutation-table-date {
  width: 165px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.git-mutation-table-result {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: var(--font-weight-strong);
}

.git-mutation-table-result svg {
  width: 17px;
  height: 17px;
}

.git-mutation-table-result.succeeded {
  color: var(--success-text);
}

.git-mutation-table-result.failed {
  color: var(--danger-text);
}

.git-mutation-table code {
  color: var(--danger-text);
}

.git-mutation-table td:last-child span {
  color: var(--text-dim);
}

.git-mutation-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.git-mutation-pagination div {
  display: flex;
  gap: 4px;
}

.git-mutation-pagination button:disabled,
.git-mutation-refresh:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.git-mutation-history-empty {
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: var(--space-6);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
  color: var(--text-muted);
  font-size: var(--font-sm);
  text-align: center;
}

.git-mutation-history-empty strong {
  color: var(--text);
}

.git-mutation-history-empty svg {
  width: 22px;
  height: 22px;
}

.spinning {
  animation: git-mutation-spin 1s linear infinite;
}

@keyframes git-mutation-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinning {
    animation: none;
  }
}

@media (max-width: 760px) {
  .git-mutation-prototype-switch {
    align-items: stretch;
  }

  .git-mutation-prototype-switch > span {
    width: 100%;
  }

  .git-mutation-prototype-switch div {
    display: grid;
    grid-template-columns: 1fr;
    width: 100%;
  }

  .git-mutation-prototype-switch button {
    justify-content: flex-start;
  }

  .git-mutation-compact-list li {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .git-mutation-compact-list :deep(.dd-status-badge) {
    grid-column: 2;
    justify-self: start;
  }

  .git-mutation-timeline li {
    grid-template-columns: 24px minmax(0, 1fr);
  }

  .git-mutation-timeline-time {
    grid-column: 2;
    padding: 8px 0 0 var(--space-2);
    text-align: left;
  }

  .git-mutation-timeline-marker {
    grid-column: 1;
    grid-row: 1 / span 2;
    padding-top: 10px;
  }

  .git-mutation-timeline article {
    grid-column: 2;
    margin-left: var(--space-2);
  }

  .git-mutation-table-head {
    flex-direction: column;
    padding: var(--space-4);
  }
}
</style>
