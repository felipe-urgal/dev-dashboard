<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import type { Project } from '@dev-dashboard/contracts';

import {
  fetchMigrationOverview,
  type MigrationOverview,
  type MigrationOverviewStatus,
} from '../api/migrations';
import EmptyState from './EmptyState.vue';
import StatusBadge from './StatusBadge.vue';
import type { StatusBadgeTone } from './status-badge-types';

const props = defineProps<{ project: Project }>();

const loading = ref(false);
const errorMessage = ref('');
const overview = ref<MigrationOverview | null>(null);
let generation = 0;

const APPLIED_PREVIEW_LIMIT = 20;

const statusLabel: Record<MigrationOverviewStatus, string> = {
  'up-to-date': 'Atualizado',
  pending: 'Pendente',
  unavailable: 'Indisponível',
  unknown: 'Inconclusivo',
};

const statusTone: Record<MigrationOverviewStatus, StatusBadgeTone> = {
  'up-to-date': 'success',
  pending: 'warning',
  unavailable: 'danger',
  unknown: 'neutral',
};

const visibleApplied = computed(() =>
  (overview.value?.applied ?? []).slice(-APPLIED_PREVIEW_LIMIT).reverse(),
);

const hiddenAppliedCount = computed(() =>
  Math.max(
    0,
    (overview.value?.applied.length ?? 0) - visibleApplied.value.length,
  ),
);

const summaryText = computed(() => {
  const status = overview.value?.status;
  if (status === 'up-to-date') {
    return 'Não há migrations pendentes segundo a evidência disponível.';
  }
  if (status === 'pending') {
    return 'Há migrations pendentes para o banco selecionado.';
  }
  if (status === 'unavailable') {
    return 'A inspeção não está disponível. Isso não significa zero migrations pendentes.';
  }
  return 'A evidência atual não permite classificar o estado com segurança.';
});

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

async function load(): Promise<void> {
  const requestGeneration = ++generation;
  loading.value = true;
  errorMessage.value = '';
  overview.value = null;

  try {
    const result = await fetchMigrationOverview(props.project.id);
    if (requestGeneration === generation) overview.value = result;
  } catch (error) {
    if (requestGeneration === generation) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o estado das migrations.';
    }
  } finally {
    if (requestGeneration === generation) loading.value = false;
  }
}

watch(
  () => props.project.id,
  () => void load(),
  { immediate: true },
);
</script>

