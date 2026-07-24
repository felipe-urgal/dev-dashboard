<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
} from 'vue';

import type {
  ManagedProcess,
  ProcessLogSnapshot,
  Project,
  ProjectServerSettings,
} from '@dev-dashboard/contracts';

import {
  fetchProjectProcess,
  fetchProjectProcessLog,
  fetchProjectServerSettings,
  saveProjectServerSettings,
  startProjectProcess,
  stopProjectProcess,
} from '../api';

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

let logPollingTimer: ReturnType<typeof setInterval> | undefined;
let pollingTimer: ReturnType<typeof setInterval> | undefined;

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
  if (managedProcess.value?.urls?.length) {
    return managedProcess.value.urls;
  }

  if (managedProcess.value?.url) {
    return [managedProcess.value.url];
  }

  const port = managedProcess.value?.port;

  return port ? [`http://localhost:${port}`] : [];
});

const processUrl = computed<string | null>(
  () => processUrls.value[0] ?? null,
);

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

  if (loadingStatus.value) {
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

function parseSelectedPort(): number | null {
  const rawPort = String(selectedPort.value ?? '').trim();

  if (!rawPort) {
    return null;
  }

  const port = Number(rawPort);

  if (!Number.isInteger(port) || port < 1_024 || port > 65_535) {
    throw new Error('A porta deve estar entre 1024 e 65535.');
  }

  return port;
}

async function refreshServerSettings(): Promise<void> {
  if (!supportsServer.value) {
    return;
  }

  loadingSettings.value = true;

  try {
    const settings = await fetchProjectServerSettings(
      props.project.id,
    );
    serverSettings.value = settings;
    selectedPort.value =
      settings.port !== undefined ? String(settings.port) : '';
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível carregar as configurações do servidor.';
  } finally {
    loadingSettings.value = false;
  }
}

async function persistServerSettings(): Promise<ProjectServerSettings> {
  const port = parseSelectedPort();
  const settings = await saveProjectServerSettings(
    props.project.id,
    { port },
  );

  serverSettings.value = settings;
  selectedPort.value =
    settings.port !== undefined ? String(settings.port) : '';

  return settings;
}

async function handleSaveSettings(): Promise<void> {
  savingSettings.value = true;
  settingsMessage.value = '';
  errorMessage.value = '';

  try {
    await persistServerSettings();
    settingsMessage.value = 'Configuração salva.';
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível salvar a configuração.';
  } finally {
    savingSettings.value = false;
  }
}

async function refreshProcess(): Promise<void> {
  if (!supportsServer.value) {
    return;
  }

  loadingStatus.value = true;

  try {
    managedProcess.value = await fetchProjectProcess(
      props.project.id,
    );
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível consultar o processo.';
  } finally {
    loadingStatus.value = false;
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
  if (!hasManagedProcess.value) {
    return;
  }

  loadingLogs.value = true;
  logErrorMessage.value = '';

  try {
    logSnapshot.value = await fetchProjectProcessLog(
      props.project.id,
    );
    await scrollLogsToBottom();
  } catch (error) {
    logErrorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível carregar os logs.';
  } finally {
    loadingLogs.value = false;
  }
}

function stopLogPolling(): void {
  if (logPollingTimer) {
    clearInterval(logPollingTimer);
    logPollingTimer = undefined;
  }
}

function startLogPolling(): void {
  stopLogPolling();
  logPollingTimer = setInterval(() => {
    void refreshLogs();
  }, 2_000);
}

async function toggleLogs(): Promise<void> {
  showLogs.value = !showLogs.value;

  if (showLogs.value) {
    await refreshLogs();
    startLogPolling();
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

function clearLogView(): void {
  if (!logSnapshot.value) {
    return;
  }

  logSnapshot.value = {
    ...logSnapshot.value,
    content: '',
  };
}

async function handleStart(): Promise<void> {
  executingAction.value = true;
  errorMessage.value = '';
  settingsMessage.value = '';

  try {
    const settings = await persistServerSettings();
    managedProcess.value = await startProjectProcess(
      props.project.id,
      { port: settings.port ?? null },
    );

    if (showLogs.value) {
      await refreshLogs();
      startLogPolling();
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível iniciar o servidor.';
  } finally {
    executingAction.value = false;
  }
}

async function handleStop(): Promise<void> {
  executingAction.value = true;
  errorMessage.value = '';

  try {
    managedProcess.value = await stopProjectProcess(
      props.project.id,
    );
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível parar o servidor.';
  } finally {
    executingAction.value = false;
  }
}

function handleOpen(): void {
  if (!processUrl.value) {
    return;
  }

  window.open(processUrl.value, '_blank', 'noopener,noreferrer');
}

onMounted(async () => {
  await Promise.all([
    refreshProcess(),
    refreshServerSettings(),
  ]);

  if (supportsServer.value) {
    pollingTimer = setInterval(() => {
      void refreshProcess();
    }, 5_000);
  }

  if (showLogs.value && hasManagedProcess.value) {
    await refreshLogs();
    startLogPolling();
  }
});

onBeforeUnmount(() => {
  if (pollingTimer) {
    clearInterval(pollingTimer);
  }

  stopLogPolling();
});
</script>

<template>
  <section
    class="project-server-panel"
    :class="`project-server-panel-${mode}`"
  >
    <header class="project-server-summary">
      <div>
        <span class="section-kicker">Servidor</span>
        <strong>{{ statusLabel }}</strong>
      </div>

      <span
        class="process-status"
        :class="`process-status-${processStatus}`"
      >
        <span />
        {{ statusLabel }}
      </span>
    </header>

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

    <div class="project-server-actions">
      <button
        v-if="detailsMode && hasManagedProcess"
        type="button"
        class="secondary-button"
        @click="toggleLogs"
      >
        {{ showLogs ? 'Fechar logs' : 'Logs' }}
      </button>

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
        :disabled="executingAction"
        @click="handleStop"
      >
        {{ executingAction ? 'Parando...' : 'Parar' }}
      </button>

      <button
        v-if="processUrl"
        type="button"
        class="secondary-button"
        :disabled="processStatus !== 'running'"
        @click="handleOpen"
      >
        Abrir
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
            @click="clearLogView"
          >
            Limpar tela
          </button>
        </div>
      </header>

      <div v-if="logErrorMessage" class="project-error" role="alert">
        {{ logErrorMessage }}
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
  </section>
</template>
