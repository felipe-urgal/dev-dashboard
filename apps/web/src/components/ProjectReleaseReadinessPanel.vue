<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue';
import {
  ArrowPathIcon,
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
  type ReleaseReadinessCheck,
  type ReleaseReadinessCheckId,
  type ReleaseReadinessSnapshot,
  type ReleaseReadinessState,
} from '../api/release-readiness';
import { releaseReadinessActionRoute } from '../api/release-readiness-routes';
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

const checkCounts = computed(() => {
  const counts = { block: 0, warning: 0, unknown: 0 };
  for (const check of snapshot.value?.checks ?? []) {
    if (check.state !== 'pass') counts[check.state] += 1;
  }
  return counts;
});

const countsSummary = computed(() => {
  const { block, warning, unknown } = checkCounts.value;
  return [
    `${block} ${block === 1 ? 'bloqueio' : 'bloqueios'}`,
    `${warning} ${warning === 1 ? 'alerta' : 'alertas'}`,
    `${unknown} ${unknown === 1 ? 'inconclusivo' : 'inconclusivos'}`,
  ].join(' · ');
});

const readinessSummary = computed(() => {
  const current = snapshot.value;
  if (!current) return '';

  switch (current.state) {
    case 'block':
      return checkCounts.value.block === 1
        ? '1 bloqueio impede a entrega.'
        : `${checkCounts.value.block} bloqueios impedem a entrega.`;
    case 'unknown':
      return checkCounts.value.unknown === 1
        ? '1 check inconclusivo; entrega ainda não comprovada.'
        : `${checkCounts.value.unknown} checks inconclusivos; ` +
            'entrega ainda não comprovada.';
    case 'warning':
      return checkCounts.value.warning === 1
        ? '1 alerta requer atenção antes da entrega.'
        : `${checkCounts.value.warning} alertas requerem atenção ` +
            'antes da entrega.';
    case 'pass':
      return 'Todos os checks aplicáveis estão comprovados.';
  }
  return '';
});

/** The backend owns readiness decisions; labels only clarify its evidence. */
function evidenceStateLabel(check: ReleaseReadinessCheck): string {
  if (check.state === 'block') return 'Bloqueio confirmado';
  if (check.state === 'warning') return 'Alerta pendente';
  if (check.state === 'pass') return 'Evidência comprovada';
  if (/desatualizad|freshness/i.test(check.summary)) {
    return 'Evidência desatualizada';
  }
  if (
    /indisponível|não pôde ser consultad/i.test(
      `${check.summary} ${check.evidence}`,
    )
  ) {
    return 'Fonte indisponível';
  }
  return 'Evidência inconclusiva';
}

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
  () => {
    // Never display the previous project's evidence under a new project.
    snapshot.value = null;
    errorMessage.value = '';
    void load();
  },
  { immediate: true },
);
</script>

<template>
  <section
    class="readiness-panel"
    aria-label="Release Readiness"
    :aria-busy="loading"
  >
    <EmptyState
      v-if="loading && !snapshot"
      icon="•••"
      title="Verificando readiness"
      description="Consultando Git, suíte completa comparável, Pull Request, Project Doctor, Migrations, Segurança e Produção."
    />

    <EmptyState
      v-else-if="errorMessage && !snapshot"
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
            <strong>{{ readinessSummary }}</strong>
            <span class="readiness-counts">{{ countsSummary }}</span>
            <span>Atualizado em {{ formatDate(snapshot.generatedAt) }}</span>
          </div>
        </div>

        <div class="readiness-header-actions">
          <StatusBadge :tone="stateTone[snapshot.state]" size="md">
            {{ stateLabel[snapshot.state] }}
          </StatusBadge>
          <button
            class="readiness-refresh-button"
            type="button"
            :disabled="loading"
            :aria-label="
              loading ? 'Atualizando readiness' : 'Atualizar readiness'
            "
            @click="load"
          >
            <ArrowPathIcon aria-hidden="true" />
            {{ loading ? 'Atualizando…' : 'Atualizar' }}
          </button>
        </div>
      </header>

      <p v-if="errorMessage" class="readiness-refresh-error" role="alert">
        Falha ao atualizar: {{ errorMessage }}. O snapshot anterior permanece
        visível.
      </p>

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
            :to="releaseReadinessActionRoute(check.action.target, project.id)"
            :aria-label="check.action.label"
          >
            <span class="readiness-open-button">Abrir</span>
            <ChevronRightIcon aria-hidden="true" />
          </RouterLink>

          <details class="readiness-check-details">
            <summary>Detalhes e evidência</summary>
            <div class="readiness-evidence-content">
              <strong>{{ evidenceStateLabel(check) }}</strong>
              <p class="readiness-evidence-text">{{ check.evidence }}</p>
              <span>
                Observado em
                <time :datetime="check.observedAt">{{
                  formatDate(check.observedAt)
                }}</time>
              </span>
            </div>
          </details>
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
.readiness-header-actions,
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

.readiness-header-actions {
  flex: 0 0 auto;
  gap: 10px;
}

.readiness-refresh-button {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  gap: 5px;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font-size: 10px;
  cursor: pointer;
}

.readiness-refresh-button:hover:not(:disabled) {
  border-color: var(--border-strong);
  background: var(--surface-2);
}

.readiness-refresh-button:disabled {
  opacity: 0.6;
  cursor: default;
}

.readiness-refresh-button svg {
  width: 15px;
  height: 15px;
}

.readiness-refresh-error {
  margin: 0;
  padding: 9px 14px;
  border-bottom: 1px solid var(--border);
  color: var(--text);
  font-size: 10px;
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

.readiness-summary .readiness-counts {
  color: var(--text-muted);
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

.readiness-check-details {
  grid-column: 2 / -1;
  min-width: 0;
  font-size: 10px;
}

.readiness-check-details summary {
  width: fit-content;
  color: var(--text-muted);
  cursor: pointer;
}

.readiness-check-details summary:hover {
  color: var(--text);
}

.readiness-evidence-content {
  display: grid;
  gap: 6px;
  max-width: 100%;
  margin-top: 8px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-muted);
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.readiness-evidence-content strong {
  color: var(--text);
}

.readiness-evidence-text {
  margin: 0;
  white-space: pre-wrap;
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
      'icon summary summary'
      'details details details';
    align-items: start;
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
  .readiness-check-details {
    grid-area: details;
  }
}
</style>
