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
  <section class="migrations-panel dd-card" aria-labelledby="migrations-title">
    <header class="migrations-header">
      <div>
        <span class="migrations-eyebrow">Banco de dados</span>
        <h3 id="migrations-title">Migrations</h3>
        <p>
          Inspeção comum e somente leitura. Nenhuma migration é executada por
          esta tela.
        </p>
      </div>
      <StatusBadge
        v-if="overview"
        :tone="statusTone[overview.status]"
        size="md"
      >
        {{ statusLabel[overview.status] }}
      </StatusBadge>
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
      <div class="migrations-summary">
        <strong>{{ summaryText }}</strong>
        <span>Observado em {{ formatDate(overview.observedAt) }}</span>
      </div>

      <dl class="migrations-metadata">
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
      </dl>

      <div class="migrations-evidence">
        <span>Evidência</span>
        <strong>{{ overview.evidence }}</strong>
      </div>

      <div v-if="overview.warnings.length" class="migrations-warning" role="note">
        <strong>Atenção</strong>
        <ul>
          <li v-for="warning in overview.warnings" :key="warning">
            {{ warning }}
          </li>
        </ul>
      </div>

      <section class="migrations-list-section" aria-labelledby="pending-title">
        <div class="migrations-section-heading">
          <h4 id="pending-title">Pendentes</h4>
          <span>{{ overview.pending.length }}</span>
        </div>
        <p v-if="overview.pending.length === 0" class="migrations-empty-copy">
          Nenhuma migration pendente foi identificada pela inspeção.
        </p>
        <ul v-else class="migrations-list">
          <li v-for="migration in overview.pending" :key="migration.id">
            <code>{{ migration.id }}</code>
            <span v-if="migration.name">{{ migration.name }}</span>
          </li>
        </ul>
      </section>

      <section class="migrations-list-section" aria-labelledby="applied-title">
        <div class="migrations-section-heading">
          <h4 id="applied-title">Últimas aplicadas</h4>
          <span>{{ overview.applied.length }}</span>
        </div>
        <p v-if="overview.applied.length === 0" class="migrations-empty-copy">
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
      </section>
    </template>
  </section>
</template>

<style scoped>
.migrations-panel {
  display: grid;
  gap: var(--space-5);
  padding: var(--space-5);
}

.migrations-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.migrations-header h3,
.migrations-header p,
.migrations-list-section h4,
.migrations-list-section p {
  margin: 0;
}

.migrations-header h3 {
  margin-top: var(--space-1);
}

.migrations-header p,
.migrations-summary span,
.migrations-empty-copy,
.migrations-metadata dt,
.migrations-evidence span {
  color: var(--text-muted);
}

.migrations-eyebrow,
.migrations-evidence span {
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.migrations-summary,
.migrations-evidence,
.migrations-warning {
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface-2);
}

.migrations-summary {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-2) var(--space-4);
}

.migrations-metadata {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
  margin: 0;
}

.migrations-metadata > div,
.migrations-evidence {
  display: grid;
  gap: var(--space-1);
}

.migrations-metadata > div {
  padding: var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.migrations-metadata dd {
  margin: 0;
  font-weight: var(--font-weight-strong);
  overflow-wrap: anywhere;
}

.migrations-warning {
  border: 1px solid var(--border-subtle);
}

.migrations-warning ul {
  margin: var(--space-2) 0 0;
  padding-left: var(--space-5);
}

.migrations-list-section {
  display: grid;
  gap: var(--space-3);
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
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.migrations-list li {
  display: grid;
  grid-template-columns: minmax(12rem, auto) 1fr;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-top: 1px solid var(--border-subtle);
}

.migrations-list code {
  overflow-wrap: anywhere;
}

@media (max-width: 720px) {
  .migrations-header {
    flex-direction: column;
  }

  .migrations-metadata {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .migrations-list li {
    grid-template-columns: 1fr;
    gap: var(--space-1);
  }
}
</style>
