<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import {
  ArrowPathIcon,
  CommandLineIcon,
  CubeIcon,
  InformationCircleIcon,
  PlayIcon,
} from '@heroicons/vue/24/outline';

import type { Project } from '@dev-dashboard/contracts';

import { ApiRequestError } from '../api/core';
import {
  cancelLocalCiRun,
  fetchLocalCiCatalog,
  fetchLocalCiRun,
  localCiWebSocketUrl,
  startLocalCiRun,
  type LocalCiCatalog,
  type LocalCiCatalogJob,
  type LocalCiExecutionSnapshot,
} from '../api/local-ci';
import EmptyState from './EmptyState.vue';
import StatusBadge from './StatusBadge.vue';
import type { StatusBadgeTone } from './status-badge-types';

const props = defineProps<{ project: Project }>();

type SocketMessage =
  | { type: 'ready'; run: LocalCiExecutionSnapshot }
  | { type: 'output'; data: string }
  | { type: 'exit'; run: LocalCiExecutionSnapshot }
  | { type: 'error'; message: string };

const MAX_CLIENT_LOG_CHARS = 200_000;

const catalog = ref<LocalCiCatalog | null>(null);
const loadingCatalog = ref(false);
const starting = ref(false);
const cancelling = ref(false);
const errorMessage = ref('');
const selectedJobKey = ref('');
const selectedEvent = ref('');
const run = ref<LocalCiExecutionSnapshot | null>(null);
const socketState = ref<'idle' | 'connecting' | 'connected' | 'disconnected'>(
  'idle',
);
let generation = 0;
let socket: WebSocket | undefined;

function jobKey(job: LocalCiCatalogJob): string {
  return job.workflowFile + '\u0000' + job.jobId;
}

const selectedJob = computed(
  () =>
    catalog.value?.jobs.find((job) => jobKey(job) === selectedJobKey.value) ??
    null,
);

const availabilityLabel = computed(() => {
  if (catalog.value?.availability.state === 'available') return 'Disponível';
  if (catalog.value?.availability.state === 'act-missing')
    return 'act não instalado';
  return 'Docker indisponível';
});

const canStart = computed(
  () =>
    catalog.value?.availability.state === 'available' &&
    selectedJob.value !== null &&
    selectedEvent.value.length > 0 &&
    !starting.value &&
    run.value?.status !== 'running',
);

const runTone = computed<StatusBadgeTone>(() => {
  if (run.value?.status === 'running') return 'warning';
  if (!run.value) return 'neutral';
  if (run.value.timedOut || run.value.exitCode !== 0) return 'danger';
  return 'success';
});

const runLabel = computed(() => {
  if (run.value?.status === 'running') return 'Em execução';
  if (!run.value) return 'Sem execução';
  if (run.value.timedOut) return 'Timeout';
  if (run.value.exitCode === 0) return 'Concluído';
  return 'Falhou';
});

const socketLabel = computed(() => {
  if (socketState.value === 'connected') return 'Conectado';
  if (socketState.value === 'connecting') return 'Conectando';
  if (socketState.value === 'disconnected') return 'Desconectado';
  return 'Inativo';
});

function storageKey(projectId: string): string {
  return 'dev-dashboard-local-ci:' + projectId + ':run';
}

function readStoredRunId(projectId: string): string | null {
  try {
    return window.sessionStorage.getItem(storageKey(projectId));
  } catch {
    return null;
  }
}

function storeRunId(projectId: string, runId: string): void {
  try {
    window.sessionStorage.setItem(storageKey(projectId), runId);
  } catch {
    // Reattach é conveniência; indisponibilidade de storage não bloqueia o run.
  }
}

function clearStoredRunId(projectId: string): void {
  try {
    window.sessionStorage.removeItem(storageKey(projectId));
  } catch {
    // Sem efeito operacional.
  }
}

function closeSocket(): void {
  const current = socket;
  socket = undefined;
  if (
    current &&
    current.readyState !== WebSocket.CLOSING &&
    current.readyState !== WebSocket.CLOSED
  ) {
    current.close();
  }
  socketState.value = 'idle';
}

function appendOutput(chunk: string): void {
  const current = run.value;
  if (!current || !chunk) return;

  const combined = current.logs + chunk;
  const clipped =
    combined.length > MAX_CLIENT_LOG_CHARS
      ? combined.slice(-MAX_CLIENT_LOG_CHARS)
      : combined;

  run.value = {
    ...current,
    logs: clipped,
    truncated: current.truncated || clipped.length !== combined.length,
  };
}

