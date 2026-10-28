<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { PlayIcon, ServerStackIcon } from '@heroicons/vue/24/outline';

import type { Project, ProjectServerSettings } from '@dev-dashboard/contracts';

import {
  fetchProjectServerConfiguration,
  saveProjectServerSettings,
} from '../api';

import { useAutoDismiss } from '../composables/useAutoDismiss';
import { useProjectLogsPolling } from '../composables/useProjectLogsPolling';
import { useProjectProcessStatus } from '../composables/useProjectProcessStatus';
import {
  useProjectServerControls,
  type ServerStartPreparation,
} from '../composables/useProjectServerControls';
import { useProjectServerMetrics } from '../composables/useProjectServerMetrics';
import { confirmDialog } from '../stores/app-dialog';
import { noticeCenterStore } from '../stores/notice-center';
import { RequestGeneration } from '../utils/request-generation';
import { parseServerLog, serverLogFilters } from '../utils/server-log-lines';
import { parseServerPort } from '../utils/server-settings';
import ProcessConsole from './process/ProcessConsole.vue';
import ProcessStatusBar from './process/ProcessStatusBar.vue';
import ServerSettingsDrawer from './server/ServerSettingsDrawer.vue';
import UiButton from './ui/UiButton.vue';

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

const { commandLabel, uptimeLabel } = useProjectServerMetrics(
  () => props.project,
  managedProcess,
  processStatus,
);

const {
  logSnapshot,
  clearing: clearingLog,
  clearLogView,
} = useProjectLogsPolling(
  () => props.project,
  hasManagedProcess,
  supportsServer,
  ref(null),
  () => props.environmentInstanceId,
);

const selectedPort = ref<string | number>('');
const selectedEnvironment = ref('');
const availableEnvironments = ref<string[]>([]);
const loadingSettings = ref(false);
const savingSettings = ref(false);
const settingsMessage = ref('');
const showSettings = ref(false);

useAutoDismiss(errorMessage, '');
useAutoDismiss(settingsMessage, '');

const projectRequests = new RequestGeneration();
let hasObservedRunning = false;

const executingAction = computed(() => controls.action.value !== null);

const environmentLabel = computed(() => {
  if (props.project.type === 'rails') return 'development';
  return selectedEnvironment.value
    ? `.env.${selectedEnvironment.value}`
    : '.env / .env.local';
});

const portLabel = computed(() => {
  const port = managedProcess.value?.port ?? selectedPort.value;
  return port ? `:${port}` : 'porta automática';
});

