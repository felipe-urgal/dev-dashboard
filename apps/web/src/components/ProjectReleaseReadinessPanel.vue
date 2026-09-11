<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';

import type { Project } from '@dev-dashboard/contracts';

import {
  fetchReleaseReadiness,
  type ReleaseReadinessActionTarget,
  type ReleaseReadinessCheckId,
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

const checkLabel: Record<ReleaseReadinessCheckId, string> = {
  git: 'Git',
  tests: 'Testes',
  doctor: 'Doctor',
  migrations: 'Migrations',
};

const checkOrder: Record<ReleaseReadinessCheckId, number> = {
  git: 0,
  tests: 1,
  doctor: 2,
  migrations: 3,
};

const orderedChecks = computed(() =>
  [...(snapshot.value?.checks ?? [])].sort(
    (left, right) => checkOrder[left.id] - checkOrder[right.id],
  ),
);

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
  <section class="readiness-panel" aria-labelledby="readiness-title">
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
      <div
        class="readiness-state"
        :class="`readiness-state--${snapshot.state}`"
      >
        <div class="readiness-state-copy">
          <span class="readiness-state-dot" aria-hidden="true"></span>
          <div>
            <strong>{{ summaryText }}</strong>
            <p>Resultado consolidado das evidências verificáveis desta branch.</p>
          </div>
        </div>
        <span class="readiness-generated-at">
          Atualizado em {{ formatDate(snapshot.generatedAt) }}
        </span>
      </div>

      <section
        class="readiness-checklist-panel"
        aria-labelledby="readiness-checklist-title"
      >
        <div class="readiness-checklist-heading">
          <h4 id="readiness-checklist-title">Checklist de entrega</h4>
          <p>
            Git, Testes, Doctor e Migrations formam a evidência usada para a
            conclusão acima.
          </p>
        </div>

        <ol class="readiness-checklist" aria-label="Checks de Release Readiness">
          <li
            v-for="check in orderedChecks"
            :key="check.id"
            class="readiness-check"
            :class="`readiness-check--${check.state}`"
          >
            <span class="readiness-check-marker" aria-hidden="true"></span>

            <div class="readiness-check-body">
              <span class="readiness-check-domain">{{ checkLabel[check.id] }}</span>
              <strong>{{ check.summary }}</strong>
              <p>{{ check.evidence }}</p>
              <small>Observado em {{ formatDate(check.observedAt) }}</small>
            </div>

            <div class="readiness-check-actions">
              <StatusBadge :tone="stateTone[check.state]">
                {{ stateLabel[check.state] }}
              </StatusBadge>
              <RouterLink
                class="secondary-button link-button"
                :to="actionRoute(check.action.target)"
              >
                {{ check.action.label }}
              </RouterLink>
            </div>
          </li>
        </ol>
      </section>
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
.readiness-state,
.readiness-state-copy,
.readiness-check,
.readiness-check-actions {
  display: flex;
}

.readiness-header,
.readiness-state,
.readiness-check {
  justify-content: space-between;
}

.readiness-header,
.readiness-check {
  align-items: flex-start;
}

.readiness-header {
  gap: var(--space-4);
}

.readiness-header h3,
.readiness-header p,
.readiness-state p,
.readiness-checklist-heading h4,
.readiness-checklist-heading p,
.readiness-check-body p {
  margin: 0;
}

.readiness-header h3 {
  margin-top: var(--space-1);
}

.readiness-header p,
.readiness-state p,
.readiness-checklist-heading p,
.readiness-check-body p,
.readiness-check-body small,
.readiness-generated-at {
  color: var(--text-muted);
}

.readiness-eyebrow,
.readiness-check-domain {
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.readiness-eyebrow {
  color: var(--text-muted);
}

.readiness-state {
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4);
  border-left: 3px solid var(--border-strong);
  background: var(--surface-2);
}

.readiness-state--pass {
  border-left-color: var(--success-text);
}

.readiness-state--warning {
  border-left-color: var(--warning-text);
}

.readiness-state--block {
  border-left-color: var(--danger-text);
}

.readiness-state-copy {
  align-items: flex-start;
  gap: var(--space-3);
  min-width: 0;
}

.readiness-state-copy > div {
  display: grid;
  gap: var(--space-1);
}

.readiness-state-dot {
  width: 10px;
  height: 10px;
  margin-top: 5px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--text-muted);
}

.readiness-state--pass .readiness-state-dot {
  background: var(--success-text);
}

.readiness-state--warning .readiness-state-dot {
  background: var(--warning-text);
}

.readiness-state--block .readiness-state-dot {
  background: var(--danger-text);
}

.readiness-generated-at {
  flex: 0 0 auto;
  font-size: var(--font-xs);
  white-space: nowrap;
}

.readiness-checklist-panel {
  min-width: 0;
}

.readiness-checklist-heading {
  display: grid;
  gap: var(--space-1);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--border);
}

.readiness-checklist {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.readiness-check {
  position: relative;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  gap: var(--space-3);
  padding: var(--space-5) 0;
}

.readiness-check:not(:last-child)::before {
  content: '';
  position: absolute;
  top: 34px;
  bottom: -10px;
  left: 7px;
  width: 1px;
  background: var(--border);
}

.readiness-check-marker {
  position: relative;
  z-index: 1;
  width: 14px;
  height: 14px;
  margin-top: 2px;
  border: 2px solid var(--border-strong);
  border-radius: 50%;
  background: var(--surface-0);
}

.readiness-check--pass .readiness-check-marker {
  border-color: var(--success-text);
}

.readiness-check--warning .readiness-check-marker {
  border-color: var(--warning-text);
}

.readiness-check--block .readiness-check-marker {
  border-color: var(--danger-text);
}

.readiness-check-body {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}

.readiness-check-domain {
  color: var(--text-muted);
}

.readiness-check-actions {
  align-items: center;
  gap: var(--space-3);
}

@media (max-width: 820px) {
  .readiness-state {
    align-items: flex-start;
    flex-direction: column;
  }

  .readiness-generated-at {
    white-space: normal;
  }

  .readiness-check {
    grid-template-columns: 20px minmax(0, 1fr);
  }

  .readiness-check-actions {
    grid-column: 2;
    justify-content: space-between;
  }
}

@media (max-width: 620px) {
  .readiness-header {
    flex-direction: column;
  }

  .readiness-check-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .readiness-check-actions .secondary-button {
    width: 100%;
  }
}
</style>