function parseSocketMessage(data: unknown): SocketMessage | null {
  if (typeof data !== 'string') return null;
  try {
    const parsed = JSON.parse(data) as {
      type?: unknown;
      run?: unknown;
      data?: unknown;
      message?: unknown;
    };
    if (
      (parsed.type === 'ready' || parsed.type === 'exit') &&
      parsed.run &&
      typeof parsed.run === 'object'
    ) {
      return {
        type: parsed.type,
        run: parsed.run as LocalCiExecutionSnapshot,
      };
    }
    if (parsed.type === 'output' && typeof parsed.data === 'string') {
      return { type: 'output', data: parsed.data };
    }
    if (parsed.type === 'error' && typeof parsed.message === 'string') {
      return { type: 'error', message: parsed.message };
    }
  } catch {
    return null;
  }
  return null;
}

function connect(runId: string): void {
  closeSocket();
  errorMessage.value = '';
  socketState.value = 'connecting';

  const next = new WebSocket(localCiWebSocketUrl(props.project.id, runId));
  socket = next;

  next.onopen = () => {
    if (socket === next) socketState.value = 'connected';
  };

  next.onmessage = (event) => {
    if (socket !== next) return;
    const message = parseSocketMessage(
      typeof event.data === 'string' ? event.data : null,
    );
    if (!message) return;

    if (message.type === 'ready') {
      run.value = message.run;
      storeRunId(props.project.id, message.run.id);
      return;
    }

    if (message.type === 'output') {
      appendOutput(message.data);
      return;
    }

    if (message.type === 'exit') {
      run.value = message.run;
      storeRunId(props.project.id, message.run.id);
      socketState.value = 'idle';
      next.close();
      return;
    }

    errorMessage.value = message.message;
  };

  next.onerror = () => {
    if (socket === next) {
      socketState.value = 'disconnected';
      errorMessage.value =
        'A conexão de streaming foi interrompida. O run pode ser reanexado.';
    }
  };

  next.onclose = () => {
    if (socket !== next) return;
    socket = undefined;
    if (run.value?.status === 'running') {
      socketState.value = 'disconnected';
    } else {
      socketState.value = 'idle';
    }
  };
}

function syncSelection(): void {
  const jobs = catalog.value?.jobs ?? [];
  const current = jobs.find((job) => jobKey(job) === selectedJobKey.value);
  const job = current ?? jobs[0];

  selectedJobKey.value = job ? jobKey(job) : '';
  if (!job) {
    selectedEvent.value = '';
    return;
  }

  if (!job.events.includes(selectedEvent.value)) {
    selectedEvent.value = job.events[0] ?? '';
  }
}

async function loadCatalog(requestGeneration = generation): Promise<void> {
  loadingCatalog.value = true;
  errorMessage.value = '';

  try {
    const nextCatalog = await fetchLocalCiCatalog(props.project.id);
    if (requestGeneration !== generation) return;
    catalog.value = nextCatalog;
    syncSelection();
  } catch (error) {
    if (requestGeneration !== generation) return;
    catalog.value = null;
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível carregar o catálogo Local CI.';
  } finally {
    if (requestGeneration === generation) loadingCatalog.value = false;
  }
}

async function restoreRun(requestGeneration = generation): Promise<void> {
  const runId = readStoredRunId(props.project.id);
  if (!runId) return;

  try {
    const snapshot = await fetchLocalCiRun(props.project.id, runId);
    if (requestGeneration !== generation) return;
    run.value = snapshot;
    if (snapshot.status === 'running') connect(snapshot.id);
  } catch (error) {
    if (requestGeneration !== generation) return;
    if (error instanceof ApiRequestError && error.status === 404) {
      clearStoredRunId(props.project.id);
      return;
    }
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível recuperar a execução Local CI.';
  }
}

async function startRun(): Promise<void> {
  const job = selectedJob.value;
  if (!job || !canStart.value) return;

  starting.value = true;
  errorMessage.value = '';

  try {
    const snapshot = await startLocalCiRun(props.project.id, {
      workflowFile: job.workflowFile,
      jobId: job.jobId,
      event: selectedEvent.value,
    });
    run.value = snapshot;
    storeRunId(props.project.id, snapshot.id);
    if (snapshot.status === 'running') connect(snapshot.id);
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível iniciar o run Local CI.';
  } finally {
    starting.value = false;
  }
}

