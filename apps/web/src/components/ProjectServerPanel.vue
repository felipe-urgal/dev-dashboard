<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue';

import type {
  ManagedProcess,
  ProcessLogSnapshot,
  Project,
  ProjectServerSettings,
} from '@dev-dashboard/contracts';

import {
  clearProjectProcessLog,
  fetchProjectProcess,
  fetchProjectProcessLog,
  fetchProjectServerSettings,
  saveProjectServerSettings,
  startProjectProcess,
  stopProjectProcess,
} from '../api';

import {
  RequestGate,
  RequestGeneration,
} from '../utils/request-generation';

import { parseServerPort } from '../utils/server-settings';
import Card from './Card.vue';

const props = withDefaults(
  defineProps<{
    project: Project;
    mode?: 'compact' | 'details';
    defaultLogsOpen?: boolean;
  }>(),
  {
    mode: 'compact',
    defaultLogsOpen: false,
  },
);

const managedProcess = ref<ManagedProcess | null>(null);
const loadingStatus = ref(false);
const executingAction = ref(false);
const errorMessage = ref('');

const serverSettings = ref<ProjectServerSettings | null>(null);
const selectedPort = ref<string | number>('');
const loadingSettings = ref(false);
const savingSettings = ref(false);
const settingsMessage = ref('');

const showLogs = ref(props.defaultLogsOpen);
const loadingLogs = ref(false);
const logSnapshot = ref<ProcessLogSnapshot | null>(null);
const logErrorMessage = ref('');
const logContainer = ref<HTMLElement | null>(null);
const followLogs = ref(true);

let processPollingTimer: ReturnType<typeof setTimeout> | undefined;
let logPollingTimer: ReturnType<typeof setTimeout> | undefined;
const projectRequests = new RequestGeneration();
const logRequests = new RequestGeneration();
const processRequestGate = new RequestGate();
const logRequestGate = new RequestGate();
let clearingLog = false;

const supportsServer = computed(() =>
  props.project.capabilities.includes('server'),
);

const detailsMode = computed(() => props.mode === 'details');

const hasManagedProcess = computed(
  () => managedProcess.value !== null,
);

const processStatus = computed(
  () => managedProcess.value?.status ?? 'stopped',
);

const isRunning = computed(
  () =>
    processStatus.value === 'running' ||
    processStatus.value === 'starting',
);

const canStop = computed(
  () => isRunning.value || processStatus.value === 'stopping',
);

const processUrls = computed<string[]>(() => {
  if (processStatus.value !== 'running') {
    return [];
  }

  if (managedProcess.value?.urls?.length) {
    return managedProcess.value.urls;
  }

  if (managedProcess.value?.url) {
    return [managedProcess.value.url];
  }

  const port = managedProcess.value?.port;

  return port ? [`http://localhost:${port}`] : [];
});

const settingsPortPreview = computed(() => {
  const port = String(selectedPort.value ?? '').trim();
  return port ? `Porta fixa: ${port}` : 'Porta automática';
});

const formattedLogSize = computed(() => {
  const size = logSnapshot.value?.sizeBytes ?? 0;

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
});

const statusLabel = computed(() => {
  if (!supportsServer.value) {
    return 'Sem servidor';
  }

  if (loadingStatus.value && !managedProcess.value) {
    return 'Verificando';
  }

  switch (processStatus.value) {
    case 'starting':
      return 'Iniciando';
    case 'running':
      return 'Executando';
    case 'stopping':
      return 'Encerrando';
    case 'failed':
      return 'Falhou';
    default:
      return 'Parado';
  }
});

function isCurrentProject(
  projectId: string,
  generation: number,
): boolean {
  return (
    props.project.id === projectId &&
    projectRequests.isCurrent(generation)
  );
}

async function refreshServerSettings(): Promise<void> {
  if (!supportsServer.value) {
    return;
  }

  const projectId = props.project.id;
  const generation = projectRequests.capture();
  loadingSettings.value = true;

  try {
    const settings = await fetchProjectServerSettings(projectId);

    if (!isCurrentProject(projectId, generation)) {
      return;
    }

    serverSettings.value = settings;
    selectedPort.value =
      settings.port !== undefined ? String(settings.port) : '';
  } catch (error) {
    if (isCurrentProject(projectId, generation)) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar as configurações do servidor.';
    }
  } finally {
    if (isCurrentProject(projectId, generation)) {
      loadingSettings.value = false;
    }
  }
}

