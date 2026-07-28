<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type {
  ManagedProcess,
  Project,
  ProjectTestFile,
  ProjectTestOverview,
  ProjectTestRunner,
  TestExecutionRecord,
} from '@dev-dashboard/contracts';

import {
  clearProjectTestLog,
  fetchProjectTestFiles,
  fetchProjectTestHistory,
  fetchProjectTestLog,
  fetchProjectTestProcess,
  fetchProjectTests,
  followTestExecutionEvents,
  startProjectTest,
  startProjectTestFile,
  stopProjectTest,
} from '../api';
import { useAutoDismiss } from '../composables/useAutoDismiss';
import { noticeCenterStore } from '../stores/notice-center';
import Card from './Card.vue';

const props = defineProps<{ project: Project }>();

const overview = ref<ProjectTestOverview | null>(null);
const managedProcess = ref<ManagedProcess | null>(null);
const logContent = ref('');
const logTruncated = ref(false);
const loadingOverview = ref(false);
const startingCommandId = ref<string | null>(null);
const stopping = ref(false);
const errorMessage = ref('');

const openFilePickerCommandId = ref<string | null>(null);
const loadingFilesCommandId = ref<string | null>(null);
const testFiles = ref<ProjectTestFile[]>([]);
const selectedFilePath = ref('');
const fileErrorMessage = ref('');

const historyItems = ref<TestExecutionRecord[]>([]);
const historyPage = ref(1);
const historyTotalPages = ref(0);
const loadingHistory = ref(false);
const historyErrorMessage = ref('');
const HISTORY_PAGE_SIZE = 10;

useAutoDismiss(errorMessage, '');
useAutoDismiss(fileErrorMessage, '');
useAutoDismiss(historyErrorMessage, '');

let hasObservedRunning = false;
let lastStartedCommandId: string | null = null;
let generation = 0;
let closeExecutionEvents: (() => void) | null = null;
const realtimeRecoveryMessage = 'A conexão em tempo real foi interrompida. Recuperando o estado atual…';

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

function isCurrentProjectRequest(
  projectId: string,
  requestGeneration: number,
): boolean {
  return props.project.id === projectId && generation === requestGeneration;
}

async function loadOverview(refresh = false): Promise<void> {
  const projectId = props.project.id;
  const requestGeneration = generation;
  loadingOverview.value = true;
  errorMessage.value = '';
  try {
    const result = await fetchProjectTests(projectId, { refresh });
    if (isCurrentProjectRequest(projectId, requestGeneration)) {
      overview.value = result;
    }
  } catch (error) {
    if (isCurrentProjectRequest(projectId, requestGeneration)) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar os comandos de teste.';
    }
  } finally {
    if (isCurrentProjectRequest(projectId, requestGeneration)) {
      loadingOverview.value = false;
    }
  }
}

async function refreshProcess(): Promise<boolean> {
  const projectId = props.project.id;
  const requestGeneration = generation;
  try {
    const result = await fetchProjectTestProcess(projectId);
    if (!isCurrentProjectRequest(projectId, requestGeneration)) return true;
    managedProcess.value = result;

    if (result) {
      const log = await fetchProjectTestLog(projectId).catch(() => null);
      if (!isCurrentProjectRequest(projectId, requestGeneration)) return true;
      if (log) {
        logContent.value = log.content;
        logTruncated.value = log.truncated;
      }
    } else {
      logContent.value = '';
      logTruncated.value = false;
    }
    if (errorMessage.value === realtimeRecoveryMessage) errorMessage.value = '';
    return true;
  } catch (error) {
    if (isCurrentProjectRequest(projectId, requestGeneration)) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar o processo de testes.';
    }
    return false;
  }
}

async function followProcess(): Promise<void> {
  const projectId = props.project.id;
  const requestGeneration = generation;
  closeExecutionEvents?.();
  closeExecutionEvents = null;
  let reconnectDelay = 500;

  while (isCurrentProjectRequest(projectId, requestGeneration)) {
    const succeeded = await refreshProcess();
    if (!isCurrentProjectRequest(projectId, requestGeneration)) return;
    if (!succeeded) {
      await new Promise((resolve) => setTimeout(resolve, reconnectDelay));
      reconnectDelay = Math.min(reconnectDelay * 2, 5_000);
      continue;
    }
    if (!isRunning.value) {
      void loadHistory(1);
      return;
    }

    const stream = followTestExecutionEvents(projectId, (event) => {
      if (!isCurrentProjectRequest(projectId, requestGeneration)) return;
      if (event.type === 'state') {
        managedProcess.value = event.process;
      } else {
        logContent.value = event.log.content;
        logTruncated.value = event.log.truncated;
      }
    });
    closeExecutionEvents = stream.close;
    try {
      await stream.done;
      reconnectDelay = 500;
    } catch {
      if (isCurrentProjectRequest(projectId, requestGeneration)) {
        errorMessage.value = realtimeRecoveryMessage;
      }
    }
    if (closeExecutionEvents === stream.close) closeExecutionEvents = null;
    if (!isCurrentProjectRequest(projectId, requestGeneration)) return;

    if (!isRunning.value) {
      await refreshProcess();
      void loadHistory(1);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, reconnectDelay));
    reconnectDelay = Math.min(reconnectDelay * 2, 5_000);
  }
}