async function cancelRun(): Promise<void> {
  if (!run.value || run.value.status !== 'running' || cancelling.value) return;

  cancelling.value = true;
  errorMessage.value = '';

  try {
    await cancelLocalCiRun(props.project.id, run.value.id);
    run.value = await fetchLocalCiRun(props.project.id, run.value.id);
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível cancelar o run Local CI.';
  } finally {
    cancelling.value = false;
  }
}

function reconnect(): void {
  if (run.value?.status === 'running') connect(run.value.id);
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
}

watch(selectedJobKey, () => syncSelection());

watch(
  () => props.project.id,
  () => {
    generation += 1;
    const requestGeneration = generation;
    closeSocket();
    catalog.value = null;
    run.value = null;
    selectedJobKey.value = '';
    selectedEvent.value = '';
    errorMessage.value = '';
    void loadCatalog(requestGeneration);
    void restoreRun(requestGeneration);
  },
  { immediate: true },
);

onBeforeUnmount(closeSocket);
</script>

<template>
  <section class="local-ci-panel" aria-label="Local CI">
    <EmptyState
      v-if="loadingCatalog"
      icon="•••"
      title="Carregando catálogo"
      description="Detectando workflows, jobs e disponibilidade do act."
    />

    <EmptyState
      v-else-if="!catalog"
      icon="!"
      title="Local CI indisponível"
      :description="
        errorMessage || 'Não foi possível carregar o catálogo Local CI.'
      "
    >
      <template #actions>
        <button class="primary-button" type="button" @click="loadCatalog()">
          Tentar novamente
        </button>
      </template>
    </EmptyState>

    <template v-else>
      <header class="local-ci-header">
        <div class="local-ci-environment" aria-label="Ambiente Local CI">
          <span class="local-ci-environment-item">
            <CommandLineIcon aria-hidden="true" />
            <strong>act {{ catalog.availability.actVersion ?? '—' }}</strong>
          </span>

          <span class="local-ci-environment-divider" aria-hidden="true" />

          <span class="local-ci-environment-item">
            <CubeIcon aria-hidden="true" />
            <strong>
              Docker {{ catalog.availability.dockerVersion ?? '—' }}
            </strong>
          </span>

          <span class="local-ci-environment-divider" aria-hidden="true" />

          <span
            class="local-ci-availability"
            :data-state="catalog.availability.state"
          >
            <span class="local-ci-availability-dot" aria-hidden="true" />
            <strong>{{ availabilityLabel }}</strong>
          </span>

          <button
            class="secondary-button local-ci-refresh"
            type="button"
            aria-label="Atualizar Local CI"
            title="Atualizar Local CI"
            @click="loadCatalog()"
          >
            <ArrowPathIcon
              :class="{ 'is-spinning': loadingCatalog }"
              aria-hidden="true"
            />
          </button>
        </div>
      </header>

      <p v-if="errorMessage" class="local-ci-error" role="alert">
        {{ errorMessage }}
      </p>

      <EmptyState
        v-if="catalog.jobs.length === 0"
        class="local-ci-empty"
        icon="—"
        title="Nenhum job compatível"
        description="Não há combinações de workflow, job e evento disponíveis no catálogo detectado."
      />

      <div v-else class="local-ci-controls">
        <label class="local-ci-workflow">
          <span>Workflow / Job</span>
          <select v-model="selectedJobKey">
            <option
              v-for="job in catalog.jobs"
              :key="jobKey(job)"
              :value="jobKey(job)"
            >
              {{ job.workflow }} · {{ job.job }}
            </option>
          </select>
          <small v-if="selectedJob">{{ selectedJob.workflowFile }}</small>
        </label>

        <label>
          <span>Evento</span>
          <select v-model="selectedEvent" :disabled="!selectedJob">
            <option
              v-for="eventName in selectedJob?.events ?? []"
              :key="eventName"
              :value="eventName"
            >
              {{ eventName }}
            </option>
          </select>
        </label>

        <button
          class="primary-button local-ci-start"
          type="button"
          :disabled="!canStart"
          @click="startRun"
        >
          <PlayIcon aria-hidden="true" />
          {{ starting ? 'Iniciando…' : 'Executar' }}
        </button>
      </div>

      <div class="local-ci-boundary" aria-label="Limite do Local CI">
        <InformationCircleIcon aria-hidden="true" />
        <span>
          Execução local — não substitui os checks oficiais do GitHub.
        </span>
      </div>

      <section
        v-if="run"
        class="local-ci-run"
        aria-labelledby="local-ci-current-title"
      >
        <div class="local-ci-section-heading">
          <div>
            <div class="local-ci-heading-row">
              <h4 id="local-ci-current-title">Execução atual</h4>
              <StatusBadge :tone="runTone">{{ runLabel }}</StatusBadge>
            </div>
            <p>
              {{ run.request.workflowFile }} · {{ run.request.jobId }} ·
              {{ run.request.event }}
            </p>
          </div>

          <div class="local-ci-run-actions">
            <button
              v-if="run.status === 'running' && socketState === 'disconnected'"
              class="secondary-button"
              type="button"
              @click="reconnect"
            >
              Reanexar
            </button>
            <button
              v-if="run.status === 'running'"
              class="secondary-button local-ci-cancel"
              type="button"
              :disabled="cancelling"
              @click="cancelRun"
            >
              {{ cancelling ? 'Cancelando…' : 'Cancelar' }}
            </button>
          </div>
        </div>

        <dl class="local-ci-run-meta">
          <div>
            <dt>Run</dt>
            <dd>{{ run.id }}</dd>
          </div>
          <div>
            <dt>Streaming</dt>
            <dd>{{ socketLabel }}</dd>
          </div>
          <div>
            <dt>Início</dt>
            <dd>{{ formatDate(run.startedAt) }}</dd>
          </div>
          <div>
            <dt>Fim</dt>
            <dd>{{ formatDate(run.endedAt) }}</dd>
          </div>
        </dl>

        <div class="local-ci-console">
          <div class="local-ci-console-bar">
            <span>Saída</span>
            <span v-if="run.truncated">buffer truncado</span>
          </div>
          <pre><code>{{ run.logs || 'Aguardando saída…' }}</code></pre>
        </div>

        <p v-if="run.status === 'exited'" class="local-ci-result">
          <template v-if="run.timedOut"
            >Execução encerrada por timeout.</template
          >
          <template v-else>
            Exit code {{ run.exitCode ?? '—' }}
            <template v-if="run.exitSignal !== null">
              · sinal {{ run.exitSignal }}
            </template>
          </template>
        </p>
      </section>
    </template>
  </section>
