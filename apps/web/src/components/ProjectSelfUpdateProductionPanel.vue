<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  RocketLaunchIcon,
} from '@heroicons/vue/24/outline';

import type {
  Deployment,
  DeploymentLog,
  DeploymentPlan,
  Project,
} from '@dev-dashboard/contracts';

import {
  createDeploymentConfirmation,
  fetchDeployment,
  fetchDeploymentHistory,
  fetchDeploymentLog,
  fetchDeploymentPlan,
  startDeployment,
} from '../api';

interface Props {
  project: Project;
}

const props = defineProps<Props>();

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

function shouldPoll(deployment: Deployment | null): boolean {
  if (!deployment) return false;
  if (!TERMINAL.has(deployment.status)) return true;
  return (
    deployment.currentStepId === 'self-update' &&
    deployment.status === 'recovery_required' &&
    deployment.errorCode === 'DEPLOYMENT_INTERRUPTED'
  );
}

const status = computed(() => {
  const deployment = latest.value;
  if (!deployment) {
    return {
      title: 'Self-update pronto para planejar',
      description:
        'O plano usa origin/main como revision alvo e só transfere a execução depois da confirmação.',
      tone: 'neutral',
    };
  }
  if (deployment.status === 'succeeded') {
    return {
      title: 'Self-update concluído',
      description:
        'O worker aplicou a revision confirmada e a nova API comprovou readiness com o mesmo SHA.',
      tone: 'success',
    };
  }
  if (deployment.status === 'recovery_required') {
    return {
      title: 'Self-update requer revisão',
      description:
        deployment.errorMessage ??
        'A mutação pode ter iniciado sem uma conclusão segura comprovada.',
      tone: 'danger',
    };
  }
  if (deployment.status === 'failed') {
    return {
      title: 'Self-update não foi aplicado',
      description:
        deployment.errorMessage ??
        'A execução falhou antes de comprovar uma atualização segura.',
      tone: 'danger',
    };
  }
  return {
    title: reconnecting.value ? 'API reiniciando…' : 'Self-update em execução',
    description:
      'O worker externo assumiu a operação. A página volta a reconciliar o resultado quando a API responder novamente.',
    tone: 'info',
  };
});

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
  if (operation.value) return;
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
  <div class="self-update-panel">
    <section class="self-update-status" :data-tone="status.tone">
      <div class="self-update-status-icon" aria-hidden="true">
        <CheckCircleIcon v-if="status.tone === 'success'" />
        <ExclamationTriangleIcon v-else-if="status.tone === 'danger'" />
        <ArrowPathIcon v-else-if="status.tone === 'info'" />
        <RocketLaunchIcon v-else />
      </div>
      <div>
        <h3>{{ status.title }}</h3>
        <p>{{ status.description }}</p>
      </div>
    </section>

    <p v-if="errorMessage" class="self-update-error" role="alert">
      {{ errorMessage }}
    </p>

    <section class="self-update-card">
      <div class="self-update-card-heading">
        <div>
          <span class="self-update-eyebrow">Production Contract</span>
          <h3>Atualizar o Dev Dashboard</h3>
        </div>
        <button
          class="primary-button"
          type="button"
          :disabled="loading || Boolean(operation) || shouldPoll(latest)"
          @click="preparePlan"
        >
          {{ operation === 'planning' ? 'Planejando…' : 'Gerar plano' }}
        </button>
      </div>

      <div class="self-update-facts">
        <div>
          <span>Estratégia</span>
          <strong>self-update</strong>
        </div>
        <div>
          <span>Branch</span>
          <strong>{{ props.project.production?.branch ?? 'main' }}</strong>
        </div>
        <div>
          <span>Privilégio</span>
          <strong>user-space</strong>
        </div>
      </div>

      <div v-if="plan" class="self-update-plan">
        <div class="self-update-plan-summary">
          <div>
            <span>Revision alvo</span>
            <code :title="plan.revision">{{
              shortRevision(plan.revision)
            }}</code>
          </div>
          <div>
            <span>Etapas</span>
            <strong>{{ plan.steps.length }}</strong>
          </div>
        </div>

        <ol class="self-update-steps">
          <li v-for="step in plan.steps" :key="step.id">
            <span>{{
              step.id === 'check' ? 'Check do agent' : 'Self-update'
            }}</span>
            <small v-if="step.id === 'self-update'"
              >reinicia a própria API</small
            >
            <small v-else>somente leitura</small>
          </li>
        </ol>

        <div class="self-update-warning">
          A confirmação vale somente para este plano e SHA. Depois do handoff, o
          worker exige working tree limpa, fast-forward de origin/main e
          readiness da nova API antes de concluir.
        </div>

        <div class="self-update-plan-actions">
          <button class="secondary-button" type="button" @click="plan = null">
            Cancelar
          </button>
          <button
            class="primary-button"
            type="button"
            :disabled="Boolean(operation)"
            @click="confirmAndStart"
          >
            {{
              operation === 'starting' ? 'Iniciando…' : 'Confirmar e atualizar'
            }}
          </button>
        </div>
      </div>
    </section>

    <section v-if="latest" class="self-update-card">
      <div class="self-update-card-heading">
        <div>
          <span class="self-update-eyebrow">Última execução</span>
          <h3>{{ formatDate(latest.createdAt) }}</h3>
        </div>
        <code :title="latest.revision">{{
          shortRevision(latest.revision)
        }}</code>
      </div>

      <div class="self-update-timeline">
        <div
          v-for="step in latest.timeline"
          :key="step.id"
          class="self-update-step"
        >
          <span>{{
            step.id === 'check' ? 'Check do agent' : 'Self-update'
          }}</span>
          <strong>{{ step.status }}</strong>
        </div>
      </div>

      <pre v-if="log?.content" class="self-update-log">{{ log.content }}</pre>
    </section>
  </div>
