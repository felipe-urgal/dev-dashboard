<script setup lang="ts">
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  PlayIcon,
} from '@heroicons/vue/24/outline';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

import type {
  DeploymentProviderAvailability,
  ProductionOverview,
  ProductionOverviewHealth,
  ProductionOverviewItem,
  ProductionOverviewState,
  ProductionProvider,
} from '@dev-dashboard/contracts';

import {
  createDeploymentConfirmation,
  fetchDeployment,
  fetchDeploymentPlan,
  fetchProductionOverview,
  startDeployment,
} from '../api';
import LoadingSkeleton from '../components/LoadingSkeleton.vue';
import StatusBadge from '../components/StatusBadge.vue';
import {
  executeProductionBatch,
  prepareProductionBatch,
  type ProductionBatchApi,
  type ProductionBatchItem,
  type ProductionBatchItemStatus,
} from '../production-update-batch';
import { dashboardStore } from '../stores/dashboard';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
type BatchPhase = 'idle' | 'planning' | 'preview' | 'running' | 'finished';

const overview = ref<ProductionOverview | null>(null);
const loading = ref(false);
const errorMessage = ref('');
const batchPhase = ref<BatchPhase>('idle');
const batchItems = ref<ProductionBatchItem[]>([]);
const batchError = ref('');
const batchHeading = ref<HTMLElement | null>(null);
let requestController: AbortController | undefined;
let batchController: AbortController | undefined;
let generation = 0;

const workspaceId = dashboardStore.selectedWorkspaceId;
const scanningWorkspace = dashboardStore.scanningWorkspace;

const items = computed(() => overview.value?.items ?? []);
const inSyncCount = computed(
  () => items.value.filter((item) => item.state === 'in-sync').length,
);
const pendingCount = computed(
  () => items.value.filter((item) => item.state === 'drift').length,
);
const runningCount = computed(
  () => items.value.filter((item) => item.state === 'running').length,
);
const attentionCount = computed(
  () =>
    items.value.filter((item) =>
      ['failed', 'recovery-required', 'blocked', 'unknown'].includes(
        item.state,
      ),
    ).length,
);
const batchBusy = computed(
  () => batchPhase.value === 'planning' || batchPhase.value === 'running',
);
const readyBatchCount = computed(
  () => batchItems.value.filter((item) => item.status === 'ready').length,
);
const canPreparePending = computed(
  () =>
    batchPhase.value === 'idle' &&
    pendingCount.value > 0 &&
    Boolean(workspaceId.value) &&
    !loading.value &&
    !scanningWorkspace.value,
);

const batchApi: ProductionBatchApi = {
  fetchPlan: fetchDeploymentPlan,
  createConfirmation: createDeploymentConfirmation,
  startDeployment,
  fetchDeployment,
};

function stateLabel(state: ProductionOverviewState): string {
  const labels: Record<ProductionOverviewState, string> = {
    'in-sync': 'Atualizada',
    drift: 'Pendente',
    running: 'Executando',
    failed: 'Falhou',
    'recovery-required': 'Recuperação',
    'not-configured': 'Não configurada',
    blocked: 'Bloqueada',
    unknown: 'Desconhecida',
  };
  return labels[state];
}

function stateTone(state: ProductionOverviewState): Tone {
  if (state === 'in-sync') return 'success';
  if (state === 'drift' || state === 'blocked') return 'warning';
  if (state === 'running') return 'info';
  if (state === 'failed' || state === 'recovery-required') return 'danger';
  return 'neutral';
}

function healthLabel(health: ProductionOverviewHealth): string {
  const labels: Record<ProductionOverviewHealth, string> = {
    verified: 'Verify passou',
    'verify-failed': 'Verify falhou',
    unknown: 'Não verificado',
    'not-configured': 'Sem health',
  };
  return labels[health];
}

function healthTone(health: ProductionOverviewHealth): Tone {
  if (health === 'verified') return 'success';
  if (health === 'verify-failed') return 'danger';
  return 'neutral';
}

function providerLabel(provider: ProductionProvider | undefined): string {
  const labels: Record<ProductionProvider, string> = {
    systemd: 'systemd',
    'docker-compose': 'Docker Compose',
    vercel: 'Vercel',
    none: '—',
  };
  return provider ? labels[provider] : '—';
}