</template>

<style scoped>
.local-ci-panel {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: calc(100vh - var(--app-topbar-height, 72px));
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-1);
}

.local-ci-panel > :deep(.empty-state) {
  min-height: 0;
  flex: 1 1 auto;
  border: 0;
  border-radius: 0;
  background: var(--surface-1);
}

.local-ci-header {
  display: flex;
  min-height: 54px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  padding: 9px 12px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-1) 96%, var(--surface-2) 4%);
}

.local-ci-environment {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.local-ci-environment-item,
.local-ci-availability,
.local-ci-refresh,
.local-ci-start {
  display: inline-flex;
  align-items: center;
}

.local-ci-environment-item {
  gap: 6px;
  color: var(--text-muted);
  font-size: 10px;
  white-space: nowrap;
}

.local-ci-environment-item > svg,
.local-ci-refresh > svg,
.local-ci-start > svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
}

.local-ci-environment-item > svg {
  color: var(--text-muted);
}

.local-ci-environment-item strong {
  color: var(--text);
  font-size: 10px;
}

.local-ci-environment-divider {
  width: 1px;
  height: 20px;
  background: var(--border);
}

.local-ci-availability {
  gap: 6px;
  color: var(--text-muted);
  font-size: 10px;
  white-space: nowrap;
}

.local-ci-availability[data-state='available'] {
  color: var(--success-text);
}

.local-ci-availability[data-state='docker-unavailable'],
.local-ci-availability[data-state='act-missing'] {
  color: var(--warning-text);
}

.local-ci-availability-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: currentColor;
}

.local-ci-refresh {
  width: 34px;
  min-height: 34px;
  justify-content: center;
  padding: 0;
}

.local-ci-error {
  flex: 0 0 auto;
  margin: 0;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  color: var(--danger-text);
  background: var(--danger-surface);
  font-size: 10px;
}

