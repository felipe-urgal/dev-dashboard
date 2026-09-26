<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import type { Project } from '@dev-dashboard/contracts';

import {
  cancelMigrationMutation,
  fetchMigrationMutationStatus,
  fetchMigrationOverview,
  migrationMutationWebSocketUrl,
  planMigrationMutation,
  prepareMigrationMutation,
  startMigrationMutation,
  type MigrationMutationExecutionSnapshot,
  type MigrationMutationPlan,
  type MigrationOverview,
  type MigrationOverviewStatus,
} from '../api/migrations';
import { usePtyTerminalSocket } from '../composables/usePtyTerminalSocket';
import EmptyState from './EmptyState.vue';

const props = defineProps<{
  project: Project;
  environmentInstanceId?: string | undefined;
}>();

const loading = ref(false);
const errorMessage = ref('');
const overview = ref<MigrationOverview | null>(null);
const mutationPlan = ref<MigrationMutationPlan | null>(null);
const mutationSnapshot = ref<MigrationMutationExecutionSnapshot | null>(null);
const mutationBusy = ref(false);
const mutationError = ref('');
let generation = 0;

const APPLIED_PREVIEW_LIMIT = 20;

const { terminalContainer, connecting, connect, disconnect, disposeTerminal } =
  usePtyTerminalSocket<MigrationMutationExecutionSnapshot>({
    onReady: (snapshot) => {
      mutationSnapshot.value = snapshot;
    },
    onExit: (exitCode, exitSignal) => {
      if (mutationSnapshot.value) {
        mutationSnapshot.value = {
          ...mutationSnapshot.value,
          status: 'exited',
          exitCode,
          exitSignal,
          endedAt: new Date().toISOString(),
        };
      }
      void refreshReadModel();
    },
    onError: (message) => {
      mutationError.value = message;
    },
  });

