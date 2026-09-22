<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ClipboardDocumentIcon,
  Cog6ToothIcon,
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
  environmentInstanceId?: string | undefined;
}>();

const {
  managedProcess,
  errorMessage,
  supportsServer,
  processStatus,
  canStop,
  hasManagedProcess,
  statusLabel,
  scheduleProcessPolling,
} = useProjectProcessStatus(
  () => props.project,
  () => props.environmentInstanceId,
);

const { commandLabel } = useProjectServerMetrics(
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
  hasManagedProcess,
  supportsServer,
  logContainer,
  () => props.environmentInstanceId,
);

const selectedPort = ref<string | number>('');
const selectedEnvironment = ref('');
const availableEnvironments = ref<string[]>([]);
const loadingSettings = ref(false);
const savingSettings = ref(false);
const settingsMessage = ref('');
const currentAction = ref<'start' | 'stop' | 'restart' | null>(null);
const localUrlCopied = ref(false);
const showSettings = ref(false);

useAutoDismiss(errorMessage, '');
useAutoDismiss(settingsMessage, '');
useAutoDismiss(localUrlCopied, false);

const projectRequests = new RequestGeneration();
let hasObservedRunning = false;

const executingAction = computed(() => currentAction.value !== null);

const environmentDisplayLabel = computed(() => {
  if (props.project.type === 'rails') return 'development';

  return selectedEnvironment.value
    ? `.env.${selectedEnvironment.value}`
    : 'Padrão (.env / .env.local)';
});

const environmentSummaryLabel = computed(() => {
  if (props.project.type === 'rails') return 'development';
  return selectedEnvironment.value
    ? `.env.${selectedEnvironment.value}`
    : '.env / .env.local';
});

const portDisplayLabel = computed(() => {
  const port = managedProcess.value?.port ?? selectedPort.value;
  return port ? String(port) : 'Automática';
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
      `Ao ${action} o servidor, as variáveis de .env.${selectedEnvironment.value} ` +
      'serão aplicadas somente a esta execução. .env e .env.local não serão alterados.',
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

const localAccessUrl = computed(() => {
  if (primaryProcessUrl.value) return primaryProcessUrl.value;

  const configuredPort = selectedPort.value;
  return configuredPort ? `http://localhost:${configuredPort}` : '';
});

const localAccessLabel = computed(
  () => localAccessUrl.value || 'Disponível após iniciar',
);

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
      showSettings.value = false;
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
    ...(props.environmentInstanceId
      ? { environmentInstanceId: props.environmentInstanceId }
      : {}),
  });

  if (!isCurrentProject(projectId, generation)) return;

  managedProcess.value = nextProcess;
  scheduleProcessPolling();
}

async function handleStart(): Promise<void> {
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
    const nextProcess = props.environmentInstanceId
      ? await stopProjectProcess(projectId, props.environmentInstanceId)
      : await stopProjectProcess(projectId);
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
  if (!(await confirmEnvironmentReplacement('reiniciar'))) return;

  const projectId = props.project.id;
  const generation = projectRequests.capture();
  currentAction.value = 'restart';
  errorMessage.value = '';
  settingsMessage.value = '';

  try {
    if (canStop.value) {
      const stoppedProcess = props.environmentInstanceId
        ? await stopProjectProcess(projectId, props.environmentInstanceId)
        : await stopProjectProcess(projectId);
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

async function copyLocalUrl(): Promise<void> {
  if (!localAccessUrl.value || !navigator.clipboard) return;

  try {
    await navigator.clipboard.writeText(localAccessUrl.value);
    localUrlCopied.value = true;
  } catch {
    localUrlCopied.value = false;
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
  localUrlCopied.value = false;
  showSettings.value = false;
  hasObservedRunning = false;
}

async function initializeProject(): Promise<void> {
  resetPanelState();

  if (!supportsServer.value) return;

  await refreshServerSettings();
}

watch(
  () => `${props.project.id}:${props.environmentInstanceId ?? ''}`,
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
        ...(props.environmentInstanceId
          ? {
              query: {
                environmentInstanceId: props.environmentInstanceId,
              },
            }
          : {}),
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
