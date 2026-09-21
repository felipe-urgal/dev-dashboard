<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { ExclamationTriangleIcon } from '@heroicons/vue/24/outline';

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

const availabilityTone = computed<StatusBadgeTone>(() => {
  if (catalog.value?.availability.state === 'available') return 'success';
  if (catalog.value?.availability.state === 'act-missing') return 'neutral';
  return 'warning';
});

const availabilityLabel = computed(() => {
  if (catalog.value?.availability.state === 'available') return 'Disponível';
  if (catalog.value?.availability.state === 'act-missing')
    return 'act não instalado';
  return 'Docker indisponível';
});

const availabilityDescription = computed(() => {
  if (catalog.value?.availability.state === 'available') {
    return 'act e Docker estão disponíveis para executar os jobs detectados.';
  }
  if (catalog.value?.availability.state === 'act-missing') {
    return 'O provider act não está disponível no PATH da API.';
  }
  return 'act foi detectado, mas o Docker não está disponível para executar o workflow.';
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
    <header class="local-ci-header">
      <div>
        <span class="local-ci-eyebrow">GitHub Actions local</span>
        <h3 id="local-ci-title">Local CI</h3>
        <p>Execute jobs detectados no repositório usando act.</p>
      </div>
      <StatusBadge tone="warning" size="md">Local / aproximação</StatusBadge>
    </header>

    <section class="local-ci-boundary" aria-label="Limite do Local CI">
      <ExclamationTriangleIcon aria-hidden="true" />
      <div>
        <strong>Não substitui o GitHub CI</strong>
        <p>
          O resultado executa código do repositório na sua máquina e nunca é
          tratado como check remoto oficial ou evidência suficiente de
          Readiness.
        </p>
      </div>
    </section>

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
      <section class="local-ci-availability" aria-label="Disponibilidade">
        <div class="local-ci-availability-copy">
          <div class="local-ci-heading-row">
            <strong>Provider act</strong>
            <StatusBadge :tone="availabilityTone">
              {{ availabilityLabel }}
            </StatusBadge>
          </div>
          <p>{{ availabilityDescription }}</p>
        </div>
        <div class="local-ci-metric">
          <span>act</span>
          <strong>{{ catalog.availability.actVersion ?? '—' }}</strong>
        </div>
        <div class="local-ci-metric">
          <span>Docker</span>
          <strong>{{ catalog.availability.dockerVersion ?? '—' }}</strong>
        </div>
        <button class="secondary-button" type="button" @click="loadCatalog()">
          Atualizar
        </button>
      </section>

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

      <section
        v-else
        class="local-ci-launcher"
        aria-labelledby="local-ci-run-title"
      >
        <div class="local-ci-section-heading">
          <div>
            <h4 id="local-ci-run-title">Executar job</h4>
            <p>
              A seleção abaixo vem exclusivamente do catálogo validado pelo
              backend.
            </p>
          </div>
          <span>{{ catalog.jobs.length }} job(s)</span>
        </div>

        <div class="local-ci-controls">
          <label>
            <span>Workflow / job</span>
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
            {{ starting ? 'Iniciando…' : 'Executar localmente' }}
          </button>
        </div>
      </section>

      <section
        v-if="run"
        class="local-ci-run"
        aria-labelledby="local-ci-current-title"
      >
        <div class="local-ci-section-heading local-ci-run-heading">
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
  display: grid;
  min-width: 0;
}

.local-ci-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-5) var(--space-4);
}

.local-ci-header h3,
.local-ci-header p,
.local-ci-boundary p,
.local-ci-availability p,
.local-ci-section-heading h4,
.local-ci-section-heading p,
.local-ci-result {
  margin: 0;
}

.local-ci-header h3 {
  margin-top: var(--space-1);
}

.local-ci-header p,
.local-ci-boundary p,
.local-ci-availability p,
.local-ci-section-heading p,
.local-ci-section-heading > span,
.local-ci-result,
.local-ci-controls small {
  color: var(--text-muted);
}

.local-ci-eyebrow,
.local-ci-metric span,
.local-ci-controls label > span,
.local-ci-run-meta dt {
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.local-ci-boundary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-3);
  margin: 0 var(--space-5);
  padding: var(--space-4);
  border: 1px solid color-mix(in srgb, var(--warning-text) 40%, var(--border));
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--warning-text) 8%, transparent);
}

.local-ci-boundary svg {
  width: 22px;
  color: var(--warning-text);
}

.local-ci-boundary div {
  display: grid;
  gap: var(--space-1);
}

.local-ci-availability {
  display: grid;
  grid-template-columns:
    minmax(220px, 1.5fr) minmax(120px, 0.6fr) minmax(120px, 0.6fr)
    auto;
  align-items: center;
  gap: var(--space-4);
  margin: var(--space-4) var(--space-5) 0;
  padding: var(--space-4) 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.local-ci-availability-copy,
.local-ci-metric {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}

.local-ci-heading-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.local-ci-metric strong,
.local-ci-run-meta dd {
  overflow-wrap: anywhere;
}

.local-ci-error {
  margin: var(--space-3) var(--space-5) 0;
  color: var(--danger-text);
}

.local-ci-empty {
  margin: var(--space-5);
}

.local-ci-launcher,
.local-ci-run {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
}

.local-ci-launcher {
  border-bottom: 1px solid var(--border);
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
}

.local-ci-section-heading > span {
  font-size: var(--font-xs);
  white-space: nowrap;
}

.local-ci-controls {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(150px, 0.7fr) auto;
  align-items: end;
  gap: var(--space-3);
}

.local-ci-controls label {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}

.local-ci-controls select {
  width: 100%;
  min-height: 40px;
  padding: 0 var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text);
}

.local-ci-controls small {
  overflow-wrap: anywhere;
}

.local-ci-start {
  white-space: nowrap;
}

.local-ci-run {
  padding-top: 0;
}

.local-ci-run-heading {
  padding-top: var(--space-5);
}

.local-ci-run-actions {
  display: flex;
  gap: var(--space-2);
}

.local-ci-cancel {
  border-color: color-mix(in srgb, var(--danger-text) 45%, var(--border));
  color: var(--danger-text);
}

.local-ci-run-meta {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
  margin: 0;
}

.local-ci-run-meta div {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
}

.local-ci-run-meta dd {
  margin: 0;
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

@media (max-width: 920px) {
  .local-ci-availability {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .local-ci-controls {
    grid-template-columns: 1fr 1fr;
  }

  .local-ci-start {
    justify-self: start;
  }

  .local-ci-run-meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .local-ci-header,
  .local-ci-section-heading {
    flex-direction: column;
  }

  .local-ci-availability,
  .local-ci-controls,
  .local-ci-run-meta {
    grid-template-columns: 1fr;
  }

  .local-ci-start,
  .local-ci-run-actions,
  .local-ci-run-actions button {
    width: 100%;
  }

  .local-ci-run-actions {
    flex-direction: column;
  }
}
</style>
