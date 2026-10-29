<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';
import { routerKey } from 'vue-router';
import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  RocketLaunchIcon,
} from '@heroicons/vue/24/outline';

import type {
  Deployment,
  DeploymentLog,
  DeploymentPendingChanges,
  DeploymentPlan,
  Project,
  ProjectGitOverview,
  TestExecutionRecord,
} from '@dev-dashboard/contracts';

import {
  createDeploymentConfirmation,
  fetchDeployment,
  fetchDeploymentChanges,
  fetchDeploymentCommits,
  fetchDeploymentHistory,
  fetchDeploymentLog,
  fetchDeploymentPlan,
  fetchProjectTestHistory,
  startDeployment,
} from '../api';
import ProductionChanges from './production/ProductionChanges.vue';
import ProductionHistory, {
  type ProductionHistoryItem,
} from './production/ProductionHistory.vue';
import ProductionPlanPanel, {
  type ProductionPlanStepView,
} from './production/ProductionPlanPanel.vue';
import ProductionReadiness from './production/ProductionReadiness.vue';
import ProductionStatusHeader from './production/ProductionStatusHeader.vue';
import ProductionTimeline, {
  type ProductionTimelineStep,
} from './production/ProductionTimeline.vue';
import ProjectLogViewer from './ProjectLogViewer.vue';
import UiButton from './ui/UiButton.vue';
import { buildProductionReadiness } from '../utils/production-readiness';

interface Props {
  project: Project;
  gitOverview?: ProjectGitOverview | null;
}

const props = withDefaults(defineProps<Props>(), { gitOverview: null });

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TERMINAL = new Set<Deployment['status']>([
  'succeeded',
  'failed',
  'recovery_required',
  'cancelled',
]);

const loading = ref(false);
const operation = ref<'planning' | 'starting' | ''>('');
const reconnecting = ref(false);
const errorMessage = ref('');
const plan = ref<DeploymentPlan | null>(null);
const latest = ref<Deployment | null>(null);
const history = ref<Deployment[]>([]);
const changes = ref<DeploymentPendingChanges | null>(null);
const changesLoading = ref(false);
const commitSubjects = ref<Record<string, string>>({});
const testRuns = ref<TestExecutionRecord[] | null>(null);
const router = inject(routerKey, null);
const log = ref<DeploymentLog | null>(null);

let generation = 0;
let timer: number | undefined;
let controller: AbortController | undefined;

function clearTimer(): void {
  if (timer !== undefined) {
    window.clearTimeout(timer);
    timer = undefined;
  }
}

function schedulePoll(current: number, delay = 900): void {
  clearTimer();
  timer = window.setTimeout(() => void poll(current), delay);
}

function shortRevision(value: string | undefined): string {
  return value ? value.slice(0, 10) : '—';
}

