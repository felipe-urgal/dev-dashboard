<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  BoltIcon,
  CommandLineIcon,
  GlobeAltIcon,
  PlayIcon,
  ServerStackIcon,
  StopIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';

import type { Project, ProjectServerSettings } from '@dev-dashboard/contracts';

import {
  fetchProjectServerConfiguration,
  saveProjectServerSettings,
  startProjectProcess,
  stopProjectProcess,
} from '../api';

import { useAutoDismiss } from '../composables/useAutoDismiss';
import { useProjectLogsPolling } from '../composables/useProjectLogsPolling';
import { useProjectProcessStatus } from '../composables/useProjectProcessStatus';
import { useProjectServerMetrics } from '../composables/useProjectServerMetrics';
import { confirmDialog } from '../stores/app-dialog';
import { noticeCenterStore } from '../stores/notice-center';
import { RequestGeneration } from '../utils/request-generation';
import { parseServerPort } from '../utils/server-settings';
import ProjectLogTerminal from './ProjectLogTerminal.vue';

const props = defineProps<{
  project: Project;
}>();

const {
  managedProcess,
  loadingStatus,
  errorMessage,
  supportsServer,
  processStatus,
  canStop,
  scheduleProcessPolling,
} = useProjectProcessStatus(() => props.project);

const { commandLabel, startedAtLabel, uptimeLabel } = useProjectServerMetrics(
  () => props.project,
  managedProcess,
  processStatus,
);

const logContainer = ref<HTMLElement | null>(null);
const {
  logSnapshot,
  clearing: clearingLog,
  clearLogView,
} = useProjectLogsPolling(
  () => props.project,
  canStop,
  supportsServer,
  logContainer,
);

const selectedPort = ref<string | number>('');
const selectedEnvironment = ref('');
const availableEnvironments = ref<string[]>([]);
const loadingSettings = ref(false);
const savingSettings = ref(false);
const settingsMessage = ref('');
const currentAction = ref<'start' | 'stop' | 'restart' | null>(null);
const logOpen = ref(false);

useAutoDismiss(errorMessage, '');
useAutoDismiss(settingsMessage, '');

const projectRequests = new RequestGeneration();
let hasObservedRunning = false;

const executingAction = computed(() => currentAction.value !== null);

const requiresEnvironmentSelection = computed(
  () => props.project.type === 'node' && availableEnvironments.value.length > 0,
);

const environmentSelectionMissing = computed(
  () => requiresEnvironmentSelection.value && !selectedEnvironment.value,
);

const environmentDisplayLabel = computed(() => {
  if (props.project.type === 'rails') return 'development';

  return selectedEnvironment.value
    ? `.env.${selectedEnvironment.value}`
    : 'Padrão (.env / .env.local)';
});

async function confirmEnvironmentReplacement(
  action: 'iniciar' | 'reiniciar',
): Promise<boolean> {
  if (props.project.type !== 'node' || !selectedEnvironment.value) {
    return true;
  }

  return await confirmDialog({
    title: `Usar .env.${selectedEnvironment.value}?`,
    message:
      `Antes de ${action} o servidor, .env.${selectedEnvironment.value} ` +
      'substituirá .env.local. Nenhum valor será exibido no dashboard.',
    confirmLabel: action === 'iniciar' ? 'Usar e iniciar' : 'Usar e reiniciar',
    tone: 'warning',
  });
}

const processUrls = computed<string[]>(() => {
  if (processStatus.value !== 'running') return [];
  if (managedProcess.value?.urls?.length) return managedProcess.value.urls;
  if (managedProcess.value?.url) return [managedProcess.value.url];

  const port = managedProcess.value?.port;
  return port ? [`http://localhost:${port}`] : [];
});

const primaryProcessUrl = computed(() => processUrls.value[0] ?? '');

const ipProcessUrl = computed(() => {
  const additionalUrl = processUrls.value.slice(1).find((url) => {
    try {
      const hostname = new URL(url).hostname;
      return hostname !== 'localhost' && hostname !== '127.0.0.1';
    } catch {
      return false;
    }
  });

  if (additionalUrl) return additionalUrl;

  const host = managedProcess.value?.host;
  const port = managedProcess.value?.port;
  if (
    host &&
    port &&
    host !== 'localhost' &&
    host !== '127.0.0.1' &&
    host !== '0.0.0.0' &&
    host !== '::'
  ) {
    return `http://${host}:${port}`;
  }

  return '';
});

const statusDescription = computed(() => {
  if (!supportsServer.value)
    return 'Este projeto não expõe um servidor gerenciável.';
  if (loadingStatus.value && !managedProcess.value)
    return 'Consultando o processo local.';

  switch (processStatus.value) {
    case 'starting':
      return 'Preparando o processo e os endereços locais.';
    case 'running':
      return 'Servidor rodando normalmente.';
    case 'stopping':
      return 'Encerrando o processo com segurança.';
    case 'failed':
      return 'O último processo terminou com falha.';
    default:
      return 'Servidor pronto para ser iniciado.';
  }
});

function isCurrentProject(projectId: string, generation: number): boolean {
  return (
    props.project.id === projectId && projectRequests.isCurrent(generation)
  );
}