const statusLabel: Record<MigrationOverviewStatus, string> = {
  'up-to-date': 'Atualizado',
  pending: 'Pendente',
  unavailable: 'Indisponível',
  unknown: 'Inconclusivo',
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

const hasMigrationItems = computed(
  () =>
    (overview.value?.pending.length ?? 0) > 0 ||
    (overview.value?.applied.length ?? 0) > 0,
);

const mutationRunning = computed(
  () => mutationSnapshot.value?.status === 'running',
);

const mutationReady = computed(
  () => mutationPlan.value?.preflight.state === 'ready',
);

const mutationMode = computed(() =>
  mutationReady.value ? 'Aplicação disponível' : 'Somente leitura',
);

const mutationHint = computed(() => {
  const plan = mutationPlan.value;
  if (!plan) return 'Avaliando se este provider pode executar migrations.';

  switch (plan.preflight.reason) {
    case 'ready':
      return 'Plano validado pelo backend. A execução revalida o ambiente e as migrations antes de iniciar.';
    case 'nothing-pending':
      return 'Não há migrations pendentes para aplicar.';
    case 'provider-unavailable':
      return 'Este provider ainda não possui execução comum habilitada.';
    case 'runtime-unsupported':
      return 'O runtime atual ainda não suporta execução comum de migrations.';
    case 'provider-evidence-mismatch':
    case 'database-evidence-mismatch':
      return 'A evidência read-only não coincide com o alvo da execução.';
    case 'inspection-inconclusive':
      return 'A inspeção atual é inconclusiva; a execução permanece bloqueada.';
    case 'provider-plan-invalid':
      return 'O provider não produziu um plano de execução válido.';
    default:
      return plan.preflight.diagnostic ?? 'A execução permanece bloqueada.';
  }
});

const emptyStateTitle = computed(() => {
  if (overview.value?.status === 'unavailable') {
    return 'Nenhuma migration disponível';
  }
  if (overview.value?.status === 'up-to-date') {
    return 'Nenhuma migration pendente';
  }
  return 'Nenhuma migration para exibir';
});

const emptyStateDescription = computed(() => {
  const current = overview.value;
  if (!current) return '';

  if (current.status === 'unavailable') {
    return (
      current.warnings[0] ??
      'Nenhum Migration Provider compatível foi encontrado para este projeto.'
    );
  }
  if (current.status === 'up-to-date') {
    return 'O banco está atualizado segundo a inspeção disponível.';
  }
  return 'A evidência atual não retornou migrations para exibir.';
});

const showMutationAction = computed(() => {
  if (mutationRunning.value || mutationReady.value || mutationError.value) {
    return true;
  }
  return (overview.value?.pending.length ?? 0) > 0;
});

const executionLabel = computed(() => {
  const snapshot = mutationSnapshot.value;
  if (!snapshot) return '';
  if (snapshot.status === 'running') return 'Executando';
  return snapshot.exitCode === 0 ? 'Concluída' : 'Falhou';
});

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

async function loadMutationState(
  projectId: string,
  database: string,
  environmentInstanceId: string | undefined,
  requestGeneration: number,
): Promise<void> {
  mutationPlan.value = null;
  mutationSnapshot.value = null;
  mutationError.value = '';
  disconnect();
  disposeTerminal();

  try {
    const plan = await planMigrationMutation(
      projectId,
      database,
      environmentInstanceId,
    );
    if (requestGeneration !== generation) return;
    mutationPlan.value = plan;

    const snapshot = await fetchMigrationMutationStatus(
      projectId,
      plan.environmentInstanceId,
    );
    if (requestGeneration !== generation) return;
    mutationSnapshot.value = snapshot;
    if (snapshot) {
      connect(
        migrationMutationWebSocketUrl(projectId, plan.environmentInstanceId),
      );
    }
  } catch (error) {
    if (requestGeneration === generation) {
      mutationError.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível avaliar a execução de migrations.';
    }
  }
}

async function load(): Promise<void> {
  const requestGeneration = ++generation;
  const projectId = props.project.id;
  const environmentInstanceId = props.environmentInstanceId;
  loading.value = true;
  errorMessage.value = '';
  overview.value = null;

  try {
    const result = await fetchMigrationOverview(
      projectId,
      undefined,
      environmentInstanceId,
    );
    if (requestGeneration !== generation) return;
    overview.value = result;
    await loadMutationState(
      projectId,
      result.database,
      environmentInstanceId,
      requestGeneration,
    );
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

async function refreshReadModel(): Promise<void> {
  const projectId = props.project.id;
  const environmentInstanceId = props.environmentInstanceId;
  try {
    const result = await fetchMigrationOverview(
      projectId,
      undefined,
      environmentInstanceId,
    );
    if (
      props.project.id !== projectId ||
      props.environmentInstanceId !== environmentInstanceId
    ) {
      return;
    }
    overview.value = result;
    mutationPlan.value = await planMigrationMutation(
      projectId,
      result.database,
      environmentInstanceId,
    );
  } catch (error) {
    if (
      props.project.id === projectId &&
      props.environmentInstanceId === environmentInstanceId
    ) {
      mutationError.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar o estado após a execução.';
    }
  }
}

async function runMigration(): Promise<void> {
  const plan = mutationPlan.value;
  if (!plan || plan.preflight.state !== 'ready' || mutationRunning.value) {
    return;
  }

  mutationBusy.value = true;
  mutationError.value = '';
  try {
    const confirmation = await prepareMigrationMutation(props.project.id, plan);
    const snapshot = await startMigrationMutation(
      props.project.id,
      plan,
      confirmation.token,
    );
    mutationSnapshot.value = snapshot;
    disconnect();
    disposeTerminal();
    connect(
      migrationMutationWebSocketUrl(
        props.project.id,
        snapshot.environmentInstanceId,
      ),
    );
  } catch (error) {
    mutationError.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível iniciar a execução das migrations.';
    await refreshReadModel();
  } finally {
    mutationBusy.value = false;
  }
}

async function cancelMutation(): Promise<void> {
  const snapshot = mutationSnapshot.value;
  if (!snapshot || snapshot.status !== 'running') return;

  mutationBusy.value = true;
  mutationError.value = '';
  try {
    await cancelMigrationMutation(
      props.project.id,
      snapshot.environmentInstanceId,
    );
  } catch (error) {
    mutationError.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível cancelar a execução das migrations.';
  } finally {
    mutationBusy.value = false;
  }
}

watch(
  () => [props.project.id, props.environmentInstanceId] as const,
  () => void load(),
  { immediate: true },
);
</script>

<template>
  <section class="migrations-panel" aria-label="Migrations">
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
      <div class="migrations-meta" aria-label="Resumo da inspeção">
        <div class="migrations-meta-item migrations-meta-item--status">
          <span
            class="migrations-status-dot"
            :class="`migrations-status-dot--${overview.status}`"
            aria-hidden="true"
          ></span>
          <div>
            <span>Status</span>
            <strong>{{ statusLabel[overview.status] }}</strong>
          </div>
        </div>

        <div class="migrations-meta-item">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="5" y="10" width="14" height="10" rx="2"></rect>
            <path d="M8 10V7a4 4 0 0 1 8 0v3"></path>
          </svg>
          <div>
            <span>Modo</span>
            <strong>{{ mutationMode }}</strong>
          </div>
        </div>

        <div class="migrations-meta-item">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <ellipse cx="12" cy="5" rx="7" ry="3"></ellipse>
            <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5"></path>
            <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"></path>
          </svg>
          <div>
            <span>Provider</span>
            <strong>{{ overview.provider }}</strong>
          </div>
        </div>

        <div class="migrations-meta-item">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <ellipse cx="12" cy="5" rx="7" ry="3"></ellipse>
            <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5"></path>
            <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"></path>
          </svg>
          <div>
            <span>Banco</span>
            <strong>{{ overview.database }}</strong>
          </div>
        </div>
      </div>

      <div class="migrations-counts" aria-label="Contagem de migrations">
        <div>
          <span>Pendentes</span>
          <strong>{{ overview.pending.length }}</strong>
        </div>
        <div>
          <span>Aplicadas</span>
          <strong>{{ overview.applied.length }}</strong>
        </div>
      </div>

      <section class="migrations-content" aria-live="polite">
        <div
          v-if="!hasMigrationItems || overview.status === 'unavailable'"
          class="migrations-empty"
        >
          <span class="migrations-empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <ellipse cx="12" cy="5" rx="7" ry="3"></ellipse>
              <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5"></path>
              <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"></path>
            </svg>
          </span>
          <h4>{{ emptyStateTitle }}</h4>
          <p>{{ emptyStateDescription }}</p>
          <span class="migrations-observed-at">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="5" width="16" height="15" rx="2"></rect>
              <path d="M8 3v4M16 3v4M4 10h16"></path>
            </svg>
            Última inspeção: {{ formatDate(overview.observedAt) }}
          </span>
          <p
            v-if="overview.status === 'up-to-date' && mutationPlan"
            class="migrations-inline-hint"
          >
            {{ mutationHint }}
          </p>
        </div>

        <div v-else class="migrations-list-grid">
          <section
            v-if="overview.pending.length"
            class="migrations-list-section"
            aria-labelledby="pending-title"
          >
            <div class="migrations-list-heading">
              <h4 id="pending-title">Pendentes</h4>
              <span>{{ overview.pending.length }}</span>
            </div>
            <ul class="migrations-list">
              <li v-for="migration in overview.pending" :key="migration.id">
                <code>{{ migration.id }}</code>
                <span v-if="migration.name">{{ migration.name }}</span>
              </li>
            </ul>
          </section>

          <section
            v-if="overview.applied.length"
            class="migrations-list-section"
            aria-labelledby="applied-title"
          >
            <div class="migrations-list-heading">
              <h4 id="applied-title">Aplicadas</h4>
              <span>{{ overview.applied.length }}</span>
            </div>
            <p v-if="hiddenAppliedCount" class="migrations-list-note">
              Exibindo as {{ visibleApplied.length }} mais recentes de
              {{ overview.applied.length }}.
            </p>
            <ul class="migrations-list">
              <li v-for="migration in visibleApplied" :key="migration.id">
                <code>{{ migration.id }}</code>
                <span v-if="migration.name">{{ migration.name }}</span>
              </li>
            </ul>
          </section>
        </div>

        <div
          v-if="overview.status !== 'unavailable' && overview.warnings.length"
          class="migrations-notes"
          role="note"
        >
          <span v-for="warning in overview.warnings" :key="warning">
            {{ warning }}
          </span>
        </div>

        <section
          v-if="showMutationAction"
          class="migrations-action"
          aria-label="Aplicar migrations"
        >
          <div>
            <strong>{{ mutationMode }}</strong>
            <p>{{ mutationHint }}</p>
          </div>

          <p v-if="mutationError" class="migrations-action-error">
            {{ mutationError }}
          </p>

          <button
            v-if="mutationReady && !mutationRunning"
            class="primary-button"
            type="button"
            :disabled="mutationBusy"
            @click="runMigration"
          >
            {{
              mutationBusy
                ? 'Preparando…'
                : `Aplicar ${overview.pending.length} migration${overview.pending.length === 1 ? '' : 's'}`
            }}
          </button>

          <button
            v-else-if="mutationRunning"
            class="secondary-button"
            type="button"
            :disabled="mutationBusy"
            @click="cancelMutation"
          >
            {{ mutationBusy ? 'Cancelando…' : 'Cancelar execução' }}
          </button>
        </section>
      </section>

      <section
        v-if="mutationSnapshot"
        class="migrations-execution"
        aria-labelledby="migrations-execution-title"
      >
        <div class="migrations-execution-heading">
          <div>
            <span>Execução</span>
            <h4 id="migrations-execution-title">{{ executionLabel }}</h4>
          </div>
          <span>
            {{
              connecting
                ? 'Conectando…'
                : mutationSnapshot.status === 'running'
                  ? 'Saída ao vivo'
                  : `exit ${mutationSnapshot.exitCode ?? '—'}`
            }}
          </span>
        </div>
        <div ref="terminalContainer" class="migrations-terminal"></div>
        <p v-if="mutationSnapshot.truncated" class="migrations-output-note">
          A saída anterior foi truncada pelo limite seguro de retenção.
        </p>
      </section>
    </template>
  </section>
</template>

<style scoped>
.migrations-panel {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: calc(100vh - var(--app-topbar-height, 72px));
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-1);
}

.migrations-panel > :deep(.empty-state) {
  min-height: 0;
  flex: 1 1 auto;
  border: 0;
  border-radius: 0;
  background: var(--surface-1);
}

.migrations-empty h4,
.migrations-empty p,
.migrations-inline-hint,
.migrations-list-heading h4,
.migrations-list-note,
.migrations-action p,
.migrations-execution-heading h4,
.migrations-output-note {
  margin: 0;
}

.migrations-meta {
  display: grid;
  min-height: 62px;
  flex: 0 0 auto;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-1) 96%, var(--surface-2) 4%);
}

