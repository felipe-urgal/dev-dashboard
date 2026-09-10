<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
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
import ProjectLogViewer from './ProjectLogViewer.vue';

interface Props {
  project: Project;
}

const props = defineProps<Props>();

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

function executionTone(deployment: Deployment): Tone {
  if (deployment.status === 'succeeded') return 'success';
  if (deployment.status === 'failed' || deployment.status === 'recovery_required') {
    return 'danger';
  }
  if (deployment.status === 'cancelled') return 'warning';
  return 'info';
}

function executionTitle(deployment: Deployment): string {
  if (deployment.status === 'succeeded') return 'Self-update aplicado com sucesso.';
  if (deployment.status === 'failed') return 'Self-update não foi aplicado.';
  if (deployment.status === 'recovery_required') return 'Self-update requer revisão.';
  if (deployment.status === 'cancelled') return 'Self-update cancelado.';
  return 'Self-update em execução.';
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
  <section class="self-update-panel" aria-labelledby="self-update-title">
    <article class="self-update-hero">
      <div class="self-update-hero-main">
        <div class="self-update-hero-icon" :class="`is-${status.tone}`" aria-hidden="true">
          <ArrowPathIcon />
        </div>
        <div class="self-update-hero-copy">
          <span class="self-update-eyebrow">Self-update</span>
          <h3 id="self-update-title">Self-update</h3>
          <p>{{ status.description }}</p>
        </div>
      </div>
      <div class="self-update-hero-actions">
        <div class="self-update-status-pill" :class="`is-${status.tone}`">
          <span class="self-update-status-dot" aria-hidden="true"></span>
          <div>
            <strong>{{ status.title }}</strong>
            <small>{{ status.detail }}</small>
          </div>
        </div>
        <button
          class="primary-button"
          type="button"
          :disabled="loading || Boolean(operation) || shouldPoll(latest)"
          @click="load"
        >
          <ArrowPathIcon :class="{ 'self-update-spin': loading }" aria-hidden="true" />
          {{ loading ? 'Verificando…' : 'Verificar novamente' }}
        </button>
      </div>
    </article>

    <p v-if="errorMessage" class="self-update-error" role="alert">
      <ExclamationTriangleIcon aria-hidden="true" />
      <span>{{ errorMessage }}</span>
    </p>

    <div class="self-update-facts">
      <article>
        <ArrowPathIcon aria-hidden="true" />
        <div><span>Estratégia</span><strong>self-update</strong><small>Atualização automática</small></div>
      </article>
      <article>
        <RocketLaunchIcon aria-hidden="true" />
        <div><span>Branch</span><strong>{{ props.project.production?.branch ?? 'main' }}</strong><small>Ramo de produção</small></div>
      </article>
      <article>
        <ShieldCheckIcon aria-hidden="true" />
        <div><span>Privilégio</span><strong>user-space</strong><small>Execução sem root</small></div>
      </article>
      <article>
        <CheckCircleIcon aria-hidden="true" />
        <div><span>Revision atual</span><strong :title="currentRevision">{{ shortRevision(currentRevision) }}</strong><small>Última comprovada</small></div>
      </article>
      <article>
        <ClockIcon aria-hidden="true" />
        <div><span>Última execução</span><strong>{{ formatDate(latest?.createdAt) }}</strong><small>Histórico real</small></div>
      </article>
    </div>

    <article class="self-update-ready" :class="{ 'is-running': shouldPoll(latest) }">
      <InformationCircleIcon aria-hidden="true" />
      <div>
        <strong>{{ shouldPoll(latest) ? 'Self-update em andamento.' : 'Self-update pronto para uso.' }}</strong>
        <p>
          {{
            shouldPoll(latest)
              ? 'O worker externo está aplicando a revision confirmada e a API pode reiniciar durante o processo.'
              : 'Gere um plano para revisar a revision alvo e as etapas antes de confirmar a atualização.'
          }}
        </p>
      </div>
      <button
        class="secondary-button"
        type="button"
        :disabled="loading || Boolean(operation) || shouldPoll(latest)"
        @click="preparePlan"
      >
        <ArrowPathIcon v-if="operation === 'planning'" class="self-update-spin" aria-hidden="true" />
        <RocketLaunchIcon v-else aria-hidden="true" />
        {{ operation === 'planning' ? 'Gerando…' : 'Gerar plano' }}
      </button>
    </article>

    <article v-if="plan" class="self-update-card self-update-plan">
      <div class="self-update-card-heading">
        <div>
          <span class="self-update-eyebrow">Confirmação</span>
          <h3>Revise o plano antes de atualizar</h3>
        </div>
        <code :title="plan.revision">{{ shortRevision(plan.revision) }}</code>
      </div>

      <div class="self-update-plan-summary">
        <div>
          <span>Revision alvo</span>
          <code :title="plan.revision">{{ shortRevision(plan.revision) }}</code>
        </div>
        <div>
          <span>Etapas</span>
          <strong>{{ plan.steps.length }}</strong>
        </div>
      </div>

      <ol class="self-update-steps">
        <li v-for="step in plan.steps" :key="step.id">
          <span class="self-update-step-dot" aria-hidden="true"></span>
          <div>
            <strong>{{ stepLabel(step.id) }}</strong>
            <small>{{ step.id === 'self-update' ? 'reinicia a própria API' : 'somente leitura' }}</small>
          </div>
        </li>
      </ol>

      <div class="self-update-warning">
        <ShieldCheckIcon aria-hidden="true" />
        <p>
          A confirmação vale somente para este plano e SHA. Depois do handoff, o worker exige working tree limpa,
          fast-forward de origin/main e readiness da nova API antes de concluir.
        </p>
      </div>

      <div class="self-update-plan-actions">
        <button class="secondary-button" type="button" :disabled="Boolean(operation)" @click="plan = null">
          Cancelar
        </button>
        <button class="primary-button" type="button" :disabled="Boolean(operation)" @click="confirmAndStart">
          <ArrowPathIcon v-if="operation === 'starting'" class="self-update-spin" aria-hidden="true" />
          <RocketLaunchIcon v-else aria-hidden="true" />
          {{ operation === 'starting' ? 'Iniciando…' : 'Confirmar e atualizar' }}
        </button>
      </div>
    </article>

    <div class="self-update-main-grid">
      <article class="self-update-card self-update-history">
        <div class="self-update-card-heading">
          <div>
            <span class="self-update-eyebrow">Histórico</span>
            <h3>Últimas execuções</h3>
          </div>
          <span class="self-update-count">{{ history.length }}</span>
        </div>
        <div v-if="history.length" class="self-update-history-list">
          <div v-for="item in history" :key="item.id" class="self-update-history-row">
            <span class="self-update-history-icon" :class="`is-${executionTone(item)}`" aria-hidden="true">
              <CheckCircleIcon v-if="executionTone(item) === 'success'" />
              <ExclamationTriangleIcon v-else-if="executionTone(item) === 'danger'" />
              <ClockIcon v-else />
            </span>
            <div class="self-update-history-copy">
              <strong>{{ executionTitle(item) }}</strong>
              <small>{{ formatDate(item.createdAt) }}</small>
            </div>
            <code :title="item.revision">{{ shortRevision(item.revision) }}</code>
          </div>
        </div>
        <p v-else class="self-update-empty">Nenhuma execução registrada.</p>
      </article>

      <article class="self-update-card self-update-log-card">
        <div class="self-update-card-heading">
          <div>
            <span class="self-update-eyebrow">Log</span>
            <h3>Log da última execução</h3>
          </div>
          <span v-if="latest" class="self-update-log-state">{{ shouldPoll(latest) ? 'Ao vivo' : 'Finalizado' }}</span>
        </div>
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
        <p v-else class="self-update-empty">O log aparecerá aqui depois da primeira execução.</p>
      </article>
    </div>

    <article class="self-update-safety">
      <ShieldCheckIcon aria-hidden="true" />
      <div>
        <strong>Operação segura</strong>
        <p>O self-update é executado em modo user-space, sem privilégio de root, seguindo as políticas de segurança do projeto.</p>
      </div>
    </article>
  </section>
</template>

<style scoped>
.self-update-panel {
  display: grid;
  width: min(100%, 1120px);
  gap: 14px;
  margin: 0 auto;
  padding: 18px 0 32px;
}

.self-update-hero,
.self-update-card,
.self-update-facts article,
.self-update-ready,
.self-update-safety {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
}

.self-update-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 20px;
}