async function handleStart(commandId: string): Promise<void> {
  const projectId = props.project.id;
  const requestGeneration = generation;
  startingCommandId.value = commandId;
  lastStartedCommandId = commandId;
  errorMessage.value = '';
  try {
    const result = await startProjectTest(projectId, commandId);
    if (!isCurrentProjectRequest(projectId, requestGeneration)) return;
    managedProcess.value = result;
    logContent.value = '';
    logTruncated.value = false;
    void followProcess();
  } catch (error) {
    if (isCurrentProjectRequest(projectId, requestGeneration)) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível iniciar os testes.';
    }
  } finally {
    if (isCurrentProjectRequest(projectId, requestGeneration)) {
      startingCommandId.value = null;
    }
  }
}

async function toggleFilePicker(commandId: string): Promise<void> {
  if (openFilePickerCommandId.value === commandId) {
    openFilePickerCommandId.value = null;
    return;
  }
  const projectId = props.project.id;
  openFilePickerCommandId.value = commandId;
  selectedFilePath.value = '';
  fileErrorMessage.value = '';
  loadingFilesCommandId.value = commandId;
  testFiles.value = [];
  try {
    const files = await fetchProjectTestFiles(projectId, commandId);
    if (projectId !== props.project.id || openFilePickerCommandId.value !== commandId) return;
    testFiles.value = files;
  } catch (error) {
    if (projectId === props.project.id && openFilePickerCommandId.value === commandId) {
      fileErrorMessage.value = error instanceof Error ? error.message : 'Não foi possível listar os arquivos de teste.';
    }
  } finally {
    if (loadingFilesCommandId.value === commandId) {
      loadingFilesCommandId.value = null;
    }
  }
}

async function handleStartFile(commandId: string): Promise<void> {
  const projectId = props.project.id;
  const requestGeneration = generation;
  const filePath = selectedFilePath.value;
  if (!filePath) return;
  startingCommandId.value = commandId;
  lastStartedCommandId = commandId;
  errorMessage.value = '';
  fileErrorMessage.value = '';
  try {
    const result = await startProjectTestFile(projectId, commandId, filePath);
    if (!isCurrentProjectRequest(projectId, requestGeneration)) return;
    managedProcess.value = result;
    logContent.value = '';
    logTruncated.value = false;
    openFilePickerCommandId.value = null;
    void followProcess();
  } catch (error) {
    if (isCurrentProjectRequest(projectId, requestGeneration)) {
      fileErrorMessage.value = error instanceof Error ? error.message : 'Não foi possível iniciar o arquivo de teste.';
    }
  } finally {
    if (isCurrentProjectRequest(projectId, requestGeneration)) {
      startingCommandId.value = null;
    }
  }
}

async function loadHistory(page = historyPage.value): Promise<void> {
  const projectId = props.project.id;
  const requestGeneration = generation;
  loadingHistory.value = true;
  historyErrorMessage.value = '';
  try {
    const result = await fetchProjectTestHistory(projectId, page, HISTORY_PAGE_SIZE);
    if (!isCurrentProjectRequest(projectId, requestGeneration)) return;
    historyItems.value = result.items;
    historyPage.value = result.page;
    historyTotalPages.value = result.totalPages;
  } catch (error) {
    if (isCurrentProjectRequest(projectId, requestGeneration)) {
      historyErrorMessage.value = error instanceof Error ? error.message : 'Não foi possível carregar o histórico de execuções.';
    }
  } finally {
    if (isCurrentProjectRequest(projectId, requestGeneration)) {
      loadingHistory.value = false;
    }
  }
}