.migrations-meta-item {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
}

.migrations-meta-item + .migrations-meta-item {
  border-left: 1px solid var(--border);
}

.migrations-meta-item > svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  fill: none;
  stroke: var(--text-muted);
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.migrations-meta-item > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.migrations-meta-item span,
.migrations-counts span,
.migrations-execution-heading > div > span {
  color: var(--text-dim);
  font-size: 8px;
  font-weight: var(--font-weight-strong);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.migrations-meta-item strong {
  overflow: hidden;
  color: var(--text);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.migrations-meta-item--status {
  gap: 9px;
}

.migrations-status-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--text-muted);
}

.migrations-status-dot--up-to-date {
  background: var(--success-text);
}

.migrations-status-dot--pending {
  background: var(--warning-text);
}

.migrations-status-dot--unavailable {
  background: var(--danger-text);
}

.migrations-counts {
  display: grid;
  min-height: 54px;
  flex: 0 0 auto;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-bottom: 1px solid var(--border);
}

.migrations-counts > div {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 14px;
}

.migrations-counts > div + div {
  border-left: 1px solid var(--border);
}

.migrations-counts span {
  color: var(--text-muted);
  letter-spacing: 0;
  text-transform: none;
}

.migrations-counts strong {
  color: var(--text);
  font-size: 18px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.migrations-content {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  overflow: hidden;
}

.migrations-empty {
  display: grid;
  min-height: 0;
  flex: 1 1 auto;
  place-content: center;
  justify-items: center;
  gap: 8px;
  padding: 28px 18px;
  text-align: center;
}

.migrations-empty-icon {
  display: grid;
  width: 46px;
  height: 46px;
  margin-bottom: 4px;
  place-items: center;
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-2);
}

