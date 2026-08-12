<script setup lang="ts">
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  DocumentTextIcon,
  ShareIcon,
  TrashIcon,
  XCircleIcon,
} from '@heroicons/vue/24/outline';
import { computed } from 'vue';

import type {
  GitMutationHistoryEvent,
  Project,
} from '@dev-dashboard/contracts';
import { findGitMutationCatalogEntry } from '@dev-dashboard/contracts';

import { useProjectGitMutationHistoryPanel } from '../composables/useProjectGitMutationHistoryPanel';
import Card from './Card.vue';
import StatusBadge from './StatusBadge.vue';
import type { StatusBadgeTone } from './status-badge-types';

const props = defineProps<{ project: Project }>();

const {
  page,
  currentPage,
  loading,
  clearing,
  errorMessage,
  refresh,
  clearHistory,
  goToPage,
} = useProjectGitMutationHistoryPanel(() => props.project);

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
  return (
    findGitMutationCatalogEntry(event.operationId)?.label ?? event.operationId
  );
}

function isPullOperation(event: GitMutationHistoryEvent): boolean {
  return event.operationId === 'pull' || event.operationId.startsWith('sync-');
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
}

const events = computed(() => page.value?.events ?? []);
const hasEvents = computed(() => events.value.length > 0);
const successCount = computed(
  () => events.value.filter((event) => event.result === 'succeeded').length,
);
const failureCount = computed(
  () => events.value.filter((event) => event.result === 'failed').length,
);
const totalPages = computed(() => page.value?.totalPages ?? 1);
const rangeStart = computed(() => {
  if (!page.value || page.value.total === 0) return 0;
  return (page.value.page - 1) * page.value.pageSize + 1;
});
const rangeEnd = computed(() => {
  if (!page.value) return 0;
  return Math.min(page.value.page * page.value.pageSize, page.value.total);
});

const pageWindow = computed<Array<number | 'gap'>>(() => {
  const total = totalPages.value;
  const active = currentPage.value;

  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, total, active - 1, active, active + 1]);
  const visible = [...pages]
    .filter((target) => target >= 1 && target <= total)
    .sort((a, b) => a - b);
  const result: Array<number | 'gap'> = [];

  visible.forEach((target, index) => {
    const previous = visible[index - 1];
    if (previous && target - previous > 1) result.push('gap');
    result.push(target);
  });

  return result;
});
</script>

