<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type {
  ManagedProcess,
  Project,
  ProjectTestOverview,
  ProjectTestRunner,
} from '@dev-dashboard/contracts';

import {
  clearProjectTestLog,
  fetchProjectTestLog,
  fetchProjectTestProcess,
  fetchProjectTests,
  startProjectTest,
  stopProjectTest,
} from '../api';

const props = defineProps<{ project: Project }>();

const overview = ref<ProjectTestOverview | null>(null);
const managedProcess = ref<ManagedProcess | null>(null);
const logContent = ref('');
const logTruncated = ref(false);
const loadingOverview = ref(false);
const startingCommandId = ref<string | null>(null);
const stopping = ref(false);
const errorMessage = ref('');

let generation = 0;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let consecutiveFailures = 0;
const MAX_POLL_FAILURES = 5;

const runnerLabels: Record<ProjectTestRunner, string> = {
  vitest: 'Vitest',
  jest: 'Jest',
  'node-test': 'Node Test Runner',
  rspec: 'RSpec',
  'rails-test': 'Rails Test',
  minitest: 'Minitest',
  pytest: 'pytest',
};

const status = computed(() => {
  const value = managedProcess.value;
  if (!value) return 'idle' as const;
  return value.status;
});

const statusLabel = computed(() => {
  const value = managedProcess.value;
  if (!value) return 'Ocioso';
  switch (value.status) {
    case 'starting':
      return 'Iniciando';
    case 'running':
      return 'Executando';
    case 'stopping':
      return 'Interrompendo';
    case 'stopped':
      return value.exitCode === 0
        ? 'Concluído com sucesso'
        : 'Encerrado';
    case 'failed':
      return value.exitCode !== undefined
        ? `Falhou (código ${value.exitCode})`
        : 'Falhou';
    default:
      return value.status;
  }
});

const duration = computed(() => {
  const value = managedProcess.value;
  if (!value?.startedAt) return null;
  const end = value.stoppedAt
    ? new Date(value.stoppedAt).getTime()
    : Date.now();
  const start = new Date(value.startedAt).getTime();
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
});

const isRunning = computed(
  () =>
    status.value === 'starting' ||
    status.value === 'running' ||
    status.value === 'stopping',
);

function formatTimestamp(value: string | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));
}

async function loadOverview(refresh = false): Promise<void> {
  const requestGeneration = ++generation;
  loadingOverview.value = true;
  errorMessage.value = '';
  consecutiveFailures = 0;
  try {
    const result = await fetchProjectTests(props.project.id, {
      refresh,
    });
    if (requestGeneration === generation) overview.value = result;
  } catch (error) {
    if (requestGeneration === generation) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar os comandos de teste.';
    }
  } finally {
    if (requestGeneration === generation) loadingOverview.value = false;
  }
}

async function refreshProcess(): Promise<boolean> {
  const requestGeneration = generation;
  try {
    const result = await fetchProjectTestProcess(props.project.id);
    if (requestGeneration !== generation) return true;
    managedProcess.value = result;

    if (result) {
      const log = await fetchProjectTestLog(props.project.id).catch(
        () => null,
      );
      if (requestGeneration !== generation) return true;
      if (log) {
        logContent.value = log.content;
        logTruncated.value = log.truncated;
      }
    } else {
      logContent.value = '';
      logTruncated.value = false;
    }
    consecutiveFailures = 0;
    return true;
  } catch (error) {
    if (requestGeneration === generation) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar o processo de testes.';
    }
    return false;
  }
}

function schedulePolling(): void {
  clearPolling();
  pollTimer = setTimeout(async () => {
    if (!isRunning.value) return;
    const succeeded = await refreshProcess();
    if (succeeded) {
      consecutiveFailures = 0;
      schedulePolling();
      return;
    }
    consecutiveFailures += 1;
    if (consecutiveFailures >= MAX_POLL_FAILURES) {
      errorMessage.value =
        'Interrompendo atualização automática após falhas consecutivas. Use Atualizar para tentar novamente.';
      return;
    }
    schedulePolling();
  }, 1500);
}