.migrations-empty-icon svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentcolor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.migrations-empty h4 {
  color: var(--text);
  font-size: 13px;
}

.migrations-empty > p,
.migrations-inline-hint {
  max-width: 620px;
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.45;
}

.migrations-observed-at {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-dim);
  font-size: 9px;
}

.migrations-observed-at svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentcolor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.migrations-list-grid {
  display: grid;
  min-height: 0;
  flex: 1 1 auto;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  overflow: auto;
}

.migrations-list-section {
  min-width: 0;
  padding: 0 12px 12px;
}

.migrations-list-section + .migrations-list-section {
  border-left: 1px solid var(--border);
}

.migrations-list-heading {
  position: sticky;
  z-index: 2;
  top: 0;
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-1);
}

.migrations-list-heading h4 {
  color: var(--text);
  font-size: 10px;
}

.migrations-list-heading span,
.migrations-list-note {
  color: var(--text-muted);
  font-size: 9px;
}

.migrations-list-note {
  padding: 8px 0 2px;
}

.migrations-list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.migrations-list li {
  display: grid;
  grid-template-columns: minmax(8rem, auto) 1fr;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 10px;
}

.migrations-list code {
  overflow-wrap: anywhere;
  color: var(--text);
  font-size: 9px;
}

.migrations-list li > span {
  color: var(--text-muted);
}

