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
  ProjectCapability,
  ProjectType,
} from '@dev-dashboard/contracts';

import {
  fetchProjectProcess,
  fetchProjectProcessLog,
  startProjectProcess,
  stopProjectProcess,
} from '../api';

const props = defineProps<{
  project: Project;
}>();

const managedProcess = ref<ManagedProcess | null>(null);
const loadingStatus = ref(false);
const executingAction = ref(false);
const errorMessage = ref('');

const showLogs = ref(false);
const loadingLogs = ref(false);
const logSnapshot = ref<ProcessLogSnapshot | null>(null);
const logErrorMessage = ref('');
const logContainer = ref<HTMLElement | null>(null);
const followLogs = ref(true);

let logPollingTimer: ReturnType<typeof setInterval> | undefined;

let pollingTimer: ReturnType<typeof setInterval> | undefined;

const projectTypeLabels: Record<ProjectType, string> = {
  rails: 'Rails',
  node: 'Node',
  unknown: 'Desconhecido',
};

const capabilityLabels: Record<ProjectCapability, string> = {
  server: 'Servidor',
  git: 'Git',
  tests: 'Testes',
  database: 'Banco',
  scripts: 'Scripts',
  webpack: 'Webpack',
  sidekiq: 'Sidekiq',
  rake: 'Rake',
  bundler: 'Bundler',
};

const hasManagedProcess = computed(
  () => managedProcess.value !== null,
);

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
    element.scrollHeight - element.scrollTop - element.clientHeight;

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

const supportsServer = computed(() =>
  props.project.capabilities.includes('server'),
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

const processUrl = computed<string | null>(() => {
  const port = managedProcess.value?.port;

  if (!port) {
    return null;
  }

  return `http://127.0.0.1:${port}`;
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

function projectInitials(name: string): string {
  return name
    .replace(/^[._-]+/, '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function capabilityLabel(capability: ProjectCapability): string {
  return capabilityLabels[capability];
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

async function handleStart(): Promise<void> {
  executingAction.value = true;
  errorMessage.value = '';

  try {
    managedProcess.value = await startProjectProcess(
      props.project.id,
    );

    if (showLogs.value) {
      await refreshLogs();
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
    managedProcess.value = await stopProjectProcess(props.project.id);
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

onMounted(() => {
  void refreshProcess();

  if (supportsServer.value) {
    pollingTimer = setInterval(() => {
      void refreshProcess();
    }, 5_000);
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
  <article class="project-card">
    <div class="project-card-header">
      <div class="project-avatar">
        {{ projectInitials(project.name) }}
      </div>

      <div class="project-identity">
        <h3>{{ project.name }}</h3>

        <div class="project-meta">
          <span
            class="type-badge"
            :class="`type-badge-${project.type}`"
          >
            {{ projectTypeLabels[project.type] }}
          </span>

          <span>{{ project.source }}</span>
        </div>
      </div>

      <span
        class="process-status"
        :class="`process-status-${processStatus}`"
      >
        <span />
        {{ statusLabel }}
      </span>
    </div>

    <code class="project-path">
      {{ project.path }}
    </code>

    <div class="capabilities">
      <span
        v-for="capability in project.capabilities"
        :key="capability"
        class="capability"
      >
        {{ capabilityLabel(capability) }}
      </span>
    </div>

    <div v-if="managedProcess?.port" class="process-details">
      <span>Porta {{ managedProcess.port }}</span>

      <span v-if="managedProcess.pid">
        PID {{ managedProcess.pid }}
      </span>
    </div>

    <div v-if="errorMessage" class="project-error" role="alert">
      {{ errorMessage }}
    </div>

    <div class="project-card-footer">
      <span class="detected-status">
        <span />
        Detectado
      </span>

      <div class="project-actions">
        <button
          v-if="hasManagedProcess"
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
          :disabled="executingAction"
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
    </div>

    <section v-if="showLogs" class="project-log-panel">
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
      ><code>{{ logSnapshot?.content || "Nenhuma saída registrada." }}</code></pre>

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
  </article>
</template>