.self-update-hero-main,
.self-update-hero-actions,
.self-update-ready,
.self-update-safety,
.self-update-card-heading,
.self-update-plan-actions,
.self-update-plan-summary {
  display: flex;
  align-items: center;
  gap: 12px;
}

.self-update-hero-main {
  min-width: 0;
}

.self-update-hero-icon {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: var(--radius-md);
  color: var(--accent);
  background: var(--accent-soft);
}

.self-update-hero-icon svg {
  width: 22px;
  height: 22px;
}

.self-update-hero-icon.is-success {
  color: var(--success-text);
  background: var(--success-surface);
}

.self-update-hero-icon.is-danger {
  color: var(--danger-text);
  background: var(--danger-surface);
}

.self-update-hero-copy {
  min-width: 0;
}

.self-update-eyebrow {
  display: block;
  margin-bottom: 5px;
  color: var(--accent);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.self-update-hero h3,
.self-update-card h3,
.self-update-card p,
.self-update-ready p,
.self-update-safety p {
  margin: 0;
}

.self-update-hero h3 {
  color: var(--text);
  font-size: 20px;
  letter-spacing: -0.025em;
}

.self-update-hero-copy > p {
  max-width: 640px;
  margin-top: 6px;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.5;
}

.self-update-hero-actions {
  flex: 0 0 auto;
}

.self-update-hero-actions button,
.self-update-ready button,
.self-update-plan-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
}

