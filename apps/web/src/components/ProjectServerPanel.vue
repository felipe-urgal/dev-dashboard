<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue';

import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  BoltIcon,
  CommandLineIcon,
  GlobeAltIcon,
  HeartIcon,
  PlayIcon,
  ServerStackIcon,
  StopIcon,
} from '@heroicons/vue/24/outline';

import { RouterLink } from 'vue-router';

import type {
  Activity,
  ProcessLogSnapshot,
  Project,
  ProjectServerSettings,
} from '@dev-dashboard/contracts';

import {
  fetchActivities,
  fetchProjectProcessLog,
  fetchProjectServerSettings,
  saveProjectServerSettings,
  startProjectProcess,
  stopProjectProcess,
} from '../api';

import { useAutoDismiss } from '../composables/useAutoDismiss';
import { useProjectProcessStatus } from '../composables/useProjectProcessStatus';
import { noticeCenterStore } from '../stores/notice-center';
import {
  RequestGate,
  RequestGeneration,
} from '../utils/request-generation';
import { parseServerPort } from '../utils/server-settings';

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

const selectedPort = ref<string | number>('');
const loadingSettings = ref(false);
const savingSettings = ref(false);
const settingsMessage = ref('');
const currentAction = ref<'start' | 'stop' | 'restart' | null>(null);

const logSnapshot = ref<ProcessLogSnapshot | null>(null);
const loadingLogs = ref(false);
const logErrorMessage = ref('');
const activities = ref<Activity[]>([]);
const loadingActivities = ref(false);
const activityErrorMessage = ref('');
const now = ref(Date.now());

useAutoDismiss(errorMessage, '');
useAutoDismiss(settingsMessage, '');
useAutoDismiss(logErrorMessage, '');
useAutoDismiss(activityErrorMessage, '');

const projectRequests = new RequestGeneration();
const logRequests = new RequestGeneration();
const logRequestGate = new RequestGate();
const activityRequestGate = new RequestGate();
let logPollingTimer: ReturnType<typeof setTimeout> | undefined;
let clockTimer: ReturnType<typeof setInterval> | undefined;
let hasObservedRunning = false;

const executingAction = computed(() => currentAction.value !== null);

const processUrls = computed<string[]>(() => {
  if (processStatus.value !== 'running') return [];
  if (managedProcess.value?.urls?.length) return managedProcess.value.urls;
  if (managedProcess.value?.url) return [managedProcess.value.url];

  const port = managedProcess.value?.port;
  return port ? [`http://localhost:${port}`] : [];
});

const primaryProcessUrl = computed(() => processUrls.value[0] ?? '');

const environmentLabel = computed(() => {
  if (props.project.type === 'rails' || props.project.type === 'node') {
    return 'development';
  }

  return 'local';
});

const commandLabel = computed(() => {
  const process = managedProcess.value;
  if (process?.command) {
    return [process.command, ...(process.args ?? [])].join(' ');
  }

  if (props.project.type === 'rails') return 'bin/dev';
  if (props.project.type === 'node') return 'npm run dev';
  return 'Detectado ao iniciar';
});

