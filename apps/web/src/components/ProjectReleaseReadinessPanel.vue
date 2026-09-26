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
  <section class="readiness-panel" aria-label="Release Readiness">
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
        <div class="readiness-summary">
          <RocketLaunchIcon aria-hidden="true" />
          <div>
            <strong>{{ blockerSummary }}</strong>
            <span>Atualizado em {{ formatDate(snapshot.generatedAt) }}</span>
          </div>
        </div>

        <StatusBadge :tone="stateTone[snapshot.state]" size="md">
          {{ stateLabel[snapshot.state] }}
        </StatusBadge>
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
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: calc(100vh - var(--app-topbar-height, 72px));
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-1);
}

.readiness-panel > :deep(.empty-state) {
  min-height: 0;
  flex: 1 1 auto;
  border: 0;
  border-radius: 0;
  background: var(--surface-1);
}

.readiness-card {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-1);
}

.readiness-header,
.readiness-summary,
.readiness-check-action {
  display: flex;
  align-items: center;
}

.readiness-header {
  min-height: 54px;
  flex: 0 0 auto;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px 8px 14px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-1) 96%, var(--surface-2) 4%);
}

.readiness-summary {
  min-width: 0;
  gap: 8px;
}

.readiness-summary > svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  color: var(--accent);
}

.readiness-summary > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.readiness-summary strong {
  overflow: hidden;
  color: var(--text);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.readiness-summary span {
  color: var(--text-dim);
  font-size: 9px;
}

.readiness-checklist {
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  margin: 0;
  overflow-y: auto;
  padding: 0;
  list-style: none;
}

.readiness-check {
  display: grid;
  min-height: 62px;
  grid-template-columns: 24px 110px 110px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--border);
}

.readiness-check:hover {
  background: var(--surface-2);
}

.readiness-check-icon {
  width: 17px;
  height: 17px;
  color: var(--text-muted);
}

.readiness-check-domain {
  color: var(--text);
  font-size: 10px;
  font-weight: var(--font-weight-strong);
}

.readiness-check-summary {
  min-width: 0;
  margin: 0;
  color: var(--text-muted);
  font-size: 9px;
  line-height: 1.4;
}

.readiness-check-action {
  gap: 5px;
  color: var(--text-muted);
  text-decoration: none;
}

.readiness-check-action > svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
}

.readiness-open-button {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  justify-content: center;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  background: transparent;
  font-size: 9px;
  font-weight: var(--font-weight-strong);
}

.readiness-check-action:hover .readiness-open-button {
  border-color: var(--border-strong);
  background: var(--surface-2);
}

@media (max-width: 860px) {
  .readiness-check {
    grid-template-columns: 24px 96px 100px minmax(0, 1fr) auto;
  }
}

@media (max-width: 680px) {
  .readiness-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .readiness-check {
    grid-template-columns: 24px minmax(0, 1fr) auto;
    grid-template-areas:
      'icon domain action'
      'icon status action'
      'icon summary summary';
    align-items: start;
  }

  .readiness-check-icon { grid-area: icon; }
  .readiness-check-domain { grid-area: domain; }
  .readiness-check-status { grid-area: status; justify-self: start; }
  .readiness-check-summary { grid-area: summary; }
  .readiness-check-action { grid-area: action; }
}
</style>
