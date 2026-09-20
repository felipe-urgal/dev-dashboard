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
import StatusBadge from './StatusBadge.vue';
import type { StatusBadgeTone } from './status-badge-types';

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
  <section class="migrations-panel" aria-labelledby="migrations-title">
    <header class="migrations-header">
      <div>
        <span class="migrations-eyebrow">Banco de dados</span>
        <h3 id="migrations-title">Migrations</h3>
        <p>
          Inspeção comum com execução protegida por preflight, confirmação e
          revalidação do ambiente.
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
              <dd>{{ mutationMode }}</dd>
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

          <section class="migrations-mutation" aria-label="Aplicar migrations">
            <div>
              <strong>Aplicação</strong>
              <p>{{ mutationHint }}</p>
            </div>

            <p v-if="mutationError" class="migrations-mutation-error">
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
        </aside>
      </div>

      <section
        v-if="mutationSnapshot"
        class="migrations-execution"
        aria-labelledby="migrations-execution-title"
      >
        <div class="migrations-execution-heading">
          <div>
            <span class="migrations-context-eyebrow">Execução</span>
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
.migrations-mutation p,
.migrations-execution-heading h4,
.migrations-output-note {
  margin: 0;
}

.migrations-header h3,
.migrations-execution-heading h4 {
  margin-top: var(--space-1);
}

.migrations-header p,
.migrations-timeline-heading p,
.migrations-empty-copy,
.migrations-inspection-date,
.migrations-mutation p,
.migrations-output-note,
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

.migrations-mutation {
  display: grid;
  gap: var(--space-3);
  padding-top: var(--space-2);
}

.migrations-mutation > div {
  display: grid;
  gap: var(--space-1);
}

.migrations-mutation button {
  width: 100%;
}

.migrations-mutation-error {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--danger-surface);
  color: var(--danger-text) !important;
}

.migrations-execution {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.migrations-execution-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}

.migrations-execution-heading > span {
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.migrations-terminal {
  box-sizing: border-box;
  width: 100%;
  min-height: 260px;
  height: 320px;
  padding: var(--space-3);
  overflow: hidden;
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
  padding: var(--space-2) var(--space-4);
  border-top: 1px solid var(--border);
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
  .migrations-mutation {
    grid-column: 1 / -1;
  }
}

@media (max-width: 640px) {
  .migrations-state,
  .migrations-execution-heading {
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

  .migrations-terminal {
    height: 260px;
  }
}
</style>