const statusDescription = computed(() => {
  if (!supportsServer.value) return 'Este projeto não expõe um servidor gerenciável.';
  if (loadingStatus.value && !managedProcess.value) return 'Consultando o processo local.';

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

const uptimeLabel = computed(() => {
  const startedAt = managedProcess.value?.startedAt;
  if (!startedAt || processStatus.value !== 'running') return '—';

  const started = new Date(startedAt).getTime();
  if (!Number.isFinite(started)) return '—';

  return formatDuration(Math.max(0, now.value - started));
});

const startedAtLabel = computed(() => {
  const startedAt = managedProcess.value?.startedAt;
  if (!startedAt) return '—';

  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
});

const formattedLogSize = computed(() => {
  const size = logSnapshot.value?.sizeBytes ?? 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
});

const logPreviewContent = computed(() => {
  const content = logSnapshot.value?.content.trim();
  if (!content) return 'Nenhuma saída registrada.';

  return content.split('\n').slice(-10).join('\n');
});

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatActivityTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function activityStatusLabel(activity: Activity): string {
  switch (activity.status) {
    case 'running':
      return 'Em andamento';
    case 'succeeded':
      return 'Concluído';
    case 'failed':
      return 'Falhou';
    case 'cancelled':
      return 'Cancelado';
    default:
      return 'Sem status';
  }
}

function isCurrentProject(projectId: string, generation: number): boolean {
  return (
    props.project.id === projectId &&
    projectRequests.isCurrent(generation)
  );
}

async function refreshServerSettings(): Promise<void> {
  if (!supportsServer.value) return;

  const projectId = props.project.id;
  const generation = projectRequests.capture();
  loadingSettings.value = true;

  try {
    const settings = await fetchProjectServerSettings(projectId);
    if (!isCurrentProject(projectId, generation)) return;

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
  const settings = await saveProjectServerSettings(projectId, { port });

  if (!isCurrentProject(projectId, generation)) {
    throw new Error('O projeto ativo mudou durante a operação.');
  }

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

async function refreshLogs(): Promise<void> {
  if (!hasManagedProcess.value) return;

  const requestToken = logRequestGate.begin('server-log-preview');
  if (!requestToken) return;

  const projectId = props.project.id;
  const generation = projectRequests.capture();
  const logGeneration = logRequests.capture();
  loadingLogs.value = true;
  logErrorMessage.value = '';

  try {
    const snapshot = await fetchProjectProcessLog(projectId, 24_576);
    if (
      isCurrentProject(projectId, generation) &&
      logRequests.isCurrent(logGeneration)
    ) {
      logSnapshot.value = snapshot;
    }
  } catch (error) {
    if (
      isCurrentProject(projectId, generation) &&
      logRequests.isCurrent(logGeneration)
    ) {
      logErrorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar os logs.';
    }
  } finally {
    if (
      logRequestGate.finish(requestToken) &&
      isCurrentProject(projectId, generation)
    ) {
      loadingLogs.value = false;
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
  if (!hasManagedProcess.value) return;

  const generation = projectRequests.capture();
  logPollingTimer = setTimeout(async () => {
    await refreshLogs();

    if (
      projectRequests.isCurrent(generation) &&
      hasManagedProcess.value
    ) {
      scheduleLogPolling();
    }
  }, 2_500);
}

async function refreshActivities(): Promise<void> {
  const requestToken = activityRequestGate.begin('server-activity');
  if (!requestToken) return;

  const projectId = props.project.id;
  const generation = projectRequests.capture();
  loadingActivities.value = true;
  activityErrorMessage.value = '';

  try {
    const result = await fetchActivities({
      projectId,
      origin: 'server',
      page: 1,
      pageSize: 4,
    });

    if (isCurrentProject(projectId, generation)) {
      activities.value = result.items;
    }
  } catch (error) {
    if (isCurrentProject(projectId, generation)) {
      activityErrorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar a atividade recente.';
    }
  } finally {
    if (
      activityRequestGate.finish(requestToken) &&
      isCurrentProject(projectId, generation)
    ) {
      loadingActivities.value = false;
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
  await Promise.all([refreshLogs(), refreshActivities()]);
  scheduleLogPolling();
}

async function handleStart(): Promise<void> {
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
    await Promise.all([refreshLogs(), refreshActivities()]);
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
  stopLogPolling();
  projectRequests.invalidate();
  logRequests.invalidate();
  logRequestGate.invalidate();
  activityRequestGate.invalidate();

  selectedPort.value = '';
  loadingSettings.value = false;
  savingSettings.value = false;
  settingsMessage.value = '';
  currentAction.value = null;
  logSnapshot.value = null;
  loadingLogs.value = false;
  logErrorMessage.value = '';
  activities.value = [];
  loadingActivities.value = false;
  activityErrorMessage.value = '';
}

async function initializeProject(): Promise<void> {
  resetPanelState();
  const generation = projectRequests.capture();

  await refreshActivities();
  if (!supportsServer.value) return;

  await refreshServerSettings();
  if (!projectRequests.isCurrent(generation)) return;

  if (hasManagedProcess.value) {
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

watch(processStatus, (status) => {
  if (status === 'starting' || status === 'running' || status === 'stopping') {
    hasObservedRunning = true;
  }

  if (status === 'running' && hasManagedProcess.value) {
    void refreshLogs();
    void refreshActivities();
    scheduleLogPolling();
  }

  if (
    hasObservedRunning &&
    (status === 'stopped' || status === 'failed')
  ) {
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

    void refreshActivities();
  }
});

clockTimer = setInterval(() => {
  now.value = Date.now();
}, 1_000);

onBeforeUnmount(() => {
  projectRequests.invalidate();
  logRequests.invalidate();
  logRequestGate.invalidate();
  activityRequestGate.invalidate();
  stopLogPolling();

  if (clockTimer) clearInterval(clockTimer);
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
      <div class="server-dashboard-grid">
        <section class="server-card server-config-card">
          <header class="server-card-header">
            <div>
              <h3>Configuração do servidor</h3>
              <p>Ajustes usados para iniciar o processo local.</p>
            </div>
            <span v-if="settingsMessage" class="server-saved-message">
              {{ settingsMessage }}
            </span>
          </header>

          <div class="server-config-list">
            <label class="server-config-row">
              <span class="server-config-icon">
                <ServerStackIcon aria-hidden="true" />
              </span>
              <span class="server-config-copy">
                <strong>Porta</strong>
                <small>Porta em que a aplicação será executada.</small>
              </span>
              <input
                v-model="selectedPort"
                class="server-config-control server-port-input"
                type="number"
                min="1024"
                max="65535"
                inputmode="numeric"
                placeholder="Automática"
                :disabled="loadingSettings || canStop"
              />
            </label>

            <div class="server-config-row">
              <span class="server-config-icon">
                <GlobeAltIcon aria-hidden="true" />
              </span>
              <span class="server-config-copy">
                <strong>Ambiente</strong>
                <small>Contexto local usado na execução.</small>
              </span>
              <span class="server-config-value">{{ environmentLabel }}</span>
            </div>

            <div class="server-config-row">
              <span class="server-config-icon">
                <CommandLineIcon aria-hidden="true" />
              </span>
              <span class="server-config-copy">
                <strong>Comando</strong>
                <small>Comando detectado para iniciar o servidor.</small>
              </span>
              <code class="server-config-code">{{ commandLabel }}</code>
            </div>

            <div class="server-config-row">
              <span class="server-config-icon">
                <ArrowPathIcon aria-hidden="true" />
              </span>
              <span class="server-config-copy">
                <strong>Monitoramento</strong>
                <small>O dashboard acompanha o processo automaticamente.</small>
              </span>
              <span class="server-config-state server-config-state-on">
                Ativo
              </span>
            </div>

            <div class="server-config-row">
              <span class="server-config-icon">
                <HeartIcon aria-hidden="true" />
              </span>
              <span class="server-config-copy">
                <strong>Acesso local</strong>
                <small>Disponibilidade do endereço principal.</small>
              </span>
              <span
                class="server-config-state"
                :class="{
                  'server-config-state-on': Boolean(primaryProcessUrl),
                }"
              >
                {{ primaryProcessUrl ? 'Disponível' : 'Aguardando' }}
              </span>
            </div>
          </div>

          <footer class="server-config-footer">
            <button
              type="button"
              class="server-primary-button"
              :disabled="savingSettings || loadingSettings || canStop"
              @click="handleSaveSettings"
            >
              {{ savingSettings ? 'Salvando...' : 'Salvar configurações' }}
            </button>
          </footer>
        </section>

        <div class="server-dashboard-side">
          <section class="server-card server-status-card">
            <header class="server-card-header">
              <div>
                <h3>Status do servidor</h3>
                <p>Estado atual do processo gerenciado.</p>
              </div>
            </header>

            <div
              class="server-status-banner"
              :class="`server-status-banner-${processStatus}`"
            >
              <span class="server-status-symbol" aria-hidden="true">
                <BoltIcon />
              </span>
              <div>
                <strong>{{ statusLabel }}</strong>
                <span>{{ statusDescription }}</span>
              </div>
            </div>

            <dl class="server-metrics">
              <div>
                <dt>PID</dt>
                <dd>{{ managedProcess?.pid ?? '—' }}</dd>
              </div>
              <div>
                <dt>Porta</dt>
                <dd>{{ (managedProcess?.port ?? selectedPort) || '—' }}</dd>
              </div>
              <div>
                <dt>Uptime</dt>
                <dd>{{ uptimeLabel }}</dd>
              </div>
              <div>
                <dt>Iniciado</dt>
                <dd>{{ startedAtLabel }}</dd>
              </div>
            </dl>

            <div v-if="errorMessage" class="server-error" role="alert">
              {{ errorMessage }}
            </div>

            <footer class="server-status-actions">
              <button
                v-if="!canStop"
                type="button"
                class="server-primary-button"
                :disabled="executingAction || loadingSettings"
                @click="handleStart"
              >
                <PlayIcon aria-hidden="true" />
                {{ currentAction === 'start' ? 'Iniciando...' : 'Iniciar' }}
              </button>

              <button
                v-if="canStop"
                type="button"
                class="server-danger-button"
                :disabled="executingAction"
                @click="handleStop"
              >
                <StopIcon aria-hidden="true" />
                {{ currentAction === 'stop' ? 'Parando...' : 'Parar' }}
              </button>

              <button
                v-if="canStop"
                type="button"
                class="server-secondary-button"
                :disabled="executingAction"
                @click="handleRestart"
              >
                <ArrowPathIcon aria-hidden="true" />
                {{ currentAction === 'restart' ? 'Reiniciando...' : 'Reiniciar' }}
              </button>

              <a
                v-if="primaryProcessUrl"
                class="server-secondary-button"
                :href="primaryProcessUrl"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ArrowTopRightOnSquareIcon aria-hidden="true" />
                Abrir localhost
              </a>
            </footer>
          </section>

          <section class="server-card server-activity-card">
            <header class="server-card-header server-activity-header">
              <div>
                <h3>Atividade recente</h3>
                <p>Últimos eventos registrados para este servidor.</p>
              </div>
              <RouterLink
                :to="{
                  name: 'activity',
                  query: { projectId: project.id, origin: 'server' },
                }"
              >
                Ver tudo
              </RouterLink>
            </header>

            <div v-if="loadingActivities" class="server-activity-empty">
              Carregando atividade...
            </div>
            <div v-else-if="activityErrorMessage" class="server-activity-empty">
              {{ activityErrorMessage }}
            </div>
            <div v-else-if="activities.length === 0" class="server-activity-empty">
              Nenhuma atividade registrada ainda.
            </div>
            <ol v-else class="server-activity-list">
              <li v-for="activity in activities" :key="activity.id">
                <span
                  class="server-activity-dot"
                  :class="`server-activity-dot-${activity.status}`"
                  :title="activityStatusLabel(activity)"
                />
                <span class="server-activity-label">{{ activity.label }}</span>
                <time :datetime="activity.startedAt">
                  {{ formatActivityTime(activity.startedAt) }}
                </time>
              </li>
            </ol>
          </section>
        </div>
      </div>

      <section class="server-card server-log-preview-card">
        <header class="server-card-header server-log-preview-header">
          <div>
            <h3>Últimos logs</h3>
            <p>
              {{ loadingLogs ? 'Atualizando...' : formattedLogSize }}
              <template v-if="logSnapshot?.truncated"> · trecho final</template>
            </p>
          </div>
          <RouterLink
            class="server-log-link"
            :to="{ name: 'project-logs', params: { projectId: project.id } }"
          >
            Ver todos os logs
            <ArrowTopRightOnSquareIcon aria-hidden="true" />
          </RouterLink>
        </header>

        <div v-if="logErrorMessage" class="server-error" role="alert">
          {{ logErrorMessage }}
        </div>

        <pre class="server-log-preview"><code>{{ logPreviewContent }}</code></pre>
      </section>
    </template>
  </div>
</template>

<style scoped>
.server-dashboard {
  display: grid;
  gap: 14px;
}

.server-dashboard-grid {
  display: grid;
  grid-template-columns: minmax(360px, 0.92fr) minmax(0, 1.38fr);
  gap: 14px;
  align-items: start;
}

.server-dashboard-side {
  display: grid;
  gap: 14px;
}

.server-card {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  box-shadow: 0 12px 32px rgb(0 0 0 / 3.5%);
}

.server-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 16px 18px 14px;
}

.server-card-header h3 {
  margin: 0;
  color: var(--text);
  font-size: 15px;
  line-height: 1.3;
}

.server-card-header p {
  margin: 4px 0 0;
  color: var(--text-dim);
  font-size: 11px;
  line-height: 1.5;
}

.server-saved-message {
  flex: 0 0 auto;
  color: var(--success-text);
  font-size: 11px;
  font-weight: var(--font-weight-strong);
}

.server-config-list {
  padding: 0 16px;
}

.server-config-row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) minmax(108px, auto);
  align-items: center;
  gap: 12px;
  min-height: 66px;
  border-top: 1px solid var(--border);
}

.server-config-icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 10px;
  color: var(--accent);
  background: var(--accent-soft);
}

.server-config-icon svg {
  width: 17px;
  height: 17px;
}

.server-config-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.server-config-copy strong {
  color: var(--text-muted);
  font-size: 12px;
}

.server-config-copy small {
  color: var(--text-dim);
  font-size: 10px;
  line-height: 1.35;
}

.server-config-control,
.server-config-value,
.server-config-code,
.server-config-state {
  justify-self: end;
}

.server-config-control {
  width: 118px;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  outline: 0;
  color: var(--text);
  background: var(--surface-0);
  font: inherit;
  font-size: 12px;
}

.server-config-control:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.server-config-control:disabled {
  color: var(--text-dim);
  background: var(--surface-2);
}

.server-config-value,
.server-config-code {
  max-width: 190px;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.server-config-code {
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface-2);
}

.server-config-state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-dim);
  font-size: 10px;
  font-weight: var(--font-weight-strong);
}

.server-config-state::before {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--text-dim);
  content: '';
}

.server-config-state-on {
  color: var(--success-text);
}

.server-config-state-on::before {
  background: var(--success-text);
  box-shadow: 0 0 0 3px var(--success-surface);
}

.server-config-footer {
  padding: 14px 16px 16px;
  border-top: 1px solid var(--border);
}

.server-primary-button,
.server-secondary-button,
.server-danger-button,
.server-log-link {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 12px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: var(--font-weight-strong);
  text-decoration: none;
  transition:
    border-color 150ms ease,
    background 150ms ease,
    color 150ms ease,
    transform 150ms ease;
}

.server-primary-button {
  border: 1px solid var(--accent);
  color: white;
  background: var(--accent);
}

.server-primary-button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.server-secondary-button,
.server-log-link {
  border: 1px solid var(--border);
  color: var(--text-muted);
  background: var(--surface-1);
}

.server-secondary-button:hover:not(:disabled),
.server-log-link:hover {
  border-color: var(--border-strong);
  color: var(--text);
  background: var(--surface-2);
}

.server-danger-button {
  border: 1px solid var(--danger-text);
  color: var(--danger-text);
  background: var(--danger-surface);
}

.server-primary-button:disabled,
.server-secondary-button:disabled,
.server-danger-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.server-primary-button svg,
.server-secondary-button svg,
.server-danger-button svg,
.server-log-link svg {
  width: 15px;
  height: 15px;
}

.server-status-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 16px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
}

.server-status-banner-running,
.server-status-banner-starting {
  border-color: color-mix(in srgb, var(--success-text) 22%, var(--border));
  background: linear-gradient(90deg, var(--success-surface), var(--surface-1));
}

.server-status-banner-failed {
  border-color: color-mix(in srgb, var(--danger-text) 24%, var(--border));
  background: linear-gradient(90deg, var(--danger-surface), var(--surface-1));
}

.server-status-symbol {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-1);
  box-shadow: 0 0 0 1px var(--border);
}

.server-status-banner-running .server-status-symbol,
.server-status-banner-starting .server-status-symbol {
  color: var(--success-text);
}

.server-status-banner-failed .server-status-symbol {
  color: var(--danger-text);
}

.server-status-symbol svg {
  width: 18px;
  height: 18px;
}

.server-status-banner > div {
  display: grid;
  gap: 3px;
}

.server-status-banner strong {
  color: var(--text);
  font-size: 15px;
}

.server-status-banner-running strong,
.server-status-banner-starting strong {
  color: var(--success-text);
}

.server-status-banner-failed strong {
  color: var(--danger-text);
}

.server-status-banner span {
  color: var(--text-dim);
  font-size: 11px;
}

.server-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 14px 16px 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-0);
}

