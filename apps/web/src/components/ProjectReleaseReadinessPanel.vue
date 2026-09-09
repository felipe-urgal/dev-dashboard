<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';

import type { Project } from '@dev-dashboard/contracts';

import {
  fetchReleaseReadiness,
  type ReleaseReadinessActionTarget,
  type ReleaseReadinessSnapshot,
  type ReleaseReadinessState,
} from '../api/release-readiness';
import EmptyState from './EmptyState.vue';
import StatusBadge from './StatusBadge.vue';
import type { StatusBadgeTone } from './status-badge-types';

const props = defineProps<{ project: Project }>();

const loading = ref(false);
const errorMessage = ref('');
const snapshot = ref<ReleaseReadinessSnapshot | null>(null);
let generation = 0;

const stateLabel: Record<ReleaseReadinessState, string> = {
  pass: 'Pronto',
  warning: 'Atenção',
  block: 'Bloqueado',
  unknown: 'Inconclusivo',
};

const stateTone: Record<ReleaseReadinessState, StatusBadgeTone> = {
  pass: 'success',
  warning: 'warning',
  block: 'danger',
  unknown: 'neutral',
};

const summaryText = computed(() => {
  const state = snapshot.value?.state;
  if (state === 'pass') {
    return 'As evidências disponíveis estão recentes e não apresentam bloqueadores.';
  }
  if (state === 'block') {
    return 'Há pelo menos um bloqueio verificável antes da entrega.';
  }
  if (state === 'warning') {
    return 'Não há bloqueio determinístico, mas existe um ponto que merece atenção.';
  }
  return 'Faltam evidências suficientes para considerar esta branch pronta.';
});

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function actionRoute(target: ReleaseReadinessActionTarget) {
  if (target === 'synchronization') {
    return {
      name: 'project-git',
      params: { projectId: props.project.id },
      query: { tab: 'sync' },
    };
  }
  if (target === 'tests') {
    return { name: 'project-tests', params: { projectId: props.project.id } };
  }
  if (target === 'doctor') {
    return { name: 'project-doctor', params: { projectId: props.project.id } };
  }
  return {
    name: 'project-migrations',
    params: { projectId: props.project.id },
  };
}

async function load(): Promise<void> {
  const requestGeneration = ++generation;
  loading.value = true;
  errorMessage.value = '';
  snapshot.value = null;

  try {
    const result = await fetchReleaseReadiness(props.project.id);
    if (requestGeneration === generation) snapshot.value = result;
  } catch (error) {
    if (requestGeneration === generation) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o Release Readiness.';
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
  <section class="readiness-panel dd-card" aria-labelledby="readiness-title">
    <header class="readiness-header">
      <div>
        <span class="readiness-eyebrow">Evidência de entrega</span>
        <h3 id="readiness-title">Release Readiness</h3>
        <p>
          Leitura verificável do estado atual. Não autoriza merge, push ou
          deploy.
        </p>
      </div>
      <StatusBadge v-if="snapshot" :tone="stateTone[snapshot.state]" size="md">
        {{ stateLabel[snapshot.state] }}
      </StatusBadge>
    </header>

    <EmptyState
      v-if="loading"
      icon="•••"
      title="Verificando readiness"
      description="Consultando Git, suíte completa comparável, Project Doctor e Migrations."
    />

    <EmptyState
      v-else-if="errorMessage"
      icon="!"
      title="Readiness indisponível"
      :description="errorMessage"
    >
      <template #actions>
        <button class="primary-button" type="button" @click="load">
          Tentar novamente
        </button>
      </template>
    </EmptyState>

    <template v-else-if="snapshot">
      <div class="readiness-summary">
        <strong>{{ summaryText }}</strong>
        <span>Atualizado em {{ formatDate(snapshot.generatedAt) }}</span>
      </div>

      <ul class="readiness-checks" aria-label="Checks de Release Readiness">
        <li
          v-for="check in snapshot.checks"
          :key="check.id"
          class="readiness-check"
        >
          <div class="readiness-check-main">
            <StatusBadge :tone="stateTone[check.state]">
              {{ stateLabel[check.state] }}
            </StatusBadge>
            <div>
              <strong>{{ check.summary }}</strong>
              <p>{{ check.evidence }}</p>
              <small>Observado em {{ formatDate(check.observedAt) }}</small>
            </div>
          </div>
          <RouterLink
            class="secondary-button link-button"
            :to="actionRoute(check.action.target)"
          >
            {{ check.action.label }}
          </RouterLink>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.readiness-panel {
  display: grid;
  gap: var(--space-5);
  padding: var(--space-5);
}

.readiness-header,
.readiness-check,
.readiness-check-main {
  display: flex;
  gap: var(--space-3);
}

.readiness-header,
.readiness-check {
  align-items: flex-start;
  justify-content: space-between;
}

.readiness-header h3,
.readiness-header p,
.readiness-check p {
  margin: 0;
}

.readiness-header h3 {
  margin-top: var(--space-1);
}

.readiness-header p,
.readiness-check p,
.readiness-check small,
.readiness-summary span {
  color: var(--text-muted);
}

.readiness-eyebrow {
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.readiness-summary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  justify-content: space-between;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface-2);
}

.readiness-checks {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.readiness-check {
  padding: var(--space-4) 0;
  border-top: 1px solid var(--border-subtle);
}

.readiness-check-main {
  min-width: 0;
}

.readiness-check-main > div {
  display: grid;
  gap: var(--space-1);
}

@media (max-width: 720px) {
  .readiness-header,
  .readiness-check,
  .readiness-check-main {
    flex-direction: column;
  }

  .readiness-check .secondary-button {
    width: 100%;
  }
}
</style>