.migrations-notes {
  display: grid;
  flex: 0 0 auto;
  gap: 3px;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  background: var(--surface-2);
  font-size: 9px;
}

.migrations-action {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-1) 96%, var(--surface-2) 4%);
}

.migrations-action > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.migrations-action strong {
  color: var(--text);
  font-size: 10px;
}

.migrations-action p {
  color: var(--text-muted);
  font-size: 9px;
  line-height: 1.4;
}

.migrations-action-error {
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  color: var(--danger-text) !important;
  background: var(--danger-surface);
  font-size: 9px;
}

.migrations-action button {
  min-height: 34px;
  flex: 0 0 auto;
  font-size: 10px;
}

.migrations-execution {
  display: flex;
  min-height: 240px;
  max-height: 42vh;
  flex: 0 0 auto;
  flex-direction: column;
  overflow: hidden;
  border-top: 1px solid var(--border);
  background: var(--surface-0);
}

.migrations-execution-heading {
  display: flex;
  min-height: 44px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}

.migrations-execution-heading > div {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 8px;
}

.migrations-execution-heading h4 {
  color: var(--text);
  font-size: 10px;
}

.migrations-execution-heading > span {
  color: var(--text-muted);
  font-size: 9px;
}

.migrations-terminal {
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1 1 0;
  box-sizing: border-box;
  overflow: hidden;
  padding: 12px 14px 16px;
  background: #10131c;
}

.migrations-terminal :global(.xterm) {
  width: 100%;
  height: 100%;
}

.migrations-terminal :global(.xterm-viewport) {
  background-color: #10131c !important;
  scrollbar-width: none;
}

.migrations-terminal :global(.xterm-viewport::-webkit-scrollbar) {
  display: none;
}

.migrations-output-note {
  flex: 0 0 auto;
  padding: 7px 12px;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 9px;
}

@media (max-width: 900px) {
  .migrations-meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .migrations-meta-item:nth-child(3) {
    border-left: 0;
  }

  .migrations-meta-item:nth-child(n + 3) {
    border-top: 1px solid var(--border);
  }

  .migrations-list-grid {
    grid-template-columns: 1fr;
  }

  .migrations-list-section + .migrations-list-section {
    border-top: 1px solid var(--border);
    border-left: 0;
  }
}

@media (max-width: 640px) {
  .migrations-meta {
    grid-template-columns: 1fr;
  }

  .migrations-meta-item + .migrations-meta-item,
  .migrations-meta-item:nth-child(3) {
    border-top: 1px solid var(--border);
    border-left: 0;
  }

  .migrations-counts {
    grid-template-columns: 1fr;
  }

  .migrations-counts > div + div {
    border-top: 1px solid var(--border);
    border-left: 0;
  }

  .migrations-list li {
    grid-template-columns: 1fr;
    gap: 2px;
  }

  .migrations-action {
    align-items: stretch;
    flex-direction: column;
  }

  .migrations-action button {
    width: 100%;
  }

  .migrations-execution {
    max-height: 50vh;
  }

  .migrations-execution-heading {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