.server-metrics > div {
  min-width: 0;
  padding: 12px;
  border-right: 1px solid var(--border);
}

.server-metrics > div:last-child {
  border-right: 0;
}

.server-metrics dt {
  color: var(--text-dim);
  font-size: 9px;
  font-weight: var(--font-weight-strong);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.server-metrics dd {
  overflow: hidden;
  margin: 6px 0 0;
  color: var(--text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  font-weight: var(--font-weight-strong);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.server-status-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
  padding: 14px 16px 16px;
  border-top: 1px solid var(--border);
}

.server-error {
  margin: 12px 16px 0;
  padding: 9px 10px;
  border: 1px solid var(--danger-text);
  border-radius: var(--radius-sm);
  color: var(--danger-text);
  background: var(--danger-surface);
  font-size: 11px;
}

.server-activity-header {
  align-items: center;
}

.server-activity-header a {
  flex: 0 0 auto;
  color: var(--accent);
  font-size: 11px;
  font-weight: var(--font-weight-strong);
  text-decoration: none;
}

.server-activity-list {
  margin: 0;
  padding: 0 16px 10px;
  list-style: none;
}

.server-activity-list li {
  display: grid;
  grid-template-columns: 9px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 34px;
  border-top: 1px solid var(--border);
}

.server-activity-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--text-dim);
}