function providerAvailabilityLabel(
  availability: DeploymentProviderAvailability | undefined,
): string {
  if (!availability || availability === 'available') return '';
  const labels: Record<DeploymentProviderAvailability, string> = {
    available: '',
    'not-configured': 'não configurado',
    'auth-error': 'autenticação',
    'quota-limited': 'cota limitada',
    'project-not-found': 'projeto não encontrado',
    unavailable: 'indisponível',
    'invalid-response': 'resposta inválida',
  };
  return labels[availability];
}

function batchStatusLabel(status: ProductionBatchItemStatus): string {
  const labels: Record<ProductionBatchItemStatus, string> = {
    ready: 'Pronto',
    skipped: 'Ignorado',
    queued: 'Na fila',
    running: 'Executando',
    succeeded: 'Concluído',
    failed: 'Falhou',
    cancelled: 'Cancelado',
    'recovery-required': 'Recuperação',
    'not-started': 'Não iniciado',
  };
  return labels[status];
}

function batchStatusTone(status: ProductionBatchItemStatus): Tone {
  if (status === 'succeeded') return 'success';
  if (status === 'failed' || status === 'recovery-required') return 'danger';
  if (status === 'skipped' || status === 'cancelled') return 'warning';
  if (status === 'ready' || status === 'running') return 'info';
  return 'neutral';
}

function batchStepLabel(stepId: string): string {
  const labels: Record<string, string> = {
    status: 'Status',
    check: 'Check',
    backup: 'Backup',
    migrate: 'Migration',
    deploy: 'Deploy',
    verify: 'Verify',
    restoreCheck: 'Restore check',
    rollback: 'Rollback',
    logs: 'Logs',
    'provider-deploy': 'Deploy Vercel',
  };
  return labels[stepId] ?? stepId;
}

function shortRevision(revision: string | undefined): string {
  return revision ? revision.slice(0, 8) : '—';
}

function revisionTitle(item: ProductionOverviewItem): string {
  const revision = item.productionRevision;
  return revision ?? 'Revision de produção desconhecida';
}