.local-ci-empty {
  margin: 0;
}

.local-ci-controls {
  display: grid;
  min-height: 70px;
  flex: 0 0 auto;
  grid-template-columns: minmax(0, 1.7fr) minmax(160px, 0.55fr) auto;
  align-items: end;
  gap: 10px;
  padding: 9px 12px 10px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-1);
}

.local-ci-controls label {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.local-ci-controls label > span {
  color: var(--text-muted);
  font-size: 9px;
  font-weight: var(--font-weight-strong);
}

.local-ci-controls select {
  width: 100%;
  min-height: 34px;
  box-sizing: border-box;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  background: var(--surface-2);
  font: inherit;
  font-size: 10px;
}

.local-ci-controls small {
  overflow: hidden;
  min-height: 12px;
  color: var(--text-dim);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.local-ci-start {
  min-height: 34px;
  justify-content: center;
  gap: 6px;
  padding-inline: 12px;
  white-space: nowrap;
  font-size: 10px;
}

.local-ci-boundary {
  display: flex;
  min-height: 36px;
  flex: 0 0 auto;
  align-items: center;
  gap: 7px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--border);
  color: var(--text-dim);
  background: color-mix(in srgb, var(--surface-1) 96%, var(--surface-2) 4%);
  font-size: 9px;
}

.local-ci-boundary > svg {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
}

.local-ci-run {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-0);
}

.local-ci-section-heading {
  display: flex;
  min-height: 48px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}

.local-ci-section-heading > div:first-child {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.local-ci-heading-row,
.local-ci-run-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.local-ci-section-heading h4,
.local-ci-section-heading p,
.local-ci-result {
  margin: 0;
}

.local-ci-section-heading h4 {
  color: var(--text);
  font-size: 10px;
}

.local-ci-section-heading p {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.local-ci-run-actions button {
  min-height: 30px;
  font-size: 9px;
}

.local-ci-run-meta {
  display: grid;
  flex: 0 0 auto;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0;
  border-bottom: 1px solid var(--border);
  background: var(--surface-1);
}

.local-ci-run-meta > div {
  display: grid;
  min-width: 0;
  gap: 2px;
  padding: 8px 10px;
}

.local-ci-run-meta > div + div {
  border-left: 1px solid var(--border);
}

.local-ci-run-meta dt {
  color: var(--text-dim);
  font-size: 8px;
  font-weight: var(--font-weight-strong);
  text-transform: uppercase;
}

.local-ci-run-meta dd {
  overflow: hidden;
  margin: 0;
  color: var(--text-muted);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.local-ci-console {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  overflow: hidden;
  background: #10131c;
}

.local-ci-console-bar {
  display: flex;
  min-height: 36px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
  background: var(--surface-2);
  font-size: 9px;
}

.local-ci-console pre {
  min-height: 0;
  flex: 1 1 auto;
  margin: 0;
  overflow: auto;
  padding: 14px 16px 18px;
  color: var(--text);
  background: #10131c;
  font-family: var(--font-family-code);
  font-size: 10px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.local-ci-result {
  flex: 0 0 auto;
  padding: 7px 12px;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 9px;
}

.is-spinning {
  animation: local-ci-spin 0.8s linear infinite;
}

@keyframes local-ci-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .is-spinning {
    animation: none;
  }
}

@media (max-width: 860px) {
  .local-ci-controls {
    grid-template-columns: minmax(0, 1fr) minmax(150px, 0.6fr);
  }

  .local-ci-start {
    grid-column: 1 / -1;
  }

  .local-ci-run-meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .local-ci-run-meta > div:nth-child(3) {
    border-left: 0;
  }

  .local-ci-run-meta > div:nth-child(n + 3) {
    border-top: 1px solid var(--border);
  }
}

@media (max-width: 620px) {
  .local-ci-header {
    justify-content: flex-start;
  }

  .local-ci-environment {
    justify-content: flex-start;
  }

  .local-ci-environment-divider {
    display: none;
  }

  .local-ci-controls {
    grid-template-columns: 1fr;
  }

  .local-ci-start {
    grid-column: auto;
  }

  .local-ci-section-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .local-ci-run-meta {
    grid-template-columns: 1fr;
  }

  .local-ci-run-meta > div + div {
    border-top: 1px solid var(--border);
    border-left: 0;
  }
}
</style>