</template>

<style scoped>
.self-update-panel {
  display: grid;
  gap: 16px;
  width: min(100%, 920px);
  margin: 0 auto;
  padding: 20px 0 40px;
}

.self-update-status,
.self-update-card {
  border: 1px solid var(--border-color, #dfe3e8);
  border-radius: 14px;
  background: var(--surface-color, #fff);
}

.self-update-status {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 16px 18px;
}

.self-update-status-icon {
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
}

.self-update-status-icon :deep(svg) {
  width: 22px;
  height: 22px;
}

.self-update-status h3,
.self-update-card h3 {
  margin: 0;
  font-size: 15px;
}

.self-update-status p {
  margin: 4px 0 0;
  color: var(--text-secondary, #667085);
  line-height: 1.45;
}

.self-update-card {
  padding: 18px;
}

.self-update-card-heading,
.self-update-plan-actions,
.self-update-plan-summary,
.self-update-step {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.self-update-eyebrow,
.self-update-facts span,
.self-update-plan-summary span {
  display: block;
  margin-bottom: 4px;
  color: var(--text-secondary, #667085);
  font-size: 12px;
}

.self-update-facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}

.self-update-facts > div,
.self-update-plan-summary > div {
  padding: 12px;
  border-radius: 10px;
  background: var(--surface-muted, rgba(127, 127, 127, 0.08));
}

.self-update-plan {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color, #dfe3e8);
}

.self-update-plan-summary {
  justify-content: flex-start;
}

.self-update-plan-summary > div {
  min-width: 150px;
}

.self-update-steps {
  display: grid;
  gap: 8px;
  margin: 14px 0;
  padding: 0;
  list-style: none;
}

.self-update-steps li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border-color, #dfe3e8);
  border-radius: 10px;
}

.self-update-steps small,
.self-update-warning {
  color: var(--text-secondary, #667085);
}

.self-update-warning {
  padding: 12px;
  border-radius: 10px;
  background: var(--surface-muted, rgba(127, 127, 127, 0.08));
  font-size: 13px;
  line-height: 1.5;
}

.self-update-plan-actions {
  justify-content: flex-end;
  margin-top: 14px;
}

.self-update-timeline {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}

.self-update-step {
  padding: 10px 0;
  border-top: 1px solid var(--border-color, #dfe3e8);
}

.self-update-log {
  max-height: 220px;
  overflow: auto;
  margin: 14px 0 0;
  padding: 12px;
  border-radius: 10px;
  background: var(--surface-muted, rgba(127, 127, 127, 0.08));
  white-space: pre-wrap;
  font-size: 12px;
}

.self-update-error {
  margin: 0;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(220, 38, 38, 0.08);
}

@media (max-width: 700px) {
  .self-update-facts {
    grid-template-columns: 1fr;
  }

  .self-update-card-heading,
  .self-update-plan-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