function targetTitle(item: ProductionOverviewItem): string {
  const revision = item.targetRevision ?? item.originRevision;
  return revision ?? 'Revision alvo desconhecida';
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function resetBatch(abort = true): void {
  if (abort) batchController?.abort();
  batchController = undefined;
  batchPhase.value = 'idle';
  batchItems.value = [];
  batchError.value = '';
}

async function loadOverview(): Promise<void> {
  const currentWorkspaceId = workspaceId.value;
  generation += 1;
  const currentGeneration = generation;
  requestController?.abort();
  requestController = new AbortController();
  errorMessage.value = '';

  if (!currentWorkspaceId) {
    overview.value = null;
    loading.value = false;
    return;
  }

  if (scanningWorkspace.value) {
    overview.value = null;
    loading.value = false;
    return;
  }

  loading.value = true;
  try {
    const result = await fetchProductionOverview(
      currentWorkspaceId,
      requestController.signal,
    );
    if (currentGeneration === generation) overview.value = result;
  } catch (error) {
    if (currentGeneration !== generation || isAbortError(error)) return;
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível carregar o estado de produção.';
  } finally {
    if (currentGeneration === generation) loading.value = false;
  }
}

async function preparePending(): Promise<void> {
  if (!canPreparePending.value) return;
  batchController?.abort();
  batchController = new AbortController();
  batchPhase.value = 'planning';
  batchItems.value = [];
  batchError.value = '';

  try {
    batchItems.value = await prepareProductionBatch(
      items.value,
      batchApi,
      batchController.signal,
    );
    batchPhase.value = 'preview';
    await nextTick();
    batchHeading.value?.focus();
  } catch (error) {
    if (batchController.signal.aborted || isAbortError(error)) return;
    batchError.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível preparar os deployments pendentes.';
    batchPhase.value = 'preview';
  }
}

async function confirmPending(): Promise<void> {
  if (batchPhase.value !== 'preview' || readyBatchCount.value === 0) return;
  batchController?.abort();
  batchController = new AbortController();
  const currentController = batchController;
  batchPhase.value = 'running';
  batchError.value = '';

  try {
    batchItems.value = await executeProductionBatch(
      batchItems.value,
      batchApi,
      {
        signal: currentController.signal,
        onUpdate: (nextItems) => {
          if (batchController === currentController)
            batchItems.value = nextItems;
        },
      },
    );
    if (batchController !== currentController) return;
    batchPhase.value = 'finished';
    batchController = undefined;
    await loadOverview();
  } catch (error) {
    if (currentController.signal.aborted || isAbortError(error)) return;
    batchError.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível concluir a atualização dos projetos pendentes.';
    batchPhase.value = 'finished';
    batchController = undefined;
    await loadOverview();
  }
}

watch(workspaceId, () => {
  resetBatch();
  overview.value = null;
  void loadOverview();
});

watch(scanningWorkspace, (scanning, wasScanning) => {
  if (wasScanning && !scanning) {
    void loadOverview();
  }
});

onMounted(async () => {
  await dashboardStore.ensureDashboardLoaded();
  await loadOverview();
});

onBeforeUnmount(() => {
  requestController?.abort();
  batchController?.abort();
});
</script>

<template>
  <section
    class="content production-overview-page"
    :aria-busy="loading || scanningWorkspace || batchBusy"
    aria-label="Produção do workspace"
  >
    <div class="production-overview-actions">
      <button
        type="button"
        class="production-overview-batch"
        :disabled="!canPreparePending"
        @click="preparePending"
      >
        <PlayIcon aria-hidden="true" />
        {{
          batchPhase === 'planning'
            ? 'Preparando…'
            : batchPhase === 'running'
              ? 'Atualizando…'
              : 'Atualizar pendentes'
        }}
      </button>
      <button
        type="button"
        class="production-overview-refresh"
        :disabled="loading || scanningWorkspace || batchBusy || !workspaceId"
        @click="loadOverview"
      >
        <ArrowPathIcon
          :class="{ spinning: loading || scanningWorkspace }"
          aria-hidden="true"
        />
        {{ loading || scanningWorkspace ? 'Atualizando…' : 'Atualizar' }}
      </button>
    </div>

    <dl
      v-if="overview"
      class="production-overview-summary"
      aria-label="Resumo de produção"
    >
      <div>
        <dt>Atualizadas</dt>
        <dd>{{ inSyncCount }}</dd>
      </div>
      <div>
        <dt>Pendentes</dt>
        <dd>{{ pendingCount }}</dd>
      </div>
      <div>
        <dt>Executando</dt>
        <dd>{{ runningCount }}</dd>
      </div>
      <div>
        <dt>Atenção</dt>
        <dd>{{ attentionCount }}</dd>
      </div>
    </dl>

    <section
      v-if="batchPhase !== 'idle'"
      class="production-batch-panel"
      aria-labelledby="production-batch-title"
    >
      <header class="production-batch-header">
        <div>
          <span>Atualizar pendentes</span>
          <h2 id="production-batch-title" ref="batchHeading" tabindex="-1">
            {{
              batchPhase === 'planning'
                ? 'Calculando todos os planos…'
                : batchPhase === 'preview'
                  ? 'Revise o lote antes de confirmar'
                  : batchPhase === 'running'
                    ? 'Atualização em andamento'
                    : 'Resultado da atualização'
            }}
          </h2>
        </div>
        <StatusBadge v-if="batchPhase === 'preview'" tone="info">
          {{ readyBatchCount }}
          {{ readyBatchCount === 1 ? 'projeto' : 'projetos' }}
        </StatusBadge>
      </header>

      <p
        v-if="batchPhase === 'planning'"
        class="production-batch-status"
        role="status"
      >
        Gerando os planos elegíveis antes de qualquer confirmação ou mutação.
      </p>

      <p v-if="batchError" class="activity-error" role="alert">
        {{ batchError }}
      </p>

      <ol v-if="batchItems.length" class="production-batch-list">
        <li v-for="(item, index) in batchItems" :key="item.projectId">
          <div class="production-batch-row">
            <span class="production-batch-order" aria-hidden="true">{{
              index + 1
            }}</span>
            <div class="production-batch-project">
              <strong>{{ item.projectName }}</strong>
              <small v-if="item.plan">
                {{ providerLabel(item.plan.provider) }} ·
                {{ item.plan.branch }} ·
                <code :title="item.plan.revision">{{
                  shortRevision(item.plan.revision)
                }}</code>
              </small>
            </div>
            <StatusBadge :tone="batchStatusTone(item.status)">
              {{ batchStatusLabel(item.status) }}
            </StatusBadge>
          </div>

          <ul v-if="item.plan?.steps.length" class="production-batch-steps">
            <li v-for="step in item.plan.steps" :key="step.id">
              {{ batchStepLabel(step.id) }}
            </li>
          </ul>

          <small v-if="item.message" class="production-batch-message">
            {{ item.message }}
          </small>
        </li>
      </ol>

      <div
        v-if="batchPhase === 'preview' && batchItems.length === 0"
        class="activity-empty"
        role="status"
      >
        Nenhum projeto pendente possui plano elegível neste momento.
      </div>

      <p v-if="batchPhase === 'preview'" class="production-batch-note">
        Todos os planos acima foram calculados antes da confirmação. A execução
        segue esta ordem, um projeto por vez, e para na primeira falha,
        cancelamento ou estado de recuperação.
      </p>

      <div v-if="batchPhase === 'preview'" class="production-batch-actions">
        <button type="button" @click="resetBatch()">Cancelar</button>
        <button
          type="button"
          :disabled="readyBatchCount === 0"
          @click="confirmPending"
        >
          Confirmar e atualizar {{ readyBatchCount }}
        </button>
      </div>

      <div
        v-else-if="batchPhase === 'finished'"
        class="production-batch-actions"
      >
        <button type="button" @click="resetBatch(false)">
          Fechar resultado
        </button>
      </div>
    </section>

    <p v-if="errorMessage" class="activity-error" role="alert">
      {{ errorMessage }}
      <button type="button" @click="loadOverview">Tentar novamente</button>
    </p>

    <LoadingSkeleton
      v-if="(loading || scanningWorkspace) && !overview"
      label="Carregando produção…"
      :rows="4"
    />

    <div v-else-if="!workspaceId" class="activity-empty" role="status">
      Selecione um workspace para consultar produção.
    </div>

    <div
      v-else-if="overview && overview.items.length === 0"
      class="activity-empty"
      role="status"
    >
      Nenhum projeto foi detectado neste workspace.
    </div>

    <div v-else-if="overview" class="production-overview-table-shell">
      <table class="production-overview-table">
        <caption class="sr-only">
          Estado agregado de produção dos projetos do workspace
        </caption>
        <thead>
          <tr>
            <th scope="col">Projeto</th>
            <th scope="col">Provider</th>
            <th scope="col">Branch</th>
            <th scope="col">Produção</th>
            <th scope="col">Alvo</th>
            <th scope="col">Health</th>
            <th scope="col">Estado</th>
            <th scope="col"><span class="sr-only">Abrir</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in overview.items" :key="item.projectId">
            <td data-label="Projeto">
              <RouterLink
                class="production-overview-project"
                :to="{
                  name: 'project-production',
                  params: { projectId: item.projectId },
                }"
              >
                {{ item.projectName }}
              </RouterLink>
              <small v-if="item.errorMessage" :title="item.errorMessage">
                {{ item.errorMessage }}
              </small>
            </td>
            <td data-label="Provider">
              <span>{{ providerLabel(item.provider) }}</span>
              <small
                v-if="providerAvailabilityLabel(item.providerAvailability)"
              >
                {{ providerAvailabilityLabel(item.providerAvailability) }}
              </small>
            </td>
            <td data-label="Branch">
              <code>{{ item.branch ?? '—' }}</code>
            </td>
            <td data-label="Produção">
              <code :title="revisionTitle(item)">{{
                shortRevision(item.productionRevision)
              }}</code>
            </td>
            <td data-label="Alvo">
              <code :title="targetTitle(item)">{{
                shortRevision(item.targetRevision ?? item.originRevision)
              }}</code>
            </td>
            <td data-label="Health">
              <StatusBadge :tone="healthTone(item.health)">
                {{ healthLabel(item.health) }}
              </StatusBadge>
            </td>
            <td data-label="Estado">
              <StatusBadge :tone="stateTone(item.state)">
                {{ stateLabel(item.state) }}
              </StatusBadge>
            </td>
            <td class="production-overview-open" data-label="Abrir">
              <RouterLink
                :to="{
                  name: 'project-production',
                  params: { projectId: item.projectId },
                }"
                :aria-label="`Abrir produção de ${item.projectName}`"
                :title="`Abrir produção de ${item.projectName}`"
              >
                <ArrowTopRightOnSquareIcon aria-hidden="true" />
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="overview" class="production-overview-footnote">
      Revision/provider e último verify são evidências separadas. Provider READY
      não significa health funcional atual.
    </p>
  </section>