<template>
  <Card class="git-mutation-history-page">
    <template #header>
      <h3>Histórico de mutações</h3>
      <p class="git-mutation-history-hint">
        Mostra as tentativas recentes de alterações Git neste projeto. Este não
        é o histórico de commits.
      </p>
    </template>

    <template #actions>
      <div class="git-mutation-actions">
        <button
          v-if="(page?.total ?? 0) > 0"
          type="button"
          class="git-mutation-refresh git-mutation-clear"
          :disabled="loading || clearing"
          @click="clearHistory"
        >
          <TrashIcon aria-hidden="true" />
          {{ clearing ? 'Limpando…' : 'Limpar histórico' }}
        </button>
        <button
          type="button"
          class="git-mutation-refresh"
          :disabled="loading || clearing"
          @click="refresh"
        >
          <ArrowPathIcon :class="{ spinning: loading }" aria-hidden="true" />
          {{ loading ? 'Atualizando…' : 'Atualizar' }}
        </button>
      </div>
    </template>

    <div v-if="errorMessage" class="project-error" role="alert">
      {{ errorMessage }}
    </div>

    <div v-if="loading && !page" class="git-mutation-history-empty">
      <ArrowPathIcon class="spinning" aria-hidden="true" />
      Consultando o histórico…
    </div>

    <div v-else-if="!hasEvents" class="git-mutation-history-empty">
      <DocumentTextIcon aria-hidden="true" />
      <strong>Nenhuma mutação registrada</strong>
      <span
        >As próximas alterações Git realizadas neste projeto aparecerão
        aqui.</span
      >
    </div>

    <template v-else>
      <section class="git-mutation-summary" aria-label="Resumo do histórico">
        <article class="git-mutation-summary-card total">
          <div>
            <span>Total</span>
            <strong>{{ page!.total }}</strong>
          </div>
          <span class="git-mutation-summary-icon" aria-hidden="true">
            <DocumentTextIcon />
          </span>
        </article>

        <article class="git-mutation-summary-card success">
          <span class="git-mutation-summary-icon" aria-hidden="true">
            <CheckCircleIcon />
          </span>
          <div>
            <span>Sucessos</span>
            <small>Nesta página</small>
          </div>
          <strong>{{ successCount }}</strong>
        </article>

        <article class="git-mutation-summary-card failure">
          <span class="git-mutation-summary-icon" aria-hidden="true">
            <XCircleIcon />
          </span>
          <div>
            <span>Falhas</span>
            <small>Nesta página</small>
          </div>
          <strong>{{ failureCount }}</strong>
        </article>
      </section>

      <section
        class="git-mutation-list"
        aria-label="Eventos do histórico de mutações"
      >
        <header class="git-mutation-list-head" aria-hidden="true">
          <span>Operação</span>
          <span>Detalhes</span>
          <span>Data e hora</span>
        </header>

        <ul>
          <li v-for="event in events" :key="event.id" class="git-mutation-row">
            <div class="git-mutation-operation">
              <span class="git-mutation-operation-icon" aria-hidden="true">
                <ArrowDownTrayIcon v-if="isPullOperation(event)" />
                <ShareIcon v-else />
              </span>
              <strong>{{ operationLabel(event) }}</strong>
            </div>

            <div class="git-mutation-details">
              <StatusBadge :tone="riskTones[event.risk] ?? 'neutral'" size="sm">
                {{ riskLabels[event.risk] ?? event.risk }}
              </StatusBadge>
              <StatusBadge
                :tone="event.result === 'succeeded' ? 'success' : 'danger'"
                size="sm"
              >
                <CheckCircleIcon
                  v-if="event.result === 'succeeded'"
                  aria-hidden="true"
                />
                <XCircleIcon v-else aria-hidden="true" />
                {{ event.result === 'succeeded' ? 'Sucesso' : 'Falha' }}
              </StatusBadge>
              <code v-if="event.errorCode">{{ event.errorCode }}</code>
            </div>

            <time class="git-mutation-date" :datetime="event.occurredAt">
              <ClockIcon aria-hidden="true" />
              {{ formatDate(event.occurredAt) }}
            </time>
          </li>
        </ul>
      </section>

      <footer class="git-mutation-footer">
        <span>
          Mostrando {{ rangeStart }} a {{ rangeEnd }} de
          {{ page!.total }} registro{{ page!.total === 1 ? '' : 's' }}
        </span>

        <nav
          v-if="page!.totalPages > 1"
          aria-label="Paginação do histórico de mutações"
        >
          <button
            type="button"
            class="git-mutation-page-direction"
            :disabled="currentPage <= 1 || loading"
            @click="goToPage(currentPage - 1)"
          >
            <ChevronLeftIcon aria-hidden="true" />
            Anterior
          </button>

          <template
            v-for="(target, index) in pageWindow"
            :key="`${target}-${index}`"
          >
            <span
              v-if="target === 'gap'"
              class="git-mutation-page-gap"
              aria-hidden="true"
              >…</span
            >
            <button
              v-else
              type="button"
              class="git-mutation-page-number"
              :class="{ active: target === currentPage }"
              :aria-current="target === currentPage ? 'page' : undefined"
              :disabled="loading"
              @click="goToPage(target)"
            >
              {{ target }}
            </button>
          </template>

          <button
            type="button"
            class="git-mutation-page-direction"
            :disabled="currentPage >= page!.totalPages || loading"
            @click="goToPage(currentPage + 1)"
          >
            Próxima
            <ChevronRightIcon aria-hidden="true" />
          </button>
        </nav>

        <button
          type="button"
          class="git-mutation-refresh git-mutation-refresh-footer"
          :disabled="loading || clearing"
          @click="refresh"
        >
          <ArrowPathIcon :class="{ spinning: loading }" aria-hidden="true" />
          {{ loading ? 'Atualizando…' : 'Atualizar' }}
        </button>
      </footer>
    </template>
  </Card>
</template>

<style scoped>
.git-mutation-history-page {
  min-width: 0;
}

.git-mutation-history-page :deep(.dd-card-header) {
  align-items: center;
}

.git-mutation-history-page h3 {
  margin: 0 0 4px;
}

.git-mutation-history-hint {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.git-mutation-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.git-mutation-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 36px;
  padding: 7px 12px;
  border: 1px solid var(--border);
  background: var(--surface-1);
  color: var(--text-muted);
  font-family: inherit;
  font-size: var(--font-sm);
  font-weight: var(--font-weight-strong);
  cursor: pointer;
}

.git-mutation-refresh:hover:not(:disabled) {
  border-color: var(--border-strong);
  color: var(--text);
}

.git-mutation-clear {
  color: var(--danger-text);
}

.git-mutation-clear:hover:not(:disabled) {
  border-color: var(--danger-text);
  background: var(--danger-surface);
  color: var(--danger-text);
}

.git-mutation-refresh:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.git-mutation-refresh svg {
  width: 16px;
  height: 16px;
}

.git-mutation-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.git-mutation-summary-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 72px;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border);
  background: var(--surface-2);
}

.git-mutation-summary-card.total {
  justify-content: space-between;
  border-color: var(--info-surface);
  background: color-mix(in srgb, var(--info-surface) 46%, var(--surface-1));
}

.git-mutation-summary-card.success {
  border-color: var(--success-surface);
  background: color-mix(in srgb, var(--success-surface) 46%, var(--surface-1));
}

.git-mutation-summary-card.failure {
  border-color: var(--danger-surface);
  background: color-mix(in srgb, var(--danger-surface) 46%, var(--surface-1));
}

.git-mutation-summary-card div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.git-mutation-summary-card span {
  color: var(--text-muted);
  font-size: var(--font-sm);
  font-weight: var(--font-weight-strong);
}

.git-mutation-summary-card small {
  color: var(--text-dim);
  font-size: var(--font-xs);
}

