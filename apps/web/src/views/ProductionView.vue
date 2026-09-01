<script setup lang="ts">
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/vue/24/outline';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import type {
  DeploymentProviderAvailability,
  ProductionOverview,
  ProductionOverviewHealth,
  ProductionOverviewItem,
  ProductionOverviewState,
  ProductionProvider,
} from '@dev-dashboard/contracts';

import { fetchProductionOverview } from '../api';
import LoadingSkeleton from '../components/LoadingSkeleton.vue';
import StatusBadge from '../components/StatusBadge.vue';
import { dashboardStore } from '../stores/dashboard';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const overview = ref<ProductionOverview | null>(null);
const loading = ref(false);
const errorMessage = ref('');
let requestController: AbortController | undefined;
let generation = 0;

const workspaceId = dashboardStore.selectedWorkspaceId;

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
      ['failed', 'recovery-required', 'blocked', 'unknown'].includes(item.state),
    ).length,
);

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

watch(workspaceId, () => {
  void loadOverview();
});

onMounted(async () => {
  await dashboardStore.ensureDashboardLoaded();
  await loadOverview();
});

onBeforeUnmount(() => {
  requestController?.abort();
});
</script>

<template>
  <section
    class="content production-overview-page"
    :aria-busy="loading"
    aria-label="Produção do workspace"
  >
    <div class="production-overview-actions">
      <button
        type="button"
        class="production-overview-refresh"
        :disabled="loading || !workspaceId"
        @click="loadOverview"
      >
        <ArrowPathIcon :class="{ spinning: loading }" aria-hidden="true" />
        {{ loading ? 'Atualizando…' : 'Atualizar' }}
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

    <p v-if="errorMessage" class="activity-error" role="alert">
      {{ errorMessage }}
      <button type="button" @click="loadOverview">Tentar novamente</button>
    </p>

    <LoadingSkeleton
      v-if="loading && !overview"
      label="Carregando produção…"
      :rows="4"
    />

    <div
      v-else-if="!workspaceId"
      class="activity-empty"
      role="status"
    >
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
              <small v-if="providerAvailabilityLabel(item.providerAvailability)">
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
}

.production-overview-refresh {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.production-overview-refresh svg,
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
  background: var(--surface);
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
  background: var(--surface-hover);
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
  .production-overview-summary {
    grid-template-columns: 1fr;
  }

  .production-overview-refresh {
    width: 100%;
    justify-content: center;
  }
}
</style>