<template>
  <section class="migrations-panel" aria-labelledby="migrations-title">
    <header class="migrations-header">
      <div>
        <span class="migrations-eyebrow">Banco de dados</span>
        <h3 id="migrations-title">Migrations</h3>
        <p>
          Inspeção comum e somente leitura. Nenhuma migration é executada por
          esta tela.
        </p>
      </div>
    </header>

    <EmptyState
      v-if="loading"
      icon="•••"
      title="Inspecionando migrations"
      description="Consultando o provider compatível com este projeto."
    />

    <EmptyState
      v-else-if="errorMessage"
      icon="!"
      title="Migrations indisponíveis"
      :description="errorMessage"
    >
      <template #actions>
        <button class="primary-button" type="button" @click="load">
          Tentar novamente
        </button>
      </template>
    </EmptyState>

    <template v-else-if="overview">
      <div
        class="migrations-state"
        :class="`migrations-state--${overview.status}`"
      >
        <div class="migrations-state-copy">
          <span class="migrations-state-dot" aria-hidden="true"></span>
          <div>
            <strong>{{ statusLabel[overview.status] }}</strong>
            <p>{{ summaryText }}</p>
          </div>
        </div>
        <StatusBadge :tone="statusTone[overview.status]" size="md">
          {{ statusLabel[overview.status] }}
        </StatusBadge>
      </div>

      <div class="migrations-workspace">
        <section
          class="migrations-timeline-panel"
          aria-labelledby="migrations-timeline-title"
        >
          <div class="migrations-timeline-heading">
            <h4 id="migrations-timeline-title">Histórico de migrations</h4>
            <p>Pendentes primeiro; aplicadas em ordem mais recente.</p>
          </div>

          <div class="migrations-timeline">
            <section
              class="migrations-timeline-item migrations-timeline-item--pending"
              aria-labelledby="pending-title"
            >
              <span
                class="migrations-timeline-marker"
                aria-hidden="true"
              ></span>
              <div class="migrations-timeline-content">
                <div class="migrations-section-heading">
                  <h5 id="pending-title">Pendentes</h5>
                  <span>{{ overview.pending.length }}</span>
                </div>
                <p
                  v-if="overview.pending.length === 0"
                  class="migrations-empty-copy"
                >
                  Nenhuma migration pendente foi identificada pela inspeção.
                </p>
                <ul v-else class="migrations-list">
                  <li v-for="migration in overview.pending" :key="migration.id">
                    <code>{{ migration.id }}</code>
                    <span v-if="migration.name">{{ migration.name }}</span>
                  </li>
                </ul>
              </div>
            </section>

            <section
              class="migrations-timeline-item"
              aria-labelledby="applied-title"
            >
              <span
                class="migrations-timeline-marker"
                aria-hidden="true"
              ></span>
              <div class="migrations-timeline-content">
                <div class="migrations-section-heading">
                  <h5 id="applied-title">Aplicadas</h5>
                  <span>{{ overview.applied.length }}</span>
                </div>
                <p
                  v-if="overview.applied.length === 0"
                  class="migrations-empty-copy"
                >
                  Nenhuma migration aplicada foi retornada pelo provider.
                </p>
                <template v-else>
                  <p v-if="hiddenAppliedCount" class="migrations-empty-copy">
                    Exibindo as {{ visibleApplied.length }} mais recentes de
                    {{ overview.applied.length }}.
                  </p>
                  <ul class="migrations-list">
                    <li v-for="migration in visibleApplied" :key="migration.id">
                      <code>{{ migration.id }}</code>
                      <span v-if="migration.name">{{ migration.name }}</span>
                    </li>
                  </ul>
                </template>
              </div>
            </section>

            <section
              class="migrations-timeline-item migrations-timeline-item--inspection"
              aria-labelledby="inspection-title"
            >
              <span
                class="migrations-timeline-marker"
                aria-hidden="true"
              ></span>
              <div class="migrations-timeline-content">
                <div class="migrations-section-heading">
                  <h5 id="inspection-title">Inspeção</h5>
                </div>
                <p class="migrations-inspection-date">
                  {{ formatDate(overview.observedAt) }}
                </p>
                <code class="migrations-evidence">{{ overview.evidence }}</code>
              </div>
            </section>
          </div>
        </section>

        <aside class="migrations-context" aria-label="Contexto da inspeção">
          <span class="migrations-context-eyebrow">Contexto</span>

          <dl class="migrations-context-list">
            <div>
              <dt>Status</dt>
              <dd>{{ statusLabel[overview.status] }}</dd>
            </div>
            <div>
              <dt>Provider</dt>
              <dd>{{ overview.provider }}</dd>
            </div>
            <div>
              <dt>Banco</dt>
              <dd>{{ overview.database }}</dd>
            </div>
            <div>
              <dt>Aplicadas</dt>
              <dd>{{ overview.applied.length }}</dd>
            </div>
            <div>
              <dt>Pendentes</dt>
              <dd>{{ overview.pending.length }}</dd>
            </div>
            <div>
              <dt>Modo</dt>
              <dd>Somente leitura</dd>
            </div>
          </dl>

          <div
            v-if="overview.warnings.length"
            class="migrations-warning"
            role="note"
          >
            <strong>Atenção</strong>
            <ul>
              <li v-for="warning in overview.warnings" :key="warning">
                {{ warning }}
              </li>
            </ul>
          </div>

          <p class="migrations-readonly-note">
            Nenhuma migration é executada nesta tela.
          </p>
        </aside>
      </div>
    </template>
  </section>
</template>

<style scoped>
.migrations-panel {
  display: grid;
  gap: var(--space-5);
  padding: var(--space-5);
}

.migrations-header h3,
.migrations-header p,
.migrations-state p,
.migrations-timeline-heading h4,
.migrations-timeline-heading p,
.migrations-section-heading h5,
.migrations-empty-copy,
.migrations-inspection-date,
.migrations-readonly-note {
  margin: 0;
}