function clearPolling(): void {
  if (pollTimer !== null) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

async function handleStart(commandId: string): Promise<void> {
  startingCommandId.value = commandId;
  errorMessage.value = '';
  try {
    const result = await startProjectTest(props.project.id, commandId);
    managedProcess.value = result;
    logContent.value = '';
    logTruncated.value = false;
    schedulePolling();
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível iniciar os testes.';
  } finally {
    startingCommandId.value = null;
  }
}

async function handleStop(): Promise<void> {
  stopping.value = true;
  errorMessage.value = '';
  try {
    const result = await stopProjectTest(props.project.id);
    managedProcess.value = result;
    await refreshProcess();
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível interromper os testes.';
  } finally {
    stopping.value = false;
  }
}

async function handleClearLogs(): Promise<void> {
  errorMessage.value = '';
  try {
    const log = await clearProjectTestLog(props.project.id);
    logContent.value = log.content;
    logTruncated.value = log.truncated;
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível limpar o log.';
  }
}

watch(
  () => props.project.id,
  () => {
    clearPolling();
    overview.value = null;
    managedProcess.value = null;
    logContent.value = '';
    logTruncated.value = false;
    void loadOverview();
    void refreshProcess();
  },
  { immediate: true },
);

watch(isRunning, (running) => {
  if (running) {
    schedulePolling();
  } else {
    clearPolling();
  }
});

onBeforeUnmount(clearPolling);
</script>

<template>
  <section class="project-tests-panel">
    <header class="tests-panel-header">
      <div>
        <span class="section-kicker">Qualidade</span>
        <h3>Testes</h3>
        <p>
          Estado: <strong>{{ statusLabel }}</strong>
          <span v-if="duration"> · {{ duration }}</span>
        </p>
      </div>
      <button
        type="button"
        class="secondary-button"
        :disabled="loadingOverview"
        @click="loadOverview(true)"
      >
        {{ loadingOverview ? 'Atualizando...' : 'Atualizar' }}
      </button>
    </header>

    <div v-if="errorMessage" class="project-error" role="alert">
      {{ errorMessage }}
    </div>

    <div v-if="overview && !overview.supported" class="git-empty-state">
      <strong>Nenhum runner de testes reconhecido para este projeto.</strong>
      <p>
        Verificamos scripts do package.json, binários em node_modules,
        Gemfile e configurações de pytest. Nada foi identificado.
      </p>
    </div>

    <div v-else-if="overview" class="tests-commands">
      <h4>Comandos detectados</h4>
      <ul>
        <li
          v-for="command in overview.commands"
          :key="command.id"
          class="tests-command-item"
        >
          <div>
            <strong>{{ runnerLabels[command.runner] }}</strong>
            <span class="tests-command-label">{{ command.label }}</span>
            <p>{{ command.description }}</p>
            <small>Origem: {{ command.origin }}<span v-if="command.originDetail"> · {{ command.originDetail }}</span></small>
          </div>
          <button
            type="button"
            class="primary-button"
            :disabled="isRunning || startingCommandId !== null"
            @click="handleStart(command.id)"
          >
            {{ startingCommandId === command.id ? 'Iniciando...' : 'Executar' }}
          </button>
        </li>
      </ul>
    </div>

    <div v-if="managedProcess" class="tests-run-details">
      <h4>Execução atual</h4>
      <dl>
        <div><dt>Início</dt><dd>{{ formatTimestamp(managedProcess.startedAt) }}</dd></div>
        <div><dt>Término</dt><dd>{{ formatTimestamp(managedProcess.stoppedAt) }}</dd></div>
        <div><dt>Exit code</dt><dd>{{ managedProcess.exitCode ?? '—' }}</dd></div>
        <div><dt>Comando</dt><dd><code>{{ managedProcess.command }} {{ (managedProcess.args ?? []).join(' ') }}</code></dd></div>
      </dl>

      <div class="tests-log-toolbar">
        <button
          v-if="isRunning"
          type="button"
          class="secondary-button"
          :disabled="stopping"
          @click="handleStop"
        >
          {{ stopping ? 'Interrompendo...' : 'Interromper' }}
        </button>
        <button
          type="button"
          class="secondary-button"
          :disabled="isRunning"
          @click="handleClearLogs"
        >
          Limpar logs
        </button>
      </div>

      <pre v-if="logContent" class="tests-log-output"><span v-if="logTruncated" class="tests-log-truncated">... log truncado ...
</span>{{ logContent }}</pre>
      <p v-else class="tests-log-empty">Sem saída registrada ainda.</p>
    </div>
  </section>
</template>

<style scoped>
.project-tests-panel { display: flex; flex-direction: column; gap: 1rem; }
.tests-panel-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
.tests-commands ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.75rem; }
.tests-command-item { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 0.75rem 1rem; border: 1px solid var(--color-border, #d5d5dc); border-radius: 8px; flex-wrap: wrap; }
.tests-command-item p { margin: 0.25rem 0; color: var(--color-text-muted, #6b6b74); }
.tests-command-label { margin-left: 0.5rem; font-family: ui-monospace, monospace; font-size: 0.9em; }
.tests-run-details dl { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.5rem 1rem; margin: 0.5rem 0 1rem; }
.tests-run-details dt { font-size: 0.75rem; text-transform: uppercase; color: var(--color-text-muted, #6b6b74); }
.tests-run-details dd { margin: 0; }
.tests-log-toolbar { display: flex; gap: 0.5rem; margin: 0.5rem 0; flex-wrap: wrap; }
.tests-log-output { background: var(--color-surface-alt, #1a1a20); color: #f2f2f5; padding: 0.75rem; border-radius: 8px; overflow: auto; max-height: 320px; white-space: pre; font-family: ui-monospace, monospace; font-size: 0.85rem; }
.tests-log-truncated { color: #f5c17a; }
.tests-log-empty { color: var(--color-text-muted, #6b6b74); font-style: italic; }
</style>