const statusNote = computed(() => {
  const process = managedProcess.value;
  if (processStatus.value === 'running') {
    return [
      uptimeLabel.value !== '—' ? `há ${uptimeLabel.value}` : '',
      process?.pid ? `PID ${process.pid}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }
  if (processStatus.value === 'failed' && process?.exitCode !== undefined) {
    return `código de saída ${process.exitCode}`;
  }
  return '';
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

// Endereços da rede local antes dos de bridges do Docker (172.x).
function urlRank(url: string): number {
  const host = new URL(url).hostname;
  if (host === 'localhost') return 0;
  return /^(192\.168|10)\./.test(host) ? 1 : 2;
}

const shortCommand = computed(() =>
  commandLabel.value.replace(`${props.project.path}/`, ''),
);

const processUrls = computed<string[]>(() => {
  if (processStatus.value !== 'running') return [];
  if (managedProcess.value?.urls?.length) {
    return [...managedProcess.value.urls].sort(
      (a, b) => urlRank(a) - urlRank(b),
    );
  }
  if (managedProcess.value?.url) return [managedProcess.value.url];

  const port = managedProcess.value?.port;
  return port ? [`http://localhost:${port}`] : [];
});

const portInUse = computed(() =>
  /EADDRINUSE|already in use/i.test(logSnapshot.value?.content ?? ''),
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

const controls = useProjectServerControls({
  getProject: () => props.project,
  getEnvironmentInstanceId: () => props.environmentInstanceId,
  managedProcess,
  errorMessage,
  scheduleProcessPolling,
});

async function prepareStart(): Promise<ServerStartPreparation> {
  const settings = await persistServerSettings(
    props.project.id,
    projectRequests.capture(),
  );
  return { port: settings.port ?? null };
}

async function handleStart(): Promise<void> {
  if (!['stopped', 'failed'].includes(processStatus.value)) return;
  if (!(await confirmEnvironmentReplacement('iniciar'))) return;

  settingsMessage.value = '';
  await controls.start(prepareStart);
}

async function handleStop(): Promise<void> {
  if (processStatus.value !== 'running') return;
  await controls.stop();
}

async function handleRestart(): Promise<void> {
  if (processStatus.value !== 'running') return;
  if (!(await confirmEnvironmentReplacement('reiniciar'))) return;

  settingsMessage.value = '';
  await controls.restart(canStop.value, prepareStart);
}

function resetPanelState(): void {
  projectRequests.invalidate();

  selectedPort.value = '';
  selectedEnvironment.value = '';
  availableEnvironments.value = [];
  loadingSettings.value = false;
  savingSettings.value = false;
  settingsMessage.value = '';
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

<template>
  <div class="server-dashboard">
    <div v-if="!supportsServer" class="server-empty-state">
      <ServerStackIcon aria-hidden="true" />
      <div>
        <strong>Servidor não disponível</strong>
        <p>Este projeto não possui a capacidade de servidor detectada.</p>
      </div>
    </div>

    <template v-else>
      <ProcessStatusBar
        :status="processStatus"
        :status-label="statusLabel"
        :status-note="statusNote"
        :chips="[portLabel, environmentLabel, shortCommand]"
        start-label="Iniciar servidor"
        configurable
        :urls="processUrls"
        :action="controls.action.value"
        :start-disabled="loadingSettings"
        :settings-disabled="savingSettings || executingAction"
        @start="handleStart"
        @stop="handleStop"
        @restart="handleRestart"
        @configure="showSettings = true"
      />

      <p
        v-if="settingsMessage"
        class="server-feedback server-feedback-success"
        role="status"
      >
        {{ settingsMessage }}
      </p>
      <div
        v-if="errorMessage && !showSettings"
        class="server-feedback server-feedback-error"
        role="alert"
      >
        {{ errorMessage }}
      </div>
      <div
        v-else-if="processStatus === 'failed' && !showSettings"
        class="server-feedback server-feedback-error"
        role="alert"
      >
        <span
          >O servidor encerrou com falha. Veja o console e tente
          novamente.</span
        >
        <UiButton v-if="portInUse" size="sm" @click="showSettings = true">
          Trocar porta
        </UiButton>
      </div>

      <ProcessConsole
        :content="logSnapshot?.content ?? ''"
        :parse="parseServerLog"
        :filters="serverLogFilters"
        :running="processStatus === 'running'"
        :masked-count="logSnapshot?.redactionCount ?? 0"
        :clearable="hasManagedProcess"
        :clearing="clearingLog"
        @clear="clearLogView"
      >
        <template #empty>
          <p
            v-if="processStatus === 'running' || processStatus === 'starting'"
            class="server-console-waiting"
          >
            $ aguardando saída do servidor…
          </p>
          <div v-else class="server-console-stopped">
            <ServerStackIcon aria-hidden="true" />
            <strong>Servidor parado</strong>
            <p>
              Será executado em {{ portLabel }} no ambiente
              {{ environmentLabel }}.
            </p>
            <code>$ {{ commandLabel }}</code>
            <UiButton
              variant="primary"
              :disabled="loadingSettings"
              @click="handleStart"
            >
              <PlayIcon aria-hidden="true" />
              Iniciar servidor
            </UiButton>
          </div>
        </template>
      </ProcessConsole>

      <ServerSettingsDrawer
        v-if="showSettings"
        v-model:port="selectedPort"
        v-model:environment="selectedEnvironment"
        :selectable-environment="project.type === 'node'"
        :available-environments="availableEnvironments"
        :environment-label="environmentLabel"
        :command-label="commandLabel"
        :loading="loadingSettings"
        :saving="savingSettings"
        :busy="executingAction"
        :error-message="errorMessage"
        @save="handleSaveSettings"
        @close="showSettings = false"
      />
    </template>
  </div>
</template>

<style scoped>
.server-dashboard {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 14px;
}

.server-empty-state {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 14px;
  color: var(--text-muted);
  background: var(--surface-1);
}

.server-empty-state svg {
  width: 28px;
  height: 28px;
}

.server-empty-state p {
  margin: 2px 0 0;
}

.server-feedback {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
}

.server-feedback-success {
  color: var(--success-text);
  background: var(--success-surface);
}

.server-feedback-error {
  justify-content: space-between;
  border: 1px solid color-mix(in srgb, var(--danger-text) 35%, transparent);
  color: var(--danger-text);
  background: color-mix(in srgb, var(--danger-text) 12%, transparent);
}

.server-console-waiting {
  margin: 0;
  padding: 0 16px;
  color: var(--text-dim);
}

.server-console-stopped {
  display: flex;
  max-width: 480px;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin: auto;
  padding: 40px 16px;
  font-family: var(--font-family);
  text-align: center;
}

.server-console-stopped svg {
  width: 40px;
  height: 40px;
  color: var(--text-dim);
}

.server-console-stopped strong {
  font-size: 16px;
}

.server-console-stopped p {
  margin: 0;
  color: var(--text-dim);
}

.server-console-stopped code {
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-muted);
  background: var(--surface-1);
  font-family: var(--font-family-mono);
  font-size: 13px;
}
</style>