async function handleStop(): Promise<void> {
  const projectId = props.project.id;
  const requestGeneration = generation;
  stopping.value = true;
  errorMessage.value = '';
  try {
    const result = await stopProjectTest(projectId);
    if (!isCurrentProjectRequest(projectId, requestGeneration)) return;
    managedProcess.value = result;
    await refreshProcess();
  } catch (error) {
    if (isCurrentProjectRequest(projectId, requestGeneration)) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível interromper os testes.';
    }
  } finally {
    if (isCurrentProjectRequest(projectId, requestGeneration)) {
      stopping.value = false;
    }
  }
}

async function handleClearLogs(): Promise<void> {
  const projectId = props.project.id;
  const requestGeneration = generation;
  errorMessage.value = '';
  try {
    const log = await clearProjectTestLog(projectId);
    if (!isCurrentProjectRequest(projectId, requestGeneration)) return;
    logContent.value = log.content;
    logTruncated.value = log.truncated;
  } catch (error) {
    if (isCurrentProjectRequest(projectId, requestGeneration)) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível limpar o log.';
    }
  }
}

watch(managedProcess, (proc) => {
  if (!proc) return;
  if (proc.status === 'starting' || proc.status === 'running' || proc.status === 'stopping') {
    hasObservedRunning = true;
    return;
  }
  if (!hasObservedRunning) return;
  if (proc.status !== 'stopped' && proc.status !== 'failed') return;

  const effectiveCommandId = startingCommandId.value || lastStartedCommandId;
  const commandLabel = overview.value?.commands.find(
    (c) => c.id === effectiveCommandId,
  )?.label ?? 'Testes';

  noticeCenterStore.publishTerminalNotice({
    origin: 'test',
    dedupeKey: `test:${proc.id}:${proc.status}`,
    outcome: proc.status,
    projectId: props.project.id,
    projectName: props.project.name,
    label: commandLabel,
    routeTo: { name: 'project-tests', params: { projectId: props.project.id } },
  });
});

watch(
  () => props.project.id,
  () => {
    generation += 1;
    closeExecutionEvents?.();
    closeExecutionEvents = null;
    hasObservedRunning = false;
    lastStartedCommandId = null;
    overview.value = null;
    managedProcess.value = null;
    logContent.value = '';
    logTruncated.value = false;
    startingCommandId.value = null;
    stopping.value = false;
    errorMessage.value = '';
    openFilePickerCommandId.value = null;
    loadingFilesCommandId.value = null;
    testFiles.value = [];
    selectedFilePath.value = '';
    fileErrorMessage.value = '';
    historyItems.value = [];
    historyPage.value = 1;
    historyTotalPages.value = 0;
    historyErrorMessage.value = '';
    void loadOverview();
    void followProcess();
    void loadHistory(1);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  closeExecutionEvents?.();
  closeExecutionEvents = null;
});
</script>