function formatDate(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function formatDuration(deployment: Deployment): string {
  if (!deployment.startedAt || !deployment.finishedAt) return '—';
  const start = new Date(deployment.startedAt).getTime();
  const finish = new Date(deployment.finishedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(finish) || finish < start) {
    return '—';
  }
  const seconds = Math.round((finish - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes} min ${remaining.toString().padStart(2, '0')} s`;
}

function shouldPoll(deployment: Deployment | null): boolean {
  if (!deployment) return false;
  if (!TERMINAL.has(deployment.status)) return true;
  return (
    deployment.currentStepId === 'self-update' &&
    deployment.status === 'recovery_required' &&
    deployment.errorCode === 'DEPLOYMENT_INTERRUPTED'
  );
}

function executionTone(deployment: Deployment): Tone {
  if (deployment.status === 'succeeded') return 'success';
  if (
    deployment.status === 'failed' ||
    deployment.status === 'recovery_required'
  ) {
    return 'danger';
  }
  if (deployment.status === 'cancelled') return 'warning';
  return 'info';
}

function executionTitle(deployment: Deployment): string {
  if (deployment.status === 'succeeded')
    return 'Self-update aplicado com sucesso.';
  if (deployment.status === 'failed') return 'Self-update não foi aplicado.';
  if (deployment.status === 'recovery_required')
    return 'Self-update requer revisão.';
  if (deployment.status === 'cancelled') return 'Self-update cancelado.';
  return 'Self-update em execução.';
}

function executionStatusLabel(deployment: Deployment): string {
  if (deployment.status === 'succeeded') return 'Concluído';
  if (deployment.status === 'failed') return 'Falhou';
  if (deployment.status === 'recovery_required') return 'Requer revisão';
  if (deployment.status === 'cancelled') return 'Cancelado';
  return 'Em execução';
}

function stepStatusLabel(
  status: Deployment['timeline'][number]['status'],
): string {
  if (status === 'succeeded') return 'Concluída';
  if (status === 'failed') return 'Falhou';
  if (status === 'cancelled') return 'Cancelada';
  if (status === 'running') return 'Em execução';
  return 'Pendente';
}

function stepLabel(id: string): string {
  if (id === 'check') return 'Check do agent';
  if (id === 'self-update') return 'Self-update';
  return id;
}

const status = computed(() => {
  const deployment = latest.value;
  if (!deployment) {
    return {
      title: 'Self-update disponível',
      description:
        'Contrato fechado e agente de atualização disponível. O ambiente está pronto para aplicar novas versões com confirmação explícita.',
      detail: 'Nenhuma execução registrada ainda.',
      tone: 'info' as Tone,
    };
  }
  if (deployment.status === 'succeeded') {
    return {
      title: 'Self-update disponível',
      description:
        'Contrato fechado e agente de atualização disponível. O ambiente está pronto para aplicar novas versões com confirmação explícita.',
      detail: `Última execução concluída em ${formatDate(deployment.finishedAt ?? deployment.createdAt)}.`,
      tone: 'success' as Tone,
    };
  }
  if (deployment.status === 'recovery_required') {
    return {
      title: 'Self-update requer revisão',
      description:
        deployment.errorMessage ??
        'A mutação pode ter iniciado sem uma conclusão segura comprovada.',
      detail: 'Revise a última execução antes de gerar outro plano.',
      tone: 'danger' as Tone,
    };
  }
  if (deployment.status === 'failed') {
    return {
      title: 'Self-update não foi aplicado',
      description:
        deployment.errorMessage ??
        'A execução falhou antes de comprovar uma atualização segura.',
      detail: `Última tentativa em ${formatDate(deployment.createdAt)}.`,
      tone: 'danger' as Tone,
    };
  }
  if (deployment.status === 'cancelled') {
    return {
      title: 'Self-update disponível',
      description:
        'A última execução foi cancelada. O ambiente continua disponível para gerar um novo plano.',
      detail: `Última tentativa em ${formatDate(deployment.createdAt)}.`,
      tone: 'warning' as Tone,
    };
  }
  return {
    title: reconnecting.value ? 'API reiniciando…' : 'Self-update em execução',
    description:
      'O worker externo assumiu a operação. A página reconcilia o resultado quando a API responder novamente.',
    detail: reconnecting.value
      ? 'Aguardando a nova API ficar pronta.'
      : 'Atualização em andamento.',
    tone: 'info' as Tone,
  };
});

const currentRevision = computed(() => {
  const successful = history.value.find((item) => item.status === 'succeeded');
  return successful?.revision ?? latest.value?.revision;
});

const historyItems = computed<ProductionHistoryItem[]>(() =>
  history.value.map((item) => ({
    id: item.id,
    revision: item.revision,
    subject: commitSubjects.value[item.revision],
    statusLabel: executionStatusLabel(item),
    tone: executionTone(item),
    when: formatDate(item.createdAt),
    duration: formatDuration(item),
  })),
);

const planSteps = computed<ProductionPlanStepView[]>(() =>
  (plan.value?.steps ?? []).map((step) => ({
    id: step.id,
    label: stepLabel(step.id),
    script:
      step.id === 'self-update' ? 'reinicia a própria API' : 'somente leitura',
    mutating: step.mutating,
    irreversible: step.irreversible,
  })),
);

const timelineSteps = computed<ProductionTimelineStep[]>(() =>
  (latest.value?.timeline ?? []).map((step) => ({
    id: step.id,
    label: stepLabel(step.id),
    status: step.status,
    statusLabel: stepStatusLabel(step.status),
  })),
);

const headerFacts = computed(() => [
  {
    label: 'Revisão atual',
    value: shortRevision(currentRevision.value),
    mono: true,
    ...(currentRevision.value ? { title: currentRevision.value } : {}),
  },
  { label: 'Última execução', value: formatDate(latest.value?.createdAt) },
  { label: 'Branch', value: props.project.production?.branch ?? 'main' },
]);

const publishLabel = computed(() => {
  if (operation.value === 'planning') return 'Preparando…';
  const data = changes.value;
  if (data?.state === 'available' && data.total > 0) {
    return `Atualizar ${data.total} ${data.total === 1 ? 'commit' : 'commits'}`;
  }
  return 'Preparar atualização';
});

async function loadChanges(current: number): Promise<void> {
  const revision = currentRevision.value;
  if (!revision) {
    changes.value = null;
    return;
  }
  changesLoading.value = true;
  try {
    const result = await fetchDeploymentChanges(
      props.project.id,
      revision,
      controller?.signal,
    );
    if (current === generation) changes.value = result;
  } catch {
    if (current === generation) changes.value = null;
  } finally {
    if (current === generation) changesLoading.value = false;
  }
}

async function loadTestRuns(current: number): Promise<void> {
  if (!props.project.capabilities.includes('tests')) return;
  try {
    const result = await fetchProjectTestHistory(props.project.id, 1, 10);
    if (current === generation) testRuns.value = result.items;
  } catch {
    // Sem o histórico de testes, o checklist só omite esse item.
  }
}

const readinessItems = computed(() =>
  buildProductionReadiness({
    branch: props.project.production?.branch ?? 'main',
    git: props.gitOverview,
    tests: testRuns.value,
    changes: changes.value,
    health: null,
    policies: props.project.production?.policies,
    hasBackupCommand: false,
  }),
);

function handleReadinessAction(id: 'run-tests'): void {
  if (id === 'run-tests') {
    void router?.push({
      name: 'project-tests',
      params: { projectId: props.project.id },
    });
  }
}

async function loadCommitSubjects(current: number): Promise<void> {
  const revisions = history.value.map((item) => item.revision);
  if (revisions.length === 0) return;
  try {
    const commits = await fetchDeploymentCommits(
      props.project.id,
      revisions,
      controller?.signal,
    );
    if (current !== generation) return;
    commitSubjects.value = Object.fromEntries(
      commits.map((commit) => [commit.hash, commit.subject]),
    );
  } catch {
    // As mensagens são um complemento; o histórico continua sem elas.
  }
}

async function refreshLog(
  deploymentId: string,
  current: number,
): Promise<void> {
  try {
    const next = await fetchDeploymentLog(
      props.project.id,
      deploymentId,
      controller?.signal,
    );
    if (current === generation) log.value = next;
  } catch {
    // O log é secundário durante o restart da própria API.
  }
}

async function load(): Promise<void> {
  const current = ++generation;
  clearTimer();
  controller?.abort();
  controller = new AbortController();
  loading.value = true;
  reconnecting.value = false;
  errorMessage.value = '';
  plan.value = null;
  latest.value = null;
  history.value = [];
  changes.value = null;
  commitSubjects.value = {};
  testRuns.value = null;
  log.value = null;

  try {
    const result = await fetchDeploymentHistory(props.project.id, {
      page: 1,
      pageSize: 8,
      signal: controller.signal,
    });
    if (current !== generation) return;
    history.value = result.items;
    latest.value = result.items[0] ?? null;
    if (latest.value) await refreshLog(latest.value.id, current);
    if (shouldPoll(latest.value)) schedulePoll(current);
    await Promise.all([
      loadChanges(current),
      loadCommitSubjects(current),
      loadTestRuns(current),
    ]);
  } catch (error) {
    if (current !== generation) return;
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível carregar o histórico de self-update.';
  } finally {
    if (current === generation) loading.value = false;
  }
}

async function poll(current: number): Promise<void> {
  const deploymentId = latest.value?.id;
  if (!deploymentId || current !== generation) return;

  try {
    const deployment = await fetchDeployment(
      props.project.id,
      deploymentId,
      controller?.signal,
    );
    if (current !== generation) return;
    reconnecting.value = false;
    latest.value = deployment;
    history.value = [
      deployment,
      ...history.value.filter((item) => item.id !== deployment.id),
    ].slice(0, 8);
    await refreshLog(deployment.id, current);
    if (shouldPoll(deployment)) schedulePoll(current);
  } catch {
    if (current !== generation) return;
    reconnecting.value = true;
    schedulePoll(current, 1_200);
  }
}

async function preparePlan(): Promise<void> {
  if (operation.value || shouldPoll(latest.value)) return;
  operation.value = 'planning';
  errorMessage.value = '';
  plan.value = null;
  try {
    plan.value = await fetchDeploymentPlan(
      props.project.id,
      controller?.signal,
    );
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível gerar o plano.';
  } finally {
    operation.value = '';
  }
}

function closePlan(): void {
  if (operation.value === 'starting') return;
  plan.value = null;
}

async function confirmAndStart(): Promise<void> {
  const currentPlan = plan.value;
  if (!currentPlan || operation.value) return;
  operation.value = 'starting';
  errorMessage.value = '';
  try {
    const confirmation = await createDeploymentConfirmation(
      props.project.id,
      currentPlan.planHash,
      controller?.signal,
    );
    const deployment = await startDeployment(
      props.project.id,
      currentPlan.planHash,
      confirmation.token,
      controller?.signal,
    );
    latest.value = deployment;
    history.value = [
      deployment,
      ...history.value.filter((item) => item.id !== deployment.id),
    ].slice(0, 8);
    plan.value = null;
    log.value = null;
    schedulePoll(generation, 300);
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível iniciar o self-update.';
  } finally {
    operation.value = '';
  }
}

watch(
  () => props.project.id,
  () => void load(),
  { immediate: true },
);

onBeforeUnmount(() => {
  generation += 1;
  clearTimer();
  controller?.abort();
});
</script>

<template>
  <section
    class="self-update-page"
    aria-label="Produção"
    :aria-busy="loading || Boolean(operation)"
  >
    <ProductionStatusHeader
      :tone="status.tone"
      :icon="ArrowPathIcon"
      :title="status.title"
      :description="status.description"
      label="Self-update"
      :facts="headerFacts"
    >
      <UiButton
        :disabled="loading || Boolean(operation) || shouldPoll(latest)"
        @click="load"
      >
        <ArrowPathIcon :class="{ 'su-spin': loading }" aria-hidden="true" />
        {{ loading ? 'Verificando…' : 'Verificar novamente' }}
      </UiButton>
    </ProductionStatusHeader>

    <p v-if="errorMessage" class="su-error" role="alert">
      <ExclamationTriangleIcon aria-hidden="true" />
      <span>{{ errorMessage }}</span>
    </p>

    <div class="su-columns">
      <div class="su-main">
        <ProductionChanges
          v-if="!shouldPoll(latest)"
          :changes="changes"
          :loading="changesLoading"
          :comparable="Boolean(currentRevision)"
          :branch="props.project.production?.branch ?? 'main'"
        >
          <template #action>
            <UiButton
              v-if="!plan"
              variant="primary"
              :disabled="loading || Boolean(operation)"
              @click="preparePlan"
            >
              <ArrowPathIcon
                v-if="operation === 'planning'"
                class="su-spin"
                aria-hidden="true"
              />
              <RocketLaunchIcon v-else aria-hidden="true" />
              {{ publishLabel }}
            </UiButton>
          </template>
        </ProductionChanges>

        <ProductionReadiness
          v-if="!shouldPoll(latest)"
          :items="readinessItems"
          @action="handleReadinessAction"
        />

        <ProductionPlanPanel
          v-if="plan"
          title="Atualização pronta"
          :branch="plan.branch"
          :project-name="plan.projectName"
          :revision="plan.revision"
          :steps="planSteps"
          :busy="Boolean(operation)"
          :confirm-label="
            operation === 'starting' ? 'Atualizando…' : 'Aplicar atualização'
          "
          notice="A confirmação vale somente para este plano e SHA. O worker exige working tree limpa, fast-forward de origin/main e readiness da nova API antes de concluir."
          @cancel="closePlan"
          @confirm="confirmAndStart"
        />

        <details
          v-if="latest"
          class="su-card"
          :open="
            shouldPoll(latest) ||
            Boolean(latest && executionTone(latest) === 'danger')
          "
        >
          <summary>
            <div>
              <span class="su-eyebrow">Última execução</span>
              <strong>{{ executionTitle(latest) }}</strong>
            </div>
            <code :title="latest.revision">{{
              shortRevision(latest.revision)
            }}</code>
          </summary>
          <div class="su-body">
            <ProductionTimeline :steps="timelineSteps" />
            <ProjectLogViewer
              v-if="log"
              class="self-update-log"
              :content="log.content"
              title="Saída do self-update"
              :running="shouldPoll(latest)"
              :masked-count="log.redactionCount"
              :truncated="log.truncated"
              embedded
            />
            <p v-else class="su-muted">
              O log aparecerá aqui depois da primeira execução.
            </p>
          </div>
        </details>
      </div>

      <aside class="su-side">
        <ProductionHistory
          :items="historyItems"
          title="Últimas atualizações"
          subtitle="Execuções registradas pelo self-update."
        />
      </aside>
    </div>
  </section>
</template>

<style scoped>
.self-update-page {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 14px;
}

.su-spin {
  animation: su-spin 1s linear infinite;
}

@keyframes su-spin {
  to {
    transform: rotate(360deg);
  }
}

.su-error {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 10px 14px;
  border-radius: 10px;
  color: var(--danger-text, #f85149);
  background: color-mix(in srgb, var(--danger-text, #f85149) 12%, transparent);
  font-size: 13px;
}

.su-error svg {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
}

.su-columns {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 14px;
  align-items: start;
}

@media (max-width: 1000px) {
  .su-columns {
    grid-template-columns: minmax(0, 1fr);
  }
}

.su-main,
.su-side {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 14px;
}

.su-card {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-1);
}

.su-card summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px;
  cursor: pointer;
  list-style: none;
}

.su-card summary::-webkit-details-marker {
  display: none;
}

.su-card summary code {
  color: var(--accent);
  font-family: var(--font-family-mono);
  font-size: 12.5px;
}

.su-eyebrow {
  display: block;
  color: var(--accent);
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.su-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 0 20px 18px;
}

.su-muted {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
}
</style>