async function persistServerSettings(
  projectId: string,
  generation: number,
): Promise<ProjectServerSettings> {
  const port = parseServerPort(selectedPort.value);
  const settings = await saveProjectServerSettings(projectId, {
    port,
  });

  if (!isCurrentProject(projectId, generation)) {
    throw new Error('O projeto ativo mudou durante a operação.');
  }

  serverSettings.value = settings;
  selectedPort.value =
    settings.port !== undefined ? String(settings.port) : '';

  return settings;
}

async function handleSaveSettings(): Promise<void> {
  const projectId = props.project.id;
  const generation = projectRequests.capture();
  savingSettings.value = true;
  settingsMessage.value = '';
  errorMessage.value = '';

  try {
    await persistServerSettings(projectId, generation);

    if (isCurrentProject(projectId, generation)) {
      settingsMessage.value = 'Configuração salva.';
    }
  } catch (error) {
    if (isCurrentProject(projectId, generation)) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar a configuração.';
    }
  } finally {
    if (isCurrentProject(projectId, generation)) {
      savingSettings.value = false;
    }
  }
}

async function refreshProcess(): Promise<void> {
  if (!supportsServer.value) {
    return;
  }

  const requestToken = processRequestGate.begin(
    'process-request',
  );

  if (!requestToken) {
    return;
  }

  const projectId = props.project.id;
  const generation = projectRequests.capture();
  loadingStatus.value = true;

  try {
    const nextProcess = await fetchProjectProcess(projectId);

    if (isCurrentProject(projectId, generation)) {
      managedProcess.value = nextProcess;
    }
  } catch (error) {
    if (isCurrentProject(projectId, generation)) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível consultar o processo.';
    }
  } finally {
    if (processRequestGate.finish(requestToken)) {
      if (isCurrentProject(projectId, generation)) {
        loadingStatus.value = false;
      }
    }
  }
}

async function scrollLogsToBottom(): Promise<void> {
  if (!followLogs.value) {
    return;
  }

  await nextTick();

  const element = logContainer.value;
  if (element) {
    element.scrollTop = element.scrollHeight;
  }
}

async function refreshLogs(): Promise<void> {
  if (!hasManagedProcess.value || clearingLog) {
    return;
  }

  const requestToken = logRequestGate.begin('log-request');

  if (!requestToken) {
    return;
  }

  const projectId = props.project.id;
  const generation = projectRequests.capture();
  const requestLogGeneration = logRequests.capture();
  loadingLogs.value = true;
  logErrorMessage.value = '';

  try {
    const snapshot = await fetchProjectProcessLog(projectId);

    if (
      isCurrentProject(projectId, generation) &&
      logRequests.isCurrent(requestLogGeneration)
    ) {
      logSnapshot.value = snapshot;
      await scrollLogsToBottom();
    }
  } catch (error) {
    if (
      isCurrentProject(projectId, generation) &&
      logRequests.isCurrent(requestLogGeneration)
    ) {
      logErrorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar os logs.';
    }
  } finally {
    if (logRequestGate.finish(requestToken)) {
      if (isCurrentProject(projectId, generation) && !clearingLog) {
        loadingLogs.value = false;
      }
    }
  }
}

function stopLogPolling(): void {
  if (logPollingTimer) {
    clearTimeout(logPollingTimer);
    logPollingTimer = undefined;
  }
}

function scheduleLogPolling(): void {
  stopLogPolling();

  if (!showLogs.value) {
    return;
  }

  const generation = projectRequests.capture();
  logPollingTimer = setTimeout(async () => {
    await refreshLogs();

    if (projectRequests.isCurrent(generation) && showLogs.value) {
      scheduleLogPolling();
    }
  }, 2_000);
}

function stopProcessPolling(): void {
  if (processPollingTimer) {
    clearTimeout(processPollingTimer);
    processPollingTimer = undefined;
  }
}

function scheduleProcessPolling(): void {
  stopProcessPolling();

  if (!supportsServer.value) {
    return;
  }

  const generation = projectRequests.capture();
  const delay =
    processStatus.value === 'starting' ||
    processStatus.value === 'stopping'
      ? 1_000
      : 5_000;

  processPollingTimer = setTimeout(async () => {
    await refreshProcess();

    if (projectRequests.isCurrent(generation) && supportsServer.value) {
      scheduleProcessPolling();
    }
  }, delay);
}