.git-mutation-summary-card strong {
  margin-left: auto;
  color: var(--text);
  font-size: 1.2rem;
  font-variant-numeric: tabular-nums;
}

.git-mutation-summary-card.success > strong {
  color: var(--success-text);
}

.git-mutation-summary-card.failure > strong {
  color: var(--danger-text);
}

.git-mutation-summary-icon {
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  background: var(--surface-1);
}

.git-mutation-summary-icon svg {
  width: 20px;
  height: 20px;
}

.total .git-mutation-summary-icon {
  color: var(--info-text);
}

.success .git-mutation-summary-icon {
  color: var(--success-text);
}

.failure .git-mutation-summary-icon {
  color: var(--danger-text);
}

.git-mutation-list {
  min-width: 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.git-mutation-list-head,
.git-mutation-row {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(420px, 2.4fr) minmax(
      210px,
      0.9fr
    );
  align-items: center;
  gap: var(--space-4);
}

.git-mutation-list-head {
  padding: 10px var(--space-3);
  background: var(--surface-2);
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.git-mutation-list ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.git-mutation-row {
  min-height: 56px;
  padding: 9px var(--space-3);
  border-top: 1px solid var(--border);
}

.git-mutation-row:first-child {
  border-top: 0;
}

.git-mutation-row:hover {
  background: var(--surface-2);
}

.git-mutation-operation,
.git-mutation-details,
.git-mutation-date {
  display: flex;
  align-items: center;
  min-width: 0;
}

.git-mutation-operation {
  gap: var(--space-3);
}

.git-mutation-operation strong {
  min-width: 0;
  overflow: hidden;
  color: var(--text);
  font-size: var(--font-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-mutation-operation-icon {
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  color: var(--accent);
}

.git-mutation-operation-icon svg {
  width: 17px;
  height: 17px;
}

.git-mutation-details {
  flex-wrap: wrap;
  gap: var(--space-2);
}

.git-mutation-details :deep(.dd-status-badge) {
  gap: 4px;
}

.git-mutation-details :deep(.dd-status-badge svg) {
  width: 13px;
  height: 13px;
}

.git-mutation-details code {
  color: var(--danger-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: var(--font-xs);
  overflow-wrap: anywhere;
}

.git-mutation-date {
  justify-content: flex-start;
  gap: 7px;
  color: var(--text-dim);
  font-size: var(--font-sm);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.git-mutation-date svg {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
}

.git-mutation-footer {
  display: grid;
  grid-template-columns: minmax(210px, 1fr) auto minmax(210px, 1fr);
  align-items: center;
  gap: var(--space-3);
  padding-top: var(--space-4);
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.git-mutation-footer > span {
  font-variant-numeric: tabular-nums;
}

.git-mutation-footer nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.git-mutation-footer nav button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 34px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-muted);
  font-family: inherit;
  font-size: var(--font-sm);
  font-weight: var(--font-weight-strong);
  cursor: pointer;
}

.git-mutation-footer nav button:hover:not(:disabled) {
  border-color: var(--border-strong);
  color: var(--text);
}

.git-mutation-footer nav button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.git-mutation-footer nav button.active {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--surface-1);
}

.git-mutation-footer nav svg {
  width: 14px;
  height: 14px;
}

.git-mutation-page-number {
  min-width: 34px;
}

.git-mutation-page-gap {
  padding: 0 4px;
  color: var(--text-dim);
}

.git-mutation-refresh-footer {
  justify-self: end;
}

.git-mutation-history-empty {
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: var(--space-6);
  border: 1px dashed var(--border);
  background: var(--surface-2);
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

@media (max-width: 1080px) {
  .git-mutation-list-head,
  .git-mutation-row {
    grid-template-columns: minmax(190px, 1fr) minmax(320px, 1.8fr) minmax(
        190px,
        0.9fr
      );
  }

  .git-mutation-footer {
    grid-template-columns: 1fr auto;
  }

  .git-mutation-footer nav {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}

@media (max-width: 820px) {
  .git-mutation-summary {
    grid-template-columns: 1fr;
    gap: var(--space-2);
  }

  .git-mutation-list-head {
    display: none;
  }

  .git-mutation-row {
    grid-template-columns: 1fr auto;
    gap: var(--space-2) var(--space-3);
    padding: var(--space-3);
  }

  .git-mutation-details {
    grid-column: 1 / -1;
    padding-left: 44px;
  }

  .git-mutation-date {
    justify-self: end;
  }
}

@media (max-width: 620px) {
  .git-mutation-history-page :deep(.dd-card-header) {
    align-items: flex-start;
  }

  .git-mutation-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .git-mutation-footer {
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }

  .git-mutation-footer nav {
    order: 1;
    flex-wrap: wrap;
  }

  .git-mutation-refresh-footer {
    align-self: flex-end;
  }

  .git-mutation-page-direction {
    font-size: 0;
  }

  .git-mutation-page-direction svg {
    width: 16px;
    height: 16px;
  }
}

@media (max-width: 520px) {
  .git-mutation-row {
    grid-template-columns: 1fr;
  }

  .git-mutation-date {
    justify-self: start;
    padding-left: 44px;
  }
}
</style>
