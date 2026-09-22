<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue';
import {
  ArrowsRightLeftIcon,
  BeakerIcon,
  ChevronRightIcon,
  CircleStackIcon,
  CloudArrowUpIcon,
  CodeBracketIcon,
  HeartIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
} from '@heroicons/vue/24/outline';
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
  'pull-request': 'Pull Request',
  doctor: 'Doctor',
  migrations: 'Migrations',
  security: 'Segurança',
  production: 'Produção',
};

const checkOrder: Record<ReleaseReadinessCheckId, number> = {
  git: 0,
  tests: 1,
  'pull-request': 2,
  doctor: 3,
  migrations: 4,
  security: 5,
  production: 6,
};

const checkIcon: Record<ReleaseReadinessCheckId, Component> = {
  git: CodeBracketIcon,
  tests: BeakerIcon,
  'pull-request': ArrowsRightLeftIcon,
  doctor: HeartIcon,
  migrations: CircleStackIcon,
  security: ShieldCheckIcon,
  production: CloudArrowUpIcon,
};

const orderedChecks = computed(() =>
  [...(snapshot.value?.checks ?? [])].sort(
    (left, right) => checkOrder[left.id] - checkOrder[right.id],
  ),
);

const blockerCount = computed(
  () =>
    snapshot.value?.checks.filter((check) => check.state === 'block').length ??
    0,
);

const blockerSummary = computed(() => {
  if (blockerCount.value === 0) return 'Nenhum bloqueio impede a entrega.';
  if (blockerCount.value === 1) return '1 bloqueio impede a entrega.';
  return blockerCount.value + ' bloqueios impedem a entrega.';
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
  if (target === 'pull-request') {
    return {
      name: 'project-git',
      params: { projectId: props.project.id },
      query: { tab: 'pull-request' },
    };
  }
  if (target === 'doctor') {
    return { name: 'project-doctor', params: { projectId: props.project.id } };
  }
  if (target === 'migrations') {
    return {
      name: 'project-migrations',
      params: { projectId: props.project.id },
    };
  }
  if (target === 'security') {
    return {
      name: 'project-security',
      params: { projectId: props.project.id },
    };
  }
  return {
    name: 'project-production',
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
    <EmptyState
      v-if="loading"
      icon="•••"
      title="Verificando readiness"
      description="Consultando Git, suíte completa comparável, Pull Request, Project Doctor, Migrations, Segurança e Produção."
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

    <div v-else-if="snapshot" class="readiness-card">
      <header class="readiness-header">
        <div class="readiness-heading">
          <RocketLaunchIcon class="readiness-title-icon" aria-hidden="true" />
          <div>
            <h3 id="readiness-title">Release Readiness</h3>
            <p>{{ blockerSummary }}</p>
          </div>
        </div>

        <div class="readiness-overview">
          <StatusBadge :tone="stateTone[snapshot.state]" size="md">
            {{ stateLabel[snapshot.state] }}
          </StatusBadge>
          <span>Atualizado em {{ formatDate(snapshot.generatedAt) }}</span>
        </div>
      </header>

      <ol class="readiness-checklist" aria-label="Checks de Release Readiness">
        <li
          v-for="check in orderedChecks"
          :key="check.id"
          class="readiness-check"
        >
          <component
            :is="checkIcon[check.id]"
            class="readiness-check-icon"
            aria-hidden="true"
          />

          <span class="readiness-check-domain">
            {{ checkLabel[check.id] }}
          </span>

          <StatusBadge
            class="readiness-check-status"
            :tone="stateTone[check.state]"
          >
            {{ stateLabel[check.state] }}
          </StatusBadge>

          <p class="readiness-check-summary">{{ check.summary }}</p>

          <RouterLink
            class="readiness-check-action"
            :to="actionRoute(check.action.target)"
            :aria-label="'Abrir ' + checkLabel[check.id]"
          >
            <span class="readiness-open-button">Abrir</span>
            <ChevronRightIcon aria-hidden="true" />
          </RouterLink>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
.readiness-panel {
  padding: var(--space-5);
}

.readiness-card {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
}

.readiness-header,
.readiness-heading,
.readiness-overview,
.readiness-check-action {
  display: flex;
}

.readiness-header {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
  padding: var(--space-5);
  border-bottom: 1px solid var(--border);
}

.readiness-heading {
  align-items: flex-start;
  gap: var(--space-3);
  min-width: 0;
}

.readiness-title-icon {
  width: 28px;
  height: 28px;
  margin-top: 2px;
  flex: 0 0 auto;
  color: var(--text);
}

.readiness-header h3,
.readiness-header p,
.readiness-check-summary {
  margin: 0;
}

.readiness-header h3 {
  font-size: 22px;
  line-height: 1.25;
}

.readiness-header p,
.readiness-overview span,
.readiness-check-summary {
  color: var(--text-muted);
}

.readiness-header p {
  margin-top: var(--space-2);
}

.readiness-overview {
  align-items: flex-end;
  flex-direction: column;
  gap: var(--space-2);
  flex: 0 0 auto;
}

.readiness-overview span {
  font-size: var(--font-xs);
  white-space: nowrap;
}

.readiness-checklist {
  margin: 0;
  padding: 0 var(--space-5);
  list-style: none;
}

.readiness-check {
  display: grid;
  grid-template-columns: 28px 140px 140px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-4);
  min-height: 78px;
  padding: var(--space-3) 0;
}

.readiness-check + .readiness-check {
  border-top: 1px solid var(--border);
}

.readiness-check-icon {
  width: 24px;
  height: 24px;
  color: var(--text);
}

.readiness-check-domain {
  font-weight: var(--font-weight-strong);
  color: var(--text);
}

.readiness-check-summary {
  min-width: 0;
  line-height: 1.45;
}

.readiness-check-action {
  align-items: center;
  gap: var(--space-3);
  color: var(--text-muted);
  text-decoration: none;
}

.readiness-check-action > svg {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
}

.readiness-open-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font-weight: var(--font-weight-strong);
}

.readiness-check-action:hover .readiness-open-button {
  border-color: var(--border-strong);
  background: var(--surface-3);
}

.readiness-check-action:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm);
}

@media (max-width: 980px) {
  .readiness-check {
    grid-template-columns: 28px 120px 130px minmax(0, 1fr) auto;
    gap: var(--space-3);
  }
}

@media (max-width: 760px) {
  .readiness-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .readiness-overview {
    align-items: flex-start;
  }

  .readiness-overview span {
    white-space: normal;
  }

  .readiness-check {
    grid-template-columns: 28px minmax(0, 1fr) auto;
    grid-template-areas:
      "icon domain action"
      "icon status action"
      "icon summary summary";
    align-items: start;
    row-gap: var(--space-2);
    min-height: 0;
    padding: var(--space-4) 0;
  }

  .readiness-check-icon {
    grid-area: icon;
  }

  .readiness-check-domain {
    grid-area: domain;
  }

  .readiness-check-status {
    grid-area: status;
    justify-self: start;
  }

  .readiness-check-summary {
    grid-area: summary;
  }

  .readiness-check-action {
    grid-area: action;
  }
}

@media (max-width: 520px) {
  .readiness-panel {
    padding: var(--space-3);
  }

  .readiness-header,
  .readiness-checklist {
    padding-left: var(--space-4);
    padding-right: var(--space-4);
  }

  .readiness-check {
    grid-template-columns: 28px minmax(0, 1fr);
    grid-template-areas:
      "icon domain"
      "icon status"
      "icon summary"
      ". action";
  }

  .readiness-check-action {
    justify-content: space-between;
    margin-top: var(--space-1);
  }
}
</style>