.server-activity-dot-running {
  background: var(--info-text);
  box-shadow: 0 0 0 3px var(--info-surface);
}

.server-activity-dot-succeeded {
  background: var(--success-text);
  box-shadow: 0 0 0 3px var(--success-surface);
}

.server-activity-dot-failed {
  background: var(--danger-text);
  box-shadow: 0 0 0 3px var(--danger-surface);
}

.server-activity-dot-cancelled {
  background: var(--warning-text);
  box-shadow: 0 0 0 3px var(--warning-surface);
}

.server-activity-label {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.server-activity-list time {
  color: var(--text-dim);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 9px;
}

.server-activity-empty {
  padding: 16px;
  border-top: 1px solid var(--border);
  color: var(--text-dim);
  font-size: 11px;
}

.server-log-preview-card {
  padding-bottom: 14px;
}

.server-log-preview-header {
  align-items: center;
}

.server-log-link {
  flex: 0 0 auto;
}

.server-log-preview {
  min-height: 150px;
  max-height: 210px;
  overflow: auto;
  margin: 0 14px;
  padding: 15px 16px;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: var(--radius-md);
  color: #dce4f2;
  background:
    radial-gradient(circle at 90% 0, rgb(69 91 126 / 20%), transparent 42%),
    #111722;
  font-size: 11px;
  line-height: 1.65;
  white-space: pre-wrap;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 4%);
}