</template>

<style scoped>
.production-overview-page {
  display: grid;
  gap: 14px;
}

.production-overview-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.production-overview-refresh,
.production-overview-batch {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.production-overview-refresh svg,
.production-overview-batch svg,
.production-overview-open svg {
  width: 16px;
  height: 16px;
}

.production-overview-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.production-overview-summary > div {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-1);
}

.production-overview-summary dt {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.production-overview-summary dd {
  margin: 4px 0 0;
  font-size: 20px;
  font-weight: 800;
}

.production-batch-panel {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-1);
}

.production-batch-header,
.production-batch-row,
.production-batch-actions {
  display: flex;
  align-items: center;
}

.production-batch-header {
  justify-content: space-between;
  gap: 12px;
}

.production-batch-header span {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.production-batch-header h2 {
  margin: 2px 0 0;
  font-size: 15px;
}

.production-batch-header h2:focus {
  outline: none;
}

.production-batch-status,
.production-batch-note {
  margin: 0;
  color: var(--text-muted);
  font-size: 11px;
}

.production-batch-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.production-batch-list > li {
  display: grid;
  gap: 7px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface-2);
}

.production-batch-row {
  gap: 9px;
}

.production-batch-order {
  display: inline-flex;
  flex: 0 0 24px;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  border: 1px solid var(--border);
  border-radius: 50%;
}