.self-update-hero-actions button svg,
.self-update-ready button svg,
.self-update-plan-actions button svg {
  width: 15px;
  height: 15px;
}

.self-update-status-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 210px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
}

.self-update-status-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--text-dim);
}

.self-update-status-pill.is-success .self-update-status-dot {
  background: var(--success-text);
}

.self-update-status-pill.is-info .self-update-status-dot {
  background: var(--info-text);
}

.self-update-status-pill.is-warning .self-update-status-dot {
  background: var(--warning-text);
}

.self-update-status-pill.is-danger .self-update-status-dot {
  background: var(--danger-text);
}

.self-update-status-pill > div {
  display: grid;
  gap: 2px;
}

.self-update-status-pill strong {
  color: var(--text);
  font-size: 10px;
}

.self-update-status-pill small {
  color: var(--text-muted);
  font-size: 9px;
}

.self-update-error {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin: 0;
  padding: 11px 14px;
  border: 1px solid color-mix(in srgb, var(--danger-text) 35%, var(--border));
  border-radius: var(--radius-md);
  color: var(--danger-text);
  background: var(--danger-surface);
  font-size: 11px;
}

.self-update-error svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
}

.self-update-facts {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.self-update-facts article {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 9px;
  padding: 12px;
}

.self-update-facts article > svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  color: var(--accent);
}

.self-update-facts article > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.self-update-facts span,
.self-update-plan-summary span {
  color: var(--text-muted);
  font-size: 9px;
}

