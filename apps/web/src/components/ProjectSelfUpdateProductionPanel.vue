<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
  XMarkIcon,
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
const historyExpanded = ref(false);
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

const visibleHistory = computed(() =>
  historyExpanded.value ? history.value : history.value.slice(0, 5),
);

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
  historyExpanded.value = false;
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
    class="self-update-panel"
    aria-labelledby="self-update-title"
    :aria-busy="loading || Boolean(operation)"
  >
    <article class="self-update-hero">
      <div class="self-update-hero-main">
        <div
          class="self-update-hero-icon"
          :class="'is-' + status.tone"
          aria-hidden="true"
        >
          <ArrowPathIcon />
        </div>
        <div class="self-update-hero-copy">
          <span class="self-update-eyebrow">Self-update</span>
          <h3 id="self-update-title">{{ status.title }}</h3>
          <p>{{ status.description }}</p>
        </div>
      </div>

      <div class="self-update-hero-meta">
        <div>
          <span>Revisão atual</span>
          <code :title="currentRevision">{{
            shortRevision(currentRevision)
          }}</code>
        </div>
        <div>
          <span>Última execução</span>
          <strong>{{ formatDate(latest?.createdAt) }}</strong>
        </div>
        <div>
          <span>Branch</span>
          <strong>{{ props.project.production?.branch ?? 'main' }}</strong>
        </div>
      </div>

      <div class="self-update-hero-actions">
        <button
          class="secondary-button"
          type="button"
          :disabled="loading || Boolean(operation) || shouldPoll(latest)"
          @click="load"
        >
          <ArrowPathIcon
            :class="{ 'self-update-spin': loading }"
            aria-hidden="true"
          />
          {{ loading ? 'Verificando…' : 'Verificar novamente' }}
        </button>
        <button
          class="primary-button"
          type="button"
          :disabled="loading || Boolean(operation) || shouldPoll(latest)"
          @click="preparePlan"
        >
          <ArrowPathIcon
            v-if="operation === 'planning'"
            class="self-update-spin"
            aria-hidden="true"
          />
          <RocketLaunchIcon v-else aria-hidden="true" />
          {{
            operation === 'planning' ? 'Preparando…' : 'Preparar atualização'
          }}
        </button>
      </div>
    </article>

    <p v-if="errorMessage" class="self-update-error" role="alert">
      <ExclamationTriangleIcon aria-hidden="true" />
      <span>{{ errorMessage }}</span>
    </p>

    <article class="self-update-card self-update-history">
      <div class="self-update-card-heading">
        <div>
          <span class="self-update-eyebrow">Histórico</span>
          <h3>Últimas atualizações</h3>
          <p>Execuções recentes registradas pelo self-update.</p>
        </div>
      </div>

      <div
        v-if="history.length"
        class="self-update-history-table"
        role="table"
        aria-label="Últimas atualizações"
      >
        <div class="self-update-history-head" role="row">
          <span role="columnheader">Revisão</span>
          <span role="columnheader">Data e hora</span>
          <span role="columnheader">Duração</span>
          <span role="columnheader">Status</span>
        </div>
        <div
          v-for="item in visibleHistory"
          :key="item.id"
          class="self-update-history-row"
          role="row"
        >
          <code role="cell" :title="item.revision">{{
            shortRevision(item.revision)
          }}</code>
          <span role="cell">{{ formatDate(item.createdAt) }}</span>
          <span role="cell">{{ formatDuration(item) }}</span>
          <span role="cell">
            <span
              class="self-update-status"
              :class="'is-' + executionTone(item)"
            >
              {{ executionStatusLabel(item) }}
            </span>
          </span>
        </div>
      </div>
      <p v-else class="self-update-empty">Nenhuma execução registrada.</p>

      <button
        v-if="history.length > 5"
        class="secondary-button self-update-history-more"
        type="button"
        @click="historyExpanded = !historyExpanded"
      >
        {{ historyExpanded ? 'Ver menos' : 'Ver mais' }}
      </button>
    </article>

    <details
      class="self-update-card self-update-technical"
      :open="
        shouldPoll(latest) ||
        Boolean(latest && executionTone(latest) === 'danger')
      "
    >
      <summary>
        <span>Detalhes técnicos</span>
        <span v-if="latest">{{ executionStatusLabel(latest) }}</span>
      </summary>

      <div class="self-update-technical-body">
        <div class="self-update-technical-grid">
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

        <div v-if="latest" class="self-update-execution">
          <div class="self-update-execution-heading">
            <div>
              <span class="self-update-eyebrow">Última execução</span>
              <h3>{{ executionTitle(latest) }}</h3>
            </div>
            <code :title="latest.revision">{{
              shortRevision(latest.revision)
            }}</code>
          </div>

          <ol class="self-update-execution-steps">
            <li v-for="step in latest.timeline" :key="step.id">
              <span
                class="self-update-step-dot"
                :class="'is-' + step.status"
                aria-hidden="true"
              ></span>
              <div>
                <strong>{{ stepLabel(step.id) }}</strong>
                <small>{{ stepStatusLabel(step.status) }}</small>
              </div>
            </li>
          </ol>

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
          <p v-else class="self-update-empty">
            O log aparecerá aqui depois da primeira execução.
          </p>
        </div>
      </div>
    </details>

    <Teleport to="body">
      <div
        v-if="plan"
        class="self-update-modal-backdrop"
        role="presentation"
        @click.self="closePlan"
      >
        <section
          class="self-update-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="self-update-plan-title"
        >
          <header>
            <div>
              <span class="self-update-eyebrow">Preparar self-update</span>
              <h3 id="self-update-plan-title">Atualização pronta</h3>
              <p>Revise o alvo e as etapas antes de aplicar a atualização.</p>
            </div>
            <button
              class="self-update-modal-close"
              type="button"
              aria-label="Fechar"
              :disabled="operation === 'starting'"
              @click="closePlan"
            >
              <XMarkIcon aria-hidden="true" />
            </button>
          </header>

          <div class="self-update-modal-content">
            <div class="self-update-plan-summary">
              <div>
                <span>Revisão atual</span>
                <code :title="currentRevision">{{
                  shortRevision(currentRevision)
                }}</code>
              </div>
              <div>
                <span>Nova revisão</span>
                <code :title="plan.revision">{{
                  shortRevision(plan.revision)
                }}</code>
              </div>
              <div>
                <span>Branch</span>
                <strong>{{ plan.branch }}</strong>
              </div>
            </div>

            <div class="self-update-modal-section-title">Etapas</div>
            <ol class="self-update-steps">
              <li v-for="step in plan.steps" :key="step.id">
                <span class="self-update-step-dot" aria-hidden="true"></span>
                <div>
                  <strong>{{ stepLabel(step.id) }}</strong>
                  <small>{{
                    step.id === 'self-update'
                      ? 'reinicia a própria API'
                      : 'somente leitura'
                  }}</small>
                </div>
              </li>
            </ol>

            <div class="self-update-warning">
              <ShieldCheckIcon aria-hidden="true" />
              <p>
                A confirmação vale somente para este plano e SHA. O worker exige
                working tree limpa, fast-forward de origin/main e readiness da
                nova API antes de concluir.
              </p>
            </div>
          </div>

          <footer class="self-update-plan-actions">
            <button
              class="secondary-button"
              type="button"
              :disabled="operation === 'starting'"
              @click="closePlan"
            >
              Cancelar
            </button>
            <button
              class="primary-button"
              type="button"
              :disabled="Boolean(operation)"
              @click="confirmAndStart"
            >
              <ArrowPathIcon
                v-if="operation === 'starting'"
                class="self-update-spin"
                aria-hidden="true"
              />
              <RocketLaunchIcon v-else aria-hidden="true" />
              {{
                operation === 'starting'
                  ? 'Atualizando…'
                  : 'Aplicar atualização'
              }}
            </button>
          </footer>
        </section>
      </div>
    </Teleport>
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
.self-update-card {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
}