.server-log-preview code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.server-empty-state {
  display: flex;
  min-height: 180px;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 28px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-lg);
  color: var(--text-muted);
  background: var(--surface-1);
}

.server-empty-state > svg {
  width: 28px;
  height: 28px;
  color: var(--text-dim);
}

.server-empty-state strong {
  color: var(--text);
}

.server-empty-state p {
  margin: 4px 0 0;
  font-size: 12px;
}

@media (max-width: 1180px) {
  .server-dashboard-grid {
    grid-template-columns: 1fr;
  }

  .server-dashboard-side {
    grid-template-columns: minmax(0, 1fr) minmax(320px, 0.78fr);
  }
}

@media (max-width: 860px) {
  .server-dashboard-side {
    grid-template-columns: 1fr;
  }

  .server-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .server-metrics > div:nth-child(2) {
    border-right: 0;
  }

  .server-metrics > div:nth-child(-n + 2) {
    border-bottom: 1px solid var(--border);
  }
}

@media (max-width: 620px) {
  .server-config-row {
    grid-template-columns: 34px minmax(0, 1fr);
    padding: 12px 0;
  }

  .server-config-control,
  .server-config-value,
  .server-config-code,
  .server-config-state {
    grid-column: 2;
    justify-self: stretch;
    width: auto;
    max-width: none;
  }

  .server-card-header,
  .server-log-preview-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .server-log-link {
    align-self: stretch;
  }

  .server-status-actions > * {
    flex: 1 1 140px;
  }
}
</style>