.self-update-facts strong,
.self-update-plan-summary strong,
.self-update-plan-summary code {
  overflow: hidden;
  color: var(--text);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.self-update-facts small {
  color: var(--text-dim);
  font-size: 8px;
}

.self-update-ready,
.self-update-safety {
  align-items: flex-start;
  padding: 13px 15px;
  border-color: color-mix(in srgb, var(--info-text) 28%, var(--border));
  background: var(--info-surface);
}

.self-update-ready > svg,
.self-update-safety > svg {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  color: var(--info-text);
}

.self-update-ready > div,
.self-update-safety > div {
  min-width: 0;
  flex: 1 1 auto;
}

.self-update-ready strong,
.self-update-safety strong {
  color: var(--text);
  font-size: 11px;
}

.self-update-ready p,
.self-update-safety p {
  margin-top: 3px;
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.5;
}

.self-update-card {
  padding: 18px;
}

.self-update-card-heading {
  justify-content: space-between;
  margin-bottom: 14px;
}

.self-update-card-heading h3 {
  color: var(--text);
  font-size: 14px;
}

.self-update-card-heading > code,
.self-update-count,
.self-update-log-state {
  color: var(--text-muted);
  font-size: 10px;
}

.self-update-plan {
  border-color: color-mix(in srgb, var(--warning-text) 28%, var(--border));
}

.self-update-plan-summary {
  justify-content: flex-start;
  margin-bottom: 12px;
}

.self-update-plan-summary > div {
  display: grid;
  min-width: 150px;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
}

.self-update-steps {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.self-update-steps li {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 46px;
  border-bottom: 1px solid var(--border);
}

.self-update-steps li:last-child {
  border-bottom: 0;
}

.self-update-step-dot {
  width: 8px;
  height: 8px;
  justify-self: center;
  border: 2px solid var(--accent);
  border-radius: 999px;
}

.self-update-steps li > div {
  display: grid;
  gap: 2px;
}

.self-update-steps strong {
  color: var(--text);
  font-size: 10px;
}

.self-update-steps small {
  color: var(--text-muted);
  font-size: 9px;
}

.self-update-warning {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-top: 12px;
  padding: 11px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
}

.self-update-warning svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  color: var(--warning-text);
}

.self-update-warning p {
  color: var(--text-muted);
  font-size: 9px;
  line-height: 1.5;
}

.self-update-plan-actions {
  justify-content: flex-end;
  margin-top: 14px;
}

.self-update-main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.85fr);
  gap: 14px;
}

.self-update-history-list {
  display: grid;
}

.self-update-history-row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  min-height: 52px;
  padding: 7px 0;
  border-bottom: 1px solid var(--border);
}

.self-update-history-row:last-child {
  border-bottom: 0;
}

.self-update-history-icon {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-2);
}

.self-update-history-icon svg {
  width: 14px;
  height: 14px;
}

.self-update-history-icon.is-success {
  color: var(--success-text);
  background: var(--success-surface);
}

.self-update-history-icon.is-danger {
  color: var(--danger-text);
  background: var(--danger-surface);
}

.self-update-history-icon.is-warning {
  color: var(--warning-text);
  background: var(--warning-surface);
}

.self-update-history-icon.is-info {
  color: var(--info-text);
  background: var(--info-surface);
}

.self-update-history-copy {
  display: grid;
  gap: 2px;
}

.self-update-history-copy strong {
  color: var(--text);
  font-size: 10px;
}

.self-update-history-copy small,
.self-update-history-row code {
  color: var(--text-muted);
  font-size: 9px;
}

.self-update-empty {
  padding: 18px 0 8px;
  color: var(--text-muted);
  font-size: 10px;
}

.self-update-log {
  margin: 0;
}

.self-update-log :deep(.project-log-viewer-output) {
  max-height: 260px;
}

.self-update-safety {
  margin-top: 1px;
}

.self-update-spin {
  animation: self-update-spin 900ms linear infinite;
}

@keyframes self-update-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 920px) {
  .self-update-hero {
    align-items: flex-start;
    flex-direction: column;
  }

  .self-update-hero-actions {
    width: 100%;
    justify-content: space-between;
  }

  .self-update-facts {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .self-update-main-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 620px) {
  .self-update-hero,
  .self-update-card {
    padding: 14px;
  }

  .self-update-hero-actions,
  .self-update-ready,
  .self-update-plan-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .self-update-status-pill,
  .self-update-hero-actions button,
  .self-update-ready button,
  .self-update-plan-actions button {
    width: 100%;
  }

  .self-update-facts {
    grid-template-columns: 1fr;
  }

  .self-update-plan-summary {
    align-items: stretch;
    flex-direction: column;
  }

  .self-update-plan-summary > div {
    min-width: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .self-update-spin {
    animation: none;
  }
}
</style>