async function toggleLogs(): Promise<void> {
  showLogs.value = !showLogs.value;

  if (showLogs.value) {
    await refreshLogs();
    scheduleLogPolling();
  } else {
    stopLogPolling();
  }
}

function handleLogScroll(): void {
  const element = logContainer.value;
  if (!element) {
    return;
  }

  const distanceFromBottom =
    element.scrollHeight -
    element.scrollTop -
    element.clientHeight;

  followLogs.value = distanceFromBottom < 40;
}

async function clearLogView(): Promise<void> {
  if (!hasManagedProcess.value || clearingLog) {
    return;
  }

  const projectId = props.project.id;
  const generation = projectRequests.capture();
  const clearGeneration = logRequests.invalidate();
  logRequestGate.invalidate();

  clearingLog = true;
  loadingLogs.value = true;
  logErrorMessage.value = '';
  stopLogPolling();

  try {
    const snapshot = await clearProjectProcessLog(projectId);

    if (
      isCurrentProject(projectId, generation) &&
      logRequests.isCurrent(clearGeneration)
    ) {
      logSnapshot.value = snapshot;
      followLogs.value = true;
      await scrollLogsToBottom();
    }
  } catch (error) {
    if (isCurrentProject(projectId, generation)) {
      logErrorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível limpar os logs.';
    }
  } finally {
    if (isCurrentProject(projectId, generation)) {
      clearingLog = false;
      loadingLogs.value = false;

      if (showLogs.value) {
        scheduleLogPolling();
      }
    }
  }
}

async function handleStart(): Promise<void> {
  const projectId = props.project.id;
  const generation = projectRequests.capture();
  executingAction.value = true;
  errorMessage.value = '';
  settingsMessage.value = '';

  try {
    const settings = await persistServerSettings(
      projectId,
      generation,
    );
    const nextProcess = await startProjectProcess(
      projectId,
      { port: settings.port ?? null },
    );

    if (!isCurrentProject(projectId, generation)) {
      return;
    }

    managedProcess.value = nextProcess;
    scheduleProcessPolling();

    if (showLogs.value) {
      await refreshLogs();
      scheduleLogPolling();
    }
  } catch (error) {
    if (isCurrentProject(projectId, generation)) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível iniciar o servidor.';
    }
  } finally {
    if (isCurrentProject(projectId, generation)) {
      executingAction.value = false;
    }
  }
}

async function handleStop(): Promise<void> {
  const projectId = props.project.id;
  const generation = projectRequests.capture();
  executingAction.value = true;
  errorMessage.value = '';

  try {
    const nextProcess = await stopProjectProcess(projectId);

    if (isCurrentProject(projectId, generation)) {
      managedProcess.value = nextProcess;
    }
  } catch (error) {
    if (isCurrentProject(projectId, generation)) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível parar o servidor.';
    }
  } finally {
    if (isCurrentProject(projectId, generation)) {
      executingAction.value = false;
    }
  }
}

function resetPanelState(): void {
  stopProcessPolling();
  stopLogPolling();
  projectRequests.invalidate();
  logRequests.invalidate();
  processRequestGate.invalidate();
  logRequestGate.invalidate();
  clearingLog = false;

  managedProcess.value = null;
  loadingStatus.value = false;
  executingAction.value = false;
  errorMessage.value = '';
  serverSettings.value = null;
  selectedPort.value = '';
  loadingSettings.value = false;
  savingSettings.value = false;
  settingsMessage.value = '';
  showLogs.value = props.defaultLogsOpen;
  loadingLogs.value = false;
  logSnapshot.value = null;
  logErrorMessage.value = '';
  followLogs.value = true;
}

async function initializeProject(): Promise<void> {
  resetPanelState();
  const generation = projectRequests.capture();

  if (!supportsServer.value) {
    return;
  }

  await Promise.all([
    refreshProcess(),
    refreshServerSettings(),
  ]);

  if (!projectRequests.isCurrent(generation)) {
    return;
  }

  scheduleProcessPolling();

  if (showLogs.value && hasManagedProcess.value) {
    await refreshLogs();
    scheduleLogPolling();
  }
}

watch(
  () => props.project.id,
  () => {
    void initializeProject();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  projectRequests.invalidate();
  logRequests.invalidate();
  stopProcessPolling();
  stopLogPolling();
});
</script>