async function refreshServerSettings(): Promise<void> {
  if (!supportsServer.value) return;

  const projectId = props.project.id;
  const generation = projectRequests.capture();
  loadingSettings.value = true;

  try {
    const configuration = await fetchProjectServerConfiguration(projectId);
    const settings = configuration.settings;
    if (!isCurrentProject(projectId, generation)) return;

    selectedPort.value =
      settings.port !== undefined ? String(settings.port) : '';
    availableEnvironments.value = configuration.environments;
    selectedEnvironment.value =
      settings.environment &&
      configuration.environments.includes(settings.environment)
        ? settings.environment
        : configuration.environments.length === 1
          ? (configuration.environments[0] ?? '')
          : '';
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
    healthCheckPath: null,
    environment:
      props.project.type === 'node' && selectedEnvironment.value
        ? selectedEnvironment.value
        : null,
  });

  if (!isCurrentProject(projectId, generation)) {
    throw new Error('O projeto ativo mudou durante a operação.');
  }

  selectedPort.value = settings.port !== undefined ? String(settings.port) : '';
  selectedEnvironment.value = settings.environment ?? '';

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
      settingsMessage.value = 'Configurações salvas.';
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

async function startServer(
  projectId: string,
  generation: number,
): Promise<void> {
  const settings = await persistServerSettings(projectId, generation);
  const nextProcess = await startProjectProcess(projectId, {
    port: settings.port ?? null,
  });

  if (!isCurrentProject(projectId, generation)) return;

  managedProcess.value = nextProcess;
  scheduleProcessPolling();
}

async function handleStart(): Promise<void> {
  if (environmentSelectionMissing.value) {
    errorMessage.value = 'Escolha um ambiente antes de iniciar o servidor.';
    return;
  }

  if (!(await confirmEnvironmentReplacement('iniciar'))) return;

  const projectId = props.project.id;
  const generation = projectRequests.capture();
  currentAction.value = 'start';
  errorMessage.value = '';
  settingsMessage.value = '';

  try {
    await startServer(projectId, generation);
  } catch (error) {
    if (isCurrentProject(projectId, generation)) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível iniciar o servidor.';
    }
  } finally {
    if (isCurrentProject(projectId, generation)) {
      currentAction.value = null;
    }
  }
}

async function handleStop(): Promise<void> {
  const projectId = props.project.id;
  const generation = projectRequests.capture();
  currentAction.value = 'stop';
  errorMessage.value = '';

  try {
    const nextProcess = await stopProjectProcess(projectId);
    if (!isCurrentProject(projectId, generation)) return;

    managedProcess.value = nextProcess;
  } catch (error) {
    if (isCurrentProject(projectId, generation)) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível parar o servidor.';
    }
  } finally {
    if (isCurrentProject(projectId, generation)) {
      currentAction.value = null;
    }
  }
}

async function handleRestart(): Promise<void> {
  if (environmentSelectionMissing.value) {
    errorMessage.value = 'Escolha um ambiente antes de reiniciar o servidor.';
    return;
  }

  if (!(await confirmEnvironmentReplacement('reiniciar'))) return;

  const projectId = props.project.id;
  const generation = projectRequests.capture();
  currentAction.value = 'restart';
  errorMessage.value = '';
  settingsMessage.value = '';

  try {
    if (canStop.value) {
      const stoppedProcess = await stopProjectProcess(projectId);
      if (!isCurrentProject(projectId, generation)) return;
      managedProcess.value = stoppedProcess;
    }

    await startServer(projectId, generation);
  } catch (error) {
    if (isCurrentProject(projectId, generation)) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível reiniciar o servidor.';
    }
  } finally {
    if (isCurrentProject(projectId, generation)) {
      currentAction.value = null;
    }
  }
}

function resetPanelState(): void {
  projectRequests.invalidate();

  selectedPort.value = '';
  selectedEnvironment.value = '';
  availableEnvironments.value = [];
  loadingSettings.value = false;
  savingSettings.value = false;
  settingsMessage.value = '';
  currentAction.value = null;
  logOpen.value = false;
}

async function initializeProject(): Promise<void> {
  resetPanelState();

  if (!supportsServer.value) return;

  await refreshServerSettings();
}

watch(
  () => props.project.id,
  () => {
    void initializeProject();
  },
  { immediate: true },
);

watch(processStatus, (status) => {
  if (status === 'starting' || status === 'running' || status === 'stopping') {
    hasObservedRunning = true;
  }

  if (hasObservedRunning && (status === 'stopped' || status === 'failed')) {
    const process = managedProcess.value;

    noticeCenterStore.publishTerminalNotice({
      origin: 'server',
      dedupeKey: `server:${process?.id ?? props.project.id}:${status}`,
      outcome: status,
      projectId: props.project.id,
      projectName: props.project.name,
      label: props.project.name,
      routeTo: {
        name: 'project-server',
        params: { projectId: props.project.id },
      },
    });
  }
});

onBeforeUnmount(() => {
  projectRequests.invalidate();
});
</script>

<template src="./ProjectServerPanel.template.html"></template>

<style scoped src="./ProjectServerPanel.css"></style>
