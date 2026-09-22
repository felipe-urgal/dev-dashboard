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
  <section class="local-ci-panel" aria-labelledby="local-ci-title">
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
        <div class="local-ci-heading">
          <h3 id="local-ci-title">Local CI</h3>
          <p>Execute workflows do GitHub Actions localmente.</p>
        </div>

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
            @click="loadCatalog()"
          >
            <ArrowPathIcon aria-hidden="true" />
            Atualizar
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
          <template v-if="run.timedOut">Execução encerrada por timeout.</template>
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
  display: grid;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: var(--space-5);
}

.local-ci-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-6);
  padding-bottom: var(--space-5);
}

.local-ci-heading {
  min-width: 0;
}

.local-ci-heading h3,
.local-ci-heading p,
.local-ci-section-heading h4,
.local-ci-section-heading p,
.local-ci-result {
  margin: 0;
}

.local-ci-heading h3 {
  font-size: 22px;
  line-height: 1.25;
}

.local-ci-heading p {
  margin-top: var(--space-2);
  color: var(--text-muted);
}

.local-ci-environment {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-4);
  min-height: 40px;
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
  gap: var(--space-2);
  white-space: nowrap;
}

.local-ci-environment-item > svg,
.local-ci-refresh > svg,
.local-ci-start > svg {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
}

.local-ci-environment-item > svg {
  color: var(--text-muted);
}

.local-ci-environment-divider {
  width: 1px;
  height: 28px;
  background: var(--border);
}

.local-ci-availability {
  gap: var(--space-2);
  white-space: nowrap;
  color: var(--text-muted);
}

.local-ci-availability[data-state='available'] {
  color: var(--success-text);
}

.local-ci-availability[data-state='docker-unavailable'] {
  color: var(--warning-text);
}

.local-ci-availability-dot {
  width: 10px;
  height: 10px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: currentColor;
}

.local-ci-refresh {
  gap: var(--space-2);
  white-space: nowrap;
}

.local-ci-error {
  margin: 0 0 var(--space-4);
  color: var(--danger-text);
}

.local-ci-empty {
  margin: 0;
}

.local-ci-controls {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(180px, 0.7fr) auto;
  align-items: end;
  gap: var(--space-3);
}

.local-ci-controls label {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}

.local-ci-controls label > span {
  color: var(--text);
  font-size: var(--font-sm);
  font-weight: var(--font-weight-strong);
}

.local-ci-controls select {
  width: 100%;
  min-height: 44px;
  padding: 0 var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text);
}

.local-ci-controls small {
  min-height: 1em;
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

.local-ci-start {
  justify-content: center;
  gap: var(--space-2);
  min-height: 44px;
  white-space: nowrap;
}

.local-ci-boundary {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-5);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.local-ci-boundary > svg {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
}

.local-ci-run {
  display: grid;
  gap: var(--space-4);
  margin-top: var(--space-5);
  padding-top: var(--space-5);
  border-top: 1px solid var(--border);
}

.local-ci-section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
}

.local-ci-section-heading > div:first-child {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}

.local-ci-section-heading p,
.local-ci-result {
  color: var(--text-muted);
}

.local-ci-heading-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.local-ci-run-actions {
  display: flex;
  gap: var(--space-2);
  flex: 0 0 auto;
}

.local-ci-cancel {
  border-color: color-mix(in srgb, var(--danger-text) 45%, var(--border));
  color: var(--danger-text);
}

.local-ci-run-meta {
  display: flex;
  align-items: flex-start;
  gap: var(--space-5);
  margin: 0;
  flex-wrap: wrap;
}

.local-ci-run-meta div {
  display: flex;
  gap: var(--space-2);
  min-width: 0;
}

.local-ci-run-meta div + div {
  padding-left: var(--space-5);
  border-left: 1px solid var(--border);
}

.local-ci-run-meta dt {
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.local-ci-run-meta dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.local-ci-console {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-0);
}

.local-ci-console-bar {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.local-ci-console pre {
  min-height: 220px;
  max-height: 520px;
  margin: 0;
  padding: var(--space-4);
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: var(--font-sm);
  line-height: 1.55;
}

.local-ci-result {
  font-size: var(--font-sm);
}

@media (max-width: 1080px) {
  .local-ci-header {
    flex-direction: column;
    gap: var(--space-4);
  }

  .local-ci-environment {
    justify-content: flex-start;
  }
}

@media (max-width: 760px) {
  .local-ci-controls {
    grid-template-columns: minmax(0, 1fr) minmax(160px, 0.7fr);
  }

  .local-ci-start {
    width: max-content;
  }

  .local-ci-run-meta div + div {
    padding-left: 0;
    border-left: 0;
  }
}

@media (max-width: 560px) {
  .local-ci-panel {
    padding: var(--space-3);
  }

  .local-ci-controls {
    grid-template-columns: 1fr;
  }

  .local-ci-start,
  .local-ci-run-actions,
  .local-ci-run-actions button {
    width: 100%;
  }

  .local-ci-environment {
    align-items: flex-start;
    flex-direction: column;
    gap: var(--space-3);
  }

  .local-ci-environment-divider {
    display: none;
  }

  .local-ci-run-actions,
  .local-ci-section-heading {
    flex-direction: column;
  }

  .local-ci-run-meta {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-2);
  }
}
</style>