.self-update-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px 22px;
  padding: 20px;
}

.self-update-hero-main {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 14px;
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

.self-update-hero-icon.is-warning {
  color: var(--warning-text);
  background: var(--warning-surface);
}

.self-update-hero-icon.is-danger {
  color: var(--danger-text);
  background: var(--danger-surface);
}

.self-update-hero-icon.is-info {
  color: var(--info-text);
  background: var(--info-surface);
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
.self-update-modal h3,
.self-update-modal p {
  margin: 0;
}

.self-update-hero h3 {
  color: var(--text);
  font-size: 18px;
  letter-spacing: -0.02em;
}

.self-update-hero-copy > p {
  max-width: 650px;
  margin-top: 5px;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.5;
}

.self-update-hero-meta {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid var(--border);
}

.self-update-hero-meta > div {
  display: grid;
  min-width: 0;
  gap: 4px;
  padding: 13px 14px 0;
  border-left: 1px solid var(--border);
}

.self-update-hero-meta > div:first-child {
  padding-left: 0;
  border-left: 0;
}

.self-update-hero-meta span,
.self-update-plan-summary span,
.self-update-technical-grid span {
  color: var(--text-muted);
  font-size: 9px;
}

.self-update-hero-meta strong,
.self-update-hero-meta code,
.self-update-plan-summary strong,
.self-update-plan-summary code,
.self-update-technical-grid strong {
  overflow: hidden;
  color: var(--text);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.self-update-hero-actions,
.self-update-plan-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.self-update-hero-actions button,
.self-update-plan-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  white-space: nowrap;
}

.self-update-hero-actions svg,
.self-update-plan-actions svg {
  width: 15px;
  height: 15px;
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

.self-update-card {
  padding: 18px 20px;
}

.self-update-card-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.self-update-card-heading h3,
.self-update-execution-heading h3 {
  color: var(--text);
  font-size: 14px;
}

.self-update-card-heading p {
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 10px;
}

.self-update-history-table {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.self-update-history-head,
.self-update-history-row {
  display: grid;
  grid-template-columns:
    minmax(110px, 0.8fr) minmax(150px, 1.2fr) minmax(90px, 0.7fr)
    minmax(110px, 0.75fr);
  align-items: center;
  min-width: 560px;
  gap: 12px;
  padding: 10px 12px;
}

.self-update-history-head {
  color: var(--text-muted);
  background: var(--surface-2);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.self-update-history-row {
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 10px;
}

.self-update-history-row code {
  color: var(--text);
  font-size: 10px;
}

.self-update-status {
  display: inline-flex;
  align-items: center;
  width: max-content;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-2);
  font-size: 9px;
  font-weight: 700;
}

.self-update-status.is-success {
  color: var(--success-text);
  background: var(--success-surface);
}

.self-update-status.is-danger {
  color: var(--danger-text);
  background: var(--danger-surface);
}

.self-update-status.is-warning {
  color: var(--warning-text);
  background: var(--warning-surface);
}

.self-update-status.is-info {
  color: var(--info-text);
  background: var(--info-surface);
}

.self-update-history-more {
  margin-top: 12px;
}

.self-update-empty {
  margin: 0;
  padding: 12px 0 4px;
  color: var(--text-muted);
  font-size: 10px;
}

.self-update-technical {
  padding: 0;
  color: var(--text-muted);
}

.self-update-technical > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
  user-select: none;
}

.self-update-technical[open] > summary {
  border-bottom: 1px solid var(--border);
}

.self-update-technical-body {
  padding: 16px 20px 18px;
}

.self-update-technical-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.self-update-technical-grid > div {
  display: grid;
  min-width: 0;
  gap: 5px;
  padding: 11px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
}

.self-update-execution {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.self-update-execution-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.self-update-execution-heading code {
  color: var(--text-muted);
  font-size: 10px;
}

.self-update-execution-steps,
.self-update-steps {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.self-update-execution-steps li,
.self-update-steps li {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 44px;
  border-bottom: 1px solid var(--border);
}

.self-update-execution-steps li:last-child,
.self-update-steps li:last-child {
  border-bottom: 0;
}

.self-update-step-dot {
  width: 9px;
  height: 9px;
  justify-self: center;
  border: 2px solid var(--accent);
  border-radius: 999px;
}

.self-update-step-dot.is-succeeded {
  border-color: var(--success-text);
  background: var(--success-text);
}

.self-update-step-dot.is-running {
  border-color: var(--info-text);
  background: var(--info-text);
}

.self-update-step-dot.is-failed {
  border-color: var(--danger-text);
  background: var(--danger-text);
}

.self-update-step-dot.is-cancelled {
  border-color: var(--warning-text);
  background: var(--warning-text);
}

.self-update-execution-steps li > div,
.self-update-steps li > div {
  display: grid;
  gap: 2px;
}

.self-update-execution-steps strong,
.self-update-steps strong {
  color: var(--text);
  font-size: 10px;
}

.self-update-execution-steps small,
.self-update-steps small {
  color: var(--text-muted);
  font-size: 9px;
}

.self-update-log {
  margin-top: 14px;
}

.self-update-log :deep(.project-log-viewer-output) {
  max-height: 260px;
}

.self-update-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(2 12 20 / 72%);
  backdrop-filter: blur(4px);
}

.self-update-modal {
  width: min(560px, 100%);
  max-height: min(760px, calc(100vh - 48px));
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
  color: var(--text);
  box-shadow: 0 24px 80px rgb(0 0 0 / 38%);
}

.self-update-modal > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border);
}

.self-update-modal h3 {
  color: var(--text);
  font-size: 17px;
}

.self-update-modal header p {
  margin-top: 5px;
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.5;
}

.self-update-modal-close {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.self-update-modal-close:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.self-update-modal-close svg {
  width: 18px;
  height: 18px;
}

.self-update-modal-content {
  padding: 18px 20px 0;
}

.self-update-plan-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.self-update-plan-summary > div {
  display: grid;
  min-width: 0;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
}

.self-update-modal-section-title {
  margin-bottom: 6px;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
}

.self-update-warning {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-top: 12px;
  padding: 11px 12px;
  border: 1px solid color-mix(in srgb, var(--warning-text) 28%, var(--border));
  border-radius: var(--radius-sm);
  background: var(--warning-surface);
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

.self-update-modal > .self-update-plan-actions {
  margin-top: 18px;
  padding: 14px 20px;
  border-top: 1px solid var(--border);
}

.self-update-spin {
  animation: self-update-spin 900ms linear infinite;
}

@keyframes self-update-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 820px) {
  .self-update-hero {
    grid-template-columns: 1fr;
  }

  .self-update-hero-main,
  .self-update-hero-actions,
  .self-update-hero-meta {
    grid-column: 1;
  }

  .self-update-hero-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 620px) {
  .self-update-hero,
  .self-update-card {
    padding: 14px;
  }

  .self-update-hero-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .self-update-hero-actions button {
    width: 100%;
  }

  .self-update-hero-meta,
  .self-update-technical-grid,
  .self-update-plan-summary {
    grid-template-columns: 1fr;
  }

  .self-update-hero-meta > div {
    padding: 10px 0 0;
    border-left: 0;
  }

  .self-update-technical {
    padding: 0;
  }

  .self-update-technical-body {
    padding: 14px;
  }

  .self-update-execution-heading {
    flex-direction: column;
  }

  .self-update-modal-backdrop {
    padding: 12px;
  }

  .self-update-modal-content,
  .self-update-modal > header,
  .self-update-modal > .self-update-plan-actions {
    padding-right: 14px;
    padding-left: 14px;
  }

  .self-update-plan-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .self-update-plan-actions button {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .self-update-spin {
    animation: none;
  }
}
</style>