.production-batch-project {
  display: grid;
  flex: 1;
  min-width: 0;
  gap: 2px;
}

.production-batch-project strong {
  font-size: 12px;
}

.production-batch-project small,
.production-batch-message {
  color: var(--text-muted);
  font-size: 10px;
}

.production-batch-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 0 0 0 33px;
  padding: 0;
  list-style: none;
}

.production-batch-steps li {
  padding: 3px 6px;
  color: var(--text-muted);
  font-size: 10px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface-1);
}

.production-batch-message {
  margin-left: 33px;
}

.production-batch-actions {
  justify-content: flex-end;
  gap: 8px;
}

.production-overview-table-shell {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.production-overview-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.production-overview-table th,
.production-overview-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: middle;
  white-space: nowrap;
}

.production-overview-table tbody tr:last-child td {
  border-bottom: 0;
}

.production-overview-table th {
  color: var(--text-muted);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.production-overview-table td:first-child {
  min-width: 190px;
  white-space: normal;
}

.production-overview-table td small {
  display: block;
  max-width: 280px;
  margin-top: 3px;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-overview-project {
  color: var(--text);
  font-weight: 700;
  text-decoration: none;
}

.production-overview-project:hover,
.production-overview-project:focus-visible {
  color: var(--accent);
}

.production-overview-open {
  width: 42px;
  text-align: right !important;
}

.production-overview-open a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px;
  color: var(--text-muted);
  border-radius: 6px;
}

.production-overview-open a:hover,
.production-overview-open a:focus-visible {
  color: var(--accent);
  background: var(--surface-2);
}

.production-overview-footnote {
  margin: 0;
  color: var(--text-muted);
  font-size: 11px;
}

@media (max-width: 760px) {
  .production-overview-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 480px) {
  .production-overview-actions,
  .production-batch-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .production-overview-summary {
    grid-template-columns: 1fr;
  }

  .production-overview-refresh,
  .production-overview-batch {
    width: 100%;
    justify-content: center;
  }

  .production-batch-header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
