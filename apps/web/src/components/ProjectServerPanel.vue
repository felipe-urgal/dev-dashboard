<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  BoltIcon,
  ClipboardDocumentIcon,
  CommandLineIcon,
  GlobeAltIcon,
  PlayIcon,
  ServerStackIcon,
  StopIcon,
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
  hasManagedProcess,
  statusLabel,
  scheduleProcessPolling,
} = useProjectProcessStatus(() => props.project);

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
);

const selectedPort = ref<string | number>('');
const selectedEnvironment = ref('');
const availableEnvironments = ref<string[]>([]);
const loadingSettings = ref(false);
const savingSettings = ref(false);
const settingsMessage = ref('');
const currentAction = ref<'start' | 'stop' | 'restart' | null>(null);
const localUrlCopied = ref(false);

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

const portDescription = computed(() =>
  portDisplayLabel.value === 'Automática'
    ? 'A aplicação será executada na porta disponível.'
    : 'Porta definida para esta aplicação.',
);

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

const consoleTitle = computed(() => {
  switch (processStatus.value) {
    case 'starting':
      return 'Iniciando servidor';
    case 'running':
      return 'Servidor em execução';
    case 'stopping':
      return 'Encerrando servidor';
    case 'failed':
      return 'Pronto para tentar novamente';
    default:
      return 'Pronto para iniciar';
  }
});

const consoleDescription = computed(() => {
  if (processStatus.value === 'running') {
    return 'A aplicação está rodando. Acompanhe a saída do servidor em tempo real no terminal.';
  }

  if (processStatus.value === 'starting') {
    return 'O processo está sendo iniciado. Os logs serão atualizados conforme a execução avançar.';
  }

  if (processStatus.value === 'stopping') {
    return 'Aguarde enquanto o processo é encerrado com segurança.';
  }

  if (processStatus.value === 'failed') {
    return 'Revise os logs abaixo e inicie novamente quando estiver pronto.';
  }

  return 'Clique no botão abaixo para iniciar o servidor e ver os logs em tempo real no terminal.';
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

async function copyLocalUrl(): Promise<void> {
  if (!localAccessUrl.value || !navigator.clipboard) return;

  try {
    await navigator.clipboard.writeText(localAccessUrl.value);
    localUrlCopied.value = true;
  } catch {
    localUrlCopied.value = false;
  }
}

function focusLogs(): void {
  logContainer.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