<template>
  <Card padded class="project-detail-card" :class="`project-server-card-${mode}`">
    <template #header>
      <div class="project-panel-heading">
        <span class="section-kicker">Servidor</span>
      </div>
    </template>
    <template #actions>
      <div class="project-server-summary-actions">
        <span
          class="process-status"
          :class="`process-status-${processStatus}`"
          aria-live="polite"
        >
          <span />
          {{ statusLabel }}
        </span>

        <button
          v-if="supportsServer && !canStop"
          type="button"
          class="primary-small-button"
          :disabled="executingAction || loadingSettings"
          @click="handleStart"
        >
          {{ executingAction ? 'Iniciando...' : 'Iniciar' }}
        </button>

        <button
          v-if="supportsServer && canStop"
          type="button"
          class="danger-small-button"
          :disabled="executingAction || processStatus === 'stopping'"
          @click="handleStop"
        >
          {{
            executingAction || processStatus === 'stopping'
              ? 'Parando...'
              : 'Parar'
          }}
        </button>
      </div>
    </template>

    <section
      v-if="detailsMode && supportsServer"
      class="server-settings-panel"
    >
      <div class="server-settings-heading">
        <div>
          <strong>Configuração de execução</strong>
          <span>{{ settingsPortPreview }}</span>
        </div>

        <span v-if="settingsMessage" class="settings-saved">
          {{ settingsMessage }}
        </span>
      </div>

      <div class="server-settings-fields">
        <label>
          <span>Porta</span>
          <input
            v-model="selectedPort"
            type="number"
            min="1024"
            max="65535"
            inputmode="numeric"
            placeholder="Automática"
            :disabled="loadingSettings || canStop"
          />
        </label>

        <button
          type="button"
          class="secondary-button"
          :disabled="savingSettings || loadingSettings || canStop"
          @click="handleSaveSettings"
        >
          {{ savingSettings ? 'Salvando...' : 'Salvar' }}
        </button>
      </div>

      <p class="server-access-note">
        Ao iniciar, o servidor ficará disponível em localhost e
        nos IPs locais desta máquina.
      </p>
    </section>

    <div v-if="managedProcess?.port" class="process-details">
      <span>Porta {{ managedProcess.port }}</span>
      <span v-if="managedProcess.pid">PID {{ managedProcess.pid }}</span>
      <span v-if="managedProcess.exitCode !== undefined">
        Saída {{ managedProcess.exitCode }}
      </span>
      <a
        v-for="url in processUrls"
        :key="url"
        :href="url"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ url }}
      </a>
    </div>

    <div v-if="errorMessage" class="project-error" role="alert">
      {{ errorMessage }}
    </div>

    <div
      v-if="detailsMode && hasManagedProcess"
      class="project-server-actions"
    >
      <button
        type="button"
        class="secondary-button"
        @click="toggleLogs"
      >
        {{ showLogs ? 'Fechar logs' : 'Logs' }}
      </button>
    </div>

    <section v-if="detailsMode && showLogs" class="project-log-panel">
      <header class="project-log-header">
        <div>
          <strong>Logs do servidor</strong>
          <span v-if="logSnapshot">
            {{ formattedLogSize }}
            <template v-if="logSnapshot.truncated">
              · trecho final
            </template>
          </span>
        </div>

        <div class="project-log-actions">
          <button
            type="button"
            class="log-action-button"
            :disabled="loadingLogs"
            @click="refreshLogs"
          >
            Atualizar
          </button>

          <button
            type="button"
            class="log-action-button"
            :disabled="loadingLogs"
            @click="clearLogView"
          >
            Limpar tela
          </button>
        </div>
      </header>

      <div v-if="logErrorMessage" class="project-error" role="alert">
        {{ logErrorMessage }}
      </div>

      <div
        v-if="logSnapshot?.masked"
        class="project-log-redaction-warning"
        role="status"
      >
        {{ logSnapshot.redactionCount }} ocorrência(s) sensível(is) foram
        mascarada(s) nesta visualização.
      </div>

      <pre
        ref="logContainer"
        class="project-log-output"
        @scroll="handleLogScroll"
      ><code>{{ logSnapshot?.content || 'Nenhuma saída registrada.' }}</code></pre>

      <footer class="project-log-footer">
        <span>
          {{
            loadingLogs
              ? 'Atualizando...'
              : followLogs
                ? 'Acompanhando novas linhas'
                : 'Rolagem automática pausada'
          }}
        </span>

        <button
          v-if="!followLogs"
          type="button"
          class="log-action-button"
          @click="
            followLogs = true;
            scrollLogsToBottom();
          "
        >
          Ir para o final
        </button>
      </footer>
    </section>
  </Card>
</template>