.migrations-header h3 {
  margin-top: var(--space-1);
}

.migrations-header p,
.migrations-timeline-heading p,
.migrations-empty-copy,
.migrations-inspection-date,
.migrations-readonly-note,
.migrations-context-list dt {
  color: var(--text-muted);
}

.migrations-eyebrow,
.migrations-context-eyebrow,
.migrations-context-list dt {
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.migrations-state {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4);
  border-left: 3px solid var(--border-strong);
  background: var(--surface-2);
}

.migrations-state--up-to-date {
  border-left-color: var(--success-text);
}

.migrations-state--pending {
  border-left-color: var(--warning-text);
}

.migrations-state--unavailable {
  border-left-color: var(--danger-text);
}

.migrations-state-copy {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  min-width: 0;
}

.migrations-state-copy > div {
  display: grid;
  gap: var(--space-1);
}

.migrations-state-dot {
  width: 10px;
  height: 10px;
  margin-top: 5px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--text-muted);
}

.migrations-state--up-to-date .migrations-state-dot {
  background: var(--success-text);
}

.migrations-state--pending .migrations-state-dot {
  background: var(--warning-text);
}

.migrations-state--unavailable .migrations-state-dot {
  background: var(--danger-text);
}

.migrations-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(250px, 320px);
  gap: var(--space-6);
  align-items: start;
}

.migrations-timeline-panel {
  min-width: 0;
}

.migrations-timeline-heading {
  display: grid;
  gap: var(--space-1);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--border);
}

.migrations-timeline {
  display: grid;
}

.migrations-timeline-item {
  position: relative;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: var(--space-3);
  padding: var(--space-5) 0;
}

.migrations-timeline-item:not(:last-child)::before {
  content: '';
  position: absolute;
  top: 32px;
  bottom: -8px;
  left: 7px;
  width: 1px;
  background: var(--border);
}

.migrations-timeline-marker {
  position: relative;
  z-index: 1;
  width: 14px;
  height: 14px;
  margin-top: 2px;
  border: 2px solid var(--border-strong);
  border-radius: 50%;
  background: var(--surface-0);
}

.migrations-timeline-item--pending .migrations-timeline-marker {
  border-color: var(--warning-text);
}

.migrations-timeline-item--inspection .migrations-timeline-marker {
  border-color: var(--accent);
}

.migrations-timeline-content {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
}

.migrations-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.migrations-section-heading span {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.migrations-list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.migrations-list li {
  display: grid;
  grid-template-columns: minmax(12rem, auto) 1fr;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-top: 1px solid var(--border);
}

.migrations-list code,
.migrations-evidence {
  overflow-wrap: anywhere;
}

.migrations-evidence {
  width: fit-content;
  max-width: 100%;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--code-surface);
  color: var(--code-text);
}

.migrations-context {
  display: grid;
  gap: var(--space-4);
  padding-left: var(--space-5);
  border-left: 1px solid var(--border);
}

.migrations-context-list {
  display: grid;
  margin: 0;
}

.migrations-context-list > div {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--border);
}

.migrations-context-list dd {
  margin: 0;
  font-weight: var(--font-weight-strong);
  overflow-wrap: anywhere;
}

.migrations-warning {
  padding: var(--space-3) 0 var(--space-3) var(--space-3);
  border-left: 3px solid var(--warning-text);
}

.migrations-warning ul {
  margin: var(--space-2) 0 0;
  padding-left: var(--space-5);
}

.migrations-readonly-note {
  padding-top: var(--space-2);
}

@media (max-width: 900px) {
  .migrations-workspace {
    grid-template-columns: 1fr;
  }

  .migrations-context {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: var(--space-5) 0 0;
    border-top: 1px solid var(--border);
    border-left: 0;
  }

  .migrations-context-eyebrow,
  .migrations-warning,
  .migrations-readonly-note {
    grid-column: 1 / -1;
  }
}

@media (max-width: 640px) {
  .migrations-state {
    align-items: flex-start;
    flex-direction: column;
  }

  .migrations-context {
    grid-template-columns: 1fr;
  }

  .migrations-list li {
    grid-template-columns: 1fr;
    gap: var(--space-1);
  }
}
</style>