<template>
  <Card padded class="project-detail-card">
    <template #header>
      <div class="project-panel-heading">
        <span class="section-kicker">Qualidade</span>
        <h3>Testes</h3>
        <p>
          Estado: <strong>{{ statusLabel }}</strong>
          <span v-if="duration"> · {{ duration }}</span>
        </p>
      </div>
    </template>
    <template #actions>
      <button
        type="button"
        class="secondary-button"
        :disabled="loadingOverview"
        @click="loadOverview(true)"
      >
        {{ loadingOverview ? 'Atualizando...' : 'Atualizar' }}
      </button>
    </template>

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
          <div class="tests-command-actions">
            <button
              type="button"
              class="primary-button"
              :disabled="isRunning || startingCommandId !== null"
              @click="handleStart(command.id)"
            >
              {{ startingCommandId === command.id ? 'Iniciando...' : 'Executar' }}
            </button>
            <button
              v-if="command.supportsFileTarget"
              type="button"
              class="secondary-button"
              :disabled="isRunning || startingCommandId !== null"
              @click="toggleFilePicker(command.id)"
            >
              {{ openFilePickerCommandId === command.id ? 'Fechar' : 'Executar arquivo' }}
            </button>
          </div>

          <div
            v-if="command.supportsFileTarget && openFilePickerCommandId === command.id"
            class="tests-file-picker"
          >
            <p v-if="fileErrorMessage" class="project-error" role="alert">{{ fileErrorMessage }}</p>
            <p v-else-if="loadingFilesCommandId === command.id" class="tests-log-empty">Carregando arquivos…</p>
            <p v-else-if="testFiles.length === 0" class="tests-log-empty">Nenhum arquivo de teste encontrado.</p>
            <template v-else>
              <select v-model="selectedFilePath">
                <option value="" disabled>Selecione um arquivo</option>
                <option v-for="file in testFiles" :key="file.path" :value="file.path">{{ file.path }}</option>
              </select>
              <button
                type="button"
                class="primary-button"
                :disabled="isRunning || startingCommandId !== null || !selectedFilePath"
                @click="handleStartFile(command.id)"
              >
                {{ startingCommandId === command.id ? 'Iniciando...' : 'Executar arquivo selecionado' }}
              </button>
            </template>
          </div>
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

    <div class="tests-history">
      <div class="tests-history-heading">
        <h4>Histórico de execuções</h4>
        <button type="button" class="secondary-button" :disabled="loadingHistory" @click="loadHistory()">
          {{ loadingHistory ? 'Atualizando...' : 'Atualizar' }}
        </button>
      </div>

      <p v-if="historyErrorMessage" class="project-error" role="alert">{{ historyErrorMessage }}</p>
      <p v-else-if="historyItems.length === 0" class="tests-log-empty">Nenhuma execução registrada ainda.</p>
      <ul v-else class="tests-history-list">
        <li v-for="item in historyItems" :key="item.id">
          <div>
            <strong>{{ item.commandId }}</strong>
            <span v-if="item.targetFile" class="tests-command-label">{{ item.targetFile }}</span>
          </div>
          <span class="tests-history-status" :class="`tests-history-status-${item.status}`">{{ item.status }}</span>
          <span>{{ formatTimestamp(item.startedAt) }}</span>
          <span>{{ item.exitCode ?? '—' }}</span>
        </li>
      </ul>

      <div v-if="historyTotalPages > 1" class="tests-history-pagination">
        <button type="button" class="secondary-button" :disabled="loadingHistory || historyPage <= 1" @click="loadHistory(historyPage - 1)">
          Anterior
        </button>
        <span>Página {{ historyPage }} de {{ historyTotalPages }}</span>
        <button type="button" class="secondary-button" :disabled="loadingHistory || historyPage >= historyTotalPages" @click="loadHistory(historyPage + 1)">
          Próxima
        </button>
      </div>
    </div>
  </Card>
</template>

<style scoped>
.tests-commands ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.75rem; }
.tests-command-item { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 0.75rem 1rem; border: 1px solid var(--color-border, #d5d5dc); border-radius: 8px; flex-wrap: wrap; }
.tests-command-item p { margin: 0.25rem 0; color: var(--color-text-muted, #6b6b74); }
.tests-command-label { margin-left: 0.5rem; font-family: ui-monospace, monospace; font-size: 0.9em; }
.tests-command-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.tests-file-picker { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; flex-basis: 100%; width: 100%; padding-top: 0.5rem; border-top: 1px solid var(--color-border, #d5d5dc); }
.tests-file-picker select { flex: 1 1 220px; min-width: 180px; padding: 0.4rem 0.6rem; border-radius: 6px; border: 1px solid var(--color-border, #d5d5dc); }
.tests-run-details dl { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.5rem 1rem; margin: 0.5rem 0 1rem; }
.tests-run-details dt { font-size: 0.75rem; text-transform: uppercase; color: var(--color-text-muted, #6b6b74); }
.tests-run-details dd { margin: 0; }
.tests-log-toolbar { display: flex; gap: 0.5rem; margin: 0.5rem 0; flex-wrap: wrap; }
.tests-log-output { background: var(--color-surface-alt, #1a1a20); color: #f2f2f5; padding: 0.75rem; border-radius: 8px; overflow: auto; max-height: 320px; white-space: pre; font-family: ui-monospace, monospace; font-size: 0.85rem; }
.tests-log-truncated { color: #f5c17a; }
.tests-log-empty { color: var(--color-text-muted, #6b6b74); font-style: italic; }
.tests-history { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--color-border, #d5d5dc); }
.tests-history-heading { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 0.5rem; }
.tests-history-heading h4 { margin: 0; }
.tests-history-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.tests-history-list li { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; border: 1px solid var(--color-border, #d5d5dc); border-radius: 8px; flex-wrap: wrap; font-size: 0.85rem; }
.tests-history-list li > div { flex: 1 1 160px; }
.tests-history-status { text-transform: capitalize; }
.tests-history-status-failed { color: #d9534f; }
.tests-history-status-stopped { color: var(--color-text-muted, #6b6b74); }
.tests-history-status-running, .tests-history-status-starting, .tests-history-status-stopping { color: #f5c17a; }
.tests-history-pagination { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.5rem; font-size: 0.85rem; }
</style>
