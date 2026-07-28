<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue';

import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  MagnifyingGlassIcon,
  PauseIcon,
  PlayIcon,
  ServerStackIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline';

import { RouterLink } from 'vue-router';

import type {
  ProcessLogSnapshot,
  Project,
} from '@dev-dashboard/contracts';

import {
  clearProjectProcessLog,
  fetchProjectProcessLog,
} from '../api';

import { useAutoDismiss } from '../composables/useAutoDismiss';
import { useProjectProcessStatus } from '../composables/useProjectProcessStatus';
import {
  RequestGate,
  RequestGeneration,
} from '../utils/request-generation';

interface LogLine {
  id: string;
  text: string;
  level: 'info' | 'debug' | 'warning' | 'error' | 'neutral';
}

const props = defineProps<{
  project: Project;
}>();

const {
  managedProcess,
  loadingStatus,
  errorMessage: processErrorMessage,
  supportsServer,
  processStatus,
  hasManagedProcess,
  statusLabel,
} = useProjectProcessStatus(() => props.project);

const loadingLogs = ref(false);
const logSnapshot = ref<ProcessLogSnapshot | null>(null);
const logErrorMessage = ref('');
const logContainer = ref<HTMLElement | null>(null);
const followLogs = ref(true);
const streamPaused = ref(false);
const searchQuery = ref('');
const levelFilter = ref('all');

useAutoDismiss(processErrorMessage, '');
useAutoDismiss(logErrorMessage, '');

const projectRequests = new RequestGeneration();
const logRequests = new RequestGeneration();
const logRequestGate = new RequestGate();
let logPollingTimer: ReturnType<typeof setTimeout> | undefined;
let clearingLog = false;

const processUrls = computed<string[]>(() => {
  if (processStatus.value !== 'running') return [];

  if (managedProcess.value?.urls?.length) {
    return managedProcess.value.urls;
  }

  if (managedProcess.value?.url) {
    return [managedProcess.value.url];
  }

  return managedProcess.value?.port
    ? [`http://localhost:${managedProcess.value.port}`]
    : [];
});

const formattedLogSize = computed(() => {
  const size = logSnapshot.value?.sizeBytes ?? 0;

  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
});

function detectLogLevel(text: string): LogLine['level'] {
  if (/\b(?:ERROR|FATAL)\b/i.test(text)) return 'error';
  if (/\bWARN(?:ING)?\b/i.test(text)) return 'warning';
  if (/\bDEBUG\b/i.test(text)) return 'debug';
  if (/\bINFO\b/i.test(text)) return 'info';

  return 'neutral';
}

const logLines = computed<LogLine[]>(() =>
  (logSnapshot.value?.content ?? '')
    .split('\n')
    .filter((line, index, lines) => line || index < lines.length - 1)
    .map((text, index) => ({
      id: `${index}-${text.slice(0, 24)}`,
      text,
      level: detectLogLevel(text),
    })),
);

const visibleLogLines = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();

  return logLines.value.filter((line) => {
    const matchesLevel =
      levelFilter.value === 'all' || line.level === levelFilter.value;
    const matchesSearch =
      !query || line.text.toLowerCase().includes(query);

    return matchesLevel && matchesSearch;
  });
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

async function scrollLogsToBottom(): Promise<void> {
  if (!followLogs.value) return;

  await nextTick();
  const element = logContainer.value;

  if (element) {
    element.scrollTop = element.scrollHeight;
  }
}

async function refreshLogs(): Promise<void> {
  if (!hasManagedProcess.value || clearingLog) return;

  const requestToken = logRequestGate.begin('project-logs');
  if (!requestToken) return;

  const projectId = props.project.id;
  const generation = projectRequests.capture();
  const logGeneration = logRequests.capture();
  loadingLogs.value = true;
  logErrorMessage.value = '';

  try {
    const snapshot = await fetchProjectProcessLog(projectId);

    if (
      isCurrentProject(projectId, generation) &&
      logRequests.isCurrent(logGeneration)
    ) {
      logSnapshot.value = snapshot;
      await scrollLogsToBottom();
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

  if (
    streamPaused.value ||
    !supportsServer.value ||
    !hasManagedProcess.value
  ) {
    return;
  }

  const generation = projectRequests.capture();
  logPollingTimer = setTimeout(async () => {
    await refreshLogs();

    if (
      projectRequests.isCurrent(generation) &&
      !streamPaused.value &&
      hasManagedProcess.value
    ) {
      scheduleLogPolling();
    }
  }, 2_000);
}

function handleLogScroll(): void {
  const element = logContainer.value;
  if (!element) return;

  const distanceFromBottom =
    element.scrollHeight -
    element.scrollTop -
    element.clientHeight;

  followLogs.value = distanceFromBottom < 40;
}

async function clearLogView(): Promise<void> {
  if (!hasManagedProcess.value || clearingLog) return;

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
      scheduleLogPolling();
    }
  }
}

function toggleStream(): void {
  streamPaused.value = !streamPaused.value;

  if (streamPaused.value) {
    stopLogPolling();
  } else {
    void refreshLogs().then(scheduleLogPolling);
  }
}

function resetLogs(): void {
  projectRequests.invalidate();
  logRequests.invalidate();
  logRequestGate.invalidate();
  stopLogPolling();
  clearingLog = false;
  loadingLogs.value = false;
  logSnapshot.value = null;
  logErrorMessage.value = '';
  followLogs.value = true;
  streamPaused.value = false;
  searchQuery.value = '';
  levelFilter.value = 'all';
}

watch(
  () => props.project.id,
  () => {
    resetLogs();
  },
  { immediate: true },
);

watch(
  hasManagedProcess,
  (available) => {
    if (!available) {
      stopLogPolling();
      return;
    }

    void refreshLogs().then(scheduleLogPolling);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  projectRequests.invalidate();
  logRequests.invalidate();
  logRequestGate.invalidate();
  stopLogPolling();
});
</script>

<template>
  <div class="project-logs-layout">
    <section class="project-logs-card">
      <div class="project-logs-toolbar">
        <label class="project-log-filter">
          <span>Nível</span>
          <select v-model="levelFilter">
            <option value="all">Todos os níveis</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
            <option value="warning">Avisos</option>
            <option value="error">Erros</option>
          </select>
        </label>

        <label class="project-log-search">
          <span class="sr-only">Buscar nos logs</span>
          <MagnifyingGlassIcon aria-hidden="true" />
          <input
            v-model="searchQuery"
            type="search"
            placeholder="Buscar nos logs..."
          />
        </label>

        <div class="project-log-toolbar-actions">
          <button
            type="button"
            :disabled="loadingLogs || !hasManagedProcess"
            @click="refreshLogs"
          >
            <ArrowPathIcon aria-hidden="true" />
            Atualizar
          </button>
          <button
            type="button"
            :disabled="loadingLogs || !hasManagedProcess"
            @click="clearLogView"
          >
            <TrashIcon aria-hidden="true" />
            Limpar
          </button>
          <button
            type="button"
            class="stream-toggle-button"
            :disabled="!hasManagedProcess"
            @click="toggleStream"
          >
            <PlayIcon v-if="streamPaused" aria-hidden="true" />
            <PauseIcon v-else aria-hidden="true" />
            {{ streamPaused ? 'Retomar stream' : 'Pausar stream' }}
          </button>
        </div>
      </div>

      <div class="project-log-terminal">
        <header class="project-log-terminal-header">
          <div>
            <span
              class="project-log-stream-status"
              :class="{ 'project-log-stream-paused': streamPaused }"
            >
              {{ streamPaused ? 'Pausado' : 'Streaming' }}
            </span>
            <span>
              {{
                managedProcess?.port
                  ? `localhost:${managedProcess.port}`
                  : 'Aguardando servidor'
              }}
            </span>
          </div>

          <div>
            <span v-if="logSnapshot">
              {{ formattedLogSize }}
              <template v-if="logSnapshot.truncated"> · trecho final</template>
            </span>
            <span>{{ followLogs ? 'Auto scroll' : 'Rolagem pausada' }}</span>
          </div>
        </header>

        <div
          ref="logContainer"
          class="project-log-lines"
          tabindex="0"
          @scroll="handleLogScroll"
        >
          <div
            v-if="loadingStatus && !hasManagedProcess"
            class="project-log-terminal-empty"
          >
            Verificando o processo do projeto...
          </div>

          <div
            v-else-if="!hasManagedProcess"
            class="project-log-terminal-empty"
          >
            Nenhum processo gerenciado foi iniciado para este projeto.
          </div>

          <div
            v-else-if="!logLines.length"
            class="project-log-terminal-empty"
          >
            Nenhuma saída registrada.
          </div>

          <div
            v-else-if="!visibleLogLines.length"
            class="project-log-terminal-empty"
          >
            Nenhuma linha corresponde aos filtros aplicados.
          </div>

          <code v-else>
            <span
              v-for="line in visibleLogLines"
              :key="line.id"
              class="project-log-line"
              :class="`project-log-line-${line.level}`"
            >{{ line.text || ' ' }}</span>
          </code>
        </div>

        <footer class="project-log-terminal-footer">
          <span>
            {{
              loadingLogs
                ? 'Atualizando logs...'
                : streamPaused
                  ? 'Atualização automática pausada'
                  : 'Acompanhando novas linhas a cada 2 segundos'
            }}
          </span>

          <button
            v-if="!followLogs"
            type="button"
            @click="
              followLogs = true;
              scrollLogsToBottom();
            "
          >
            Ir para o final
          </button>
        </footer>
      </div>

      <div v-if="processErrorMessage" class="project-error" role="alert">
        {{ processErrorMessage }}
      </div>

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
    </section>

    <aside class="project-logs-sidebar">
      <section class="project-log-status-card">
        <div class="project-log-status-title">
          <ServerStackIcon aria-hidden="true" />
          <div>
            <span>Status do servidor</span>
            <strong
              class="process-status"
              :class="`process-status-${processStatus}`"
            >
              <span />
              {{ statusLabel }}
            </strong>
          </div>
        </div>

        <dl>
          <div>
            <dt>Porta</dt>
            <dd>{{ managedProcess?.port ?? '—' }}</dd>
          </div>
          <div>
            <dt>PID</dt>
            <dd>{{ managedProcess?.pid ?? '—' }}</dd>
          </div>
          <div>
            <dt>Saída</dt>
            <dd>{{ managedProcess?.exitCode ?? '—' }}</dd>
          </div>
          <div>
            <dt>Linhas visíveis</dt>
            <dd>{{ visibleLogLines.length }}</dd>
          </div>
        </dl>
      </section>

      <section class="project-log-quick-actions">
        <span>Ações rápidas</span>
        <RouterLink
          :to="{
            name: 'project-server',
            params: { projectId: project.id },
          }"
        >
          <ServerStackIcon aria-hidden="true" />
          Ir para Servidor
          <ArrowTopRightOnSquareIcon aria-hidden="true" />
        </RouterLink>
        <a
          v-if="processUrls[0]"
          :href="processUrls[0]"
          target="_blank"
          rel="noopener noreferrer"
        >
          <ArrowTopRightOnSquareIcon aria-hidden="true" />
          Abrir localhost
          <ArrowTopRightOnSquareIcon aria-hidden="true" />
        </a>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.project-logs-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 230px;
  gap: var(--space-4);
  align-items: start;
}

.project-logs-card,
.project-log-status-card,
.project-log-quick-actions {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  box-shadow: 0 14px 34px rgb(0 0 0 / 4%);
}

.project-logs-card {
  overflow: hidden;
}

.project-logs-toolbar {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 14px;
  border-bottom: 1px solid var(--border);
}

.project-log-filter {
  display: grid;
  flex: 0 0 170px;
  gap: 5px;
  color: var(--text-dim);
  font-size: 10px;
  font-weight: var(--font-weight-strong);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.project-log-filter select,
.project-log-search {
  min-height: 36px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  background: var(--surface-2);
  font: inherit;
  font-size: var(--font-xs);
  text-transform: none;
  letter-spacing: normal;
}

.project-log-filter select {
  padding: 0 10px;
}

.project-log-search {
  display: flex;
  min-width: 200px;
  flex: 1;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
}

.project-log-search svg {
  width: 16px;
  height: 16px;
  color: var(--text-dim);
}

.project-log-search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  color: var(--text);
  background: transparent;
  font: inherit;
  font-size: var(--font-xs);
}

.project-log-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}

.project-log-toolbar-actions button {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: var(--surface-2);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  white-space: nowrap;
}

.project-log-toolbar-actions button:hover:not(:disabled) {
  border-color: var(--border-strong);
  color: var(--text);
}

.project-log-toolbar-actions .stream-toggle-button {
  border-color: var(--danger-text);
  color: var(--danger-text);
  background: var(--danger-surface);
}

.project-log-toolbar-actions svg {
  width: 15px;
  height: 15px;
}

.project-log-terminal {
  margin: 14px;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: var(--radius-md);
  color: #d9e2f0;
  background: #101621;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 4%);
}

.project-log-terminal-header,
.project-log-terminal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #8d9aab;
  background: #151d29;
  font-size: 10px;
}

.project-log-terminal-header {
  min-height: 42px;
  padding: 0 12px;
  border-bottom: 1px solid rgb(255 255 255 / 8%);
}

.project-log-terminal-header > div {
  display: flex;
  align-items: center;
  gap: 10px;
}

.project-log-stream-status {
  padding: 4px 7px;
  border-radius: 999px;
  color: #91e6a8;
  background: rgb(42 173 81 / 18%);
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

.project-log-stream-paused {
  color: #ffd09a;
  background: rgb(220 139 45 / 18%);
}

.project-log-lines {
  min-height: 430px;
  max-height: 58vh;
  overflow: auto;
  padding: 16px;
  outline: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.65;
}

.project-log-lines code {
  display: block;
}

.project-log-line {
  display: block;
  min-height: 18px;
  color: #c7d0dd;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.project-log-line-info {
  color: #b9e9c5;
}

.project-log-line-debug {
  color: #c8b8f4;
}

.project-log-line-warning {
  color: #f4cf8e;
}

.project-log-line-error {
  color: #ff9a9a;
}

.project-log-terminal-empty {
  display: grid;
  min-height: 360px;
  place-items: center;
  color: #7e8a9a;
  text-align: center;
}

.project-log-terminal-footer {
  min-height: 36px;
  padding: 0 12px;
  border-top: 1px solid rgb(255 255 255 / 8%);
}

.project-log-terminal-footer button {
  border: 0;
  color: #a9c4ff;
  background: transparent;
  font-size: 10px;
  font-weight: 700;
}

.project-error,
.project-log-redaction-warning {
  margin: 0 14px 14px;
}

.project-logs-sidebar {
  display: grid;
  gap: var(--space-4);
}

.project-log-status-card,
.project-log-quick-actions {
  padding: var(--space-4);
}

.project-log-status-title {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--border);
}

.project-log-status-title > svg {
  width: 20px;
  height: 20px;
  color: var(--accent);
}

.project-log-status-title > div {
  display: grid;
  gap: 8px;
}

.project-log-status-title > div > span,
.project-log-quick-actions > span {
  color: var(--text-dim);
  font-size: 10px;
  font-weight: var(--font-weight-strong);
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

.project-log-status-card dl {
  display: grid;
  gap: 0;
  margin: 0;
}

.project-log-status-card dl > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 0;
  border-bottom: 1px solid var(--border);
}

.project-log-status-card dl > div:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.project-log-status-card dt {
  color: var(--text-dim);
  font-size: var(--font-xs);
}

.project-log-status-card dd {
  margin: 0;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: var(--font-xs);
}

.project-log-quick-actions {
  display: grid;
  gap: 9px;
}

.project-log-quick-actions > span {
  margin-bottom: 3px;
}

.project-log-quick-actions a {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: var(--surface-2);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  text-decoration: none;
}

.project-log-quick-actions a:hover {
  border-color: var(--border-strong);
  color: var(--text);
}

.project-log-quick-actions svg {
  width: 16px;
  height: 16px;
}

@media (max-width: 1050px) {
  .project-logs-layout {
    grid-template-columns: 1fr;
  }

  .project-logs-sidebar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 800px) {
  .project-logs-toolbar {
    align-items: stretch;
    flex-wrap: wrap;
  }

  .project-log-filter,
  .project-log-search {
    min-width: 0;
    flex: 1 1 220px;
  }

  .project-log-toolbar-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .project-log-toolbar-actions button {
    flex: 1;
    justify-content: center;
  }

  .project-logs-sidebar {
    grid-template-columns: 1fr;
  }
}
</style>
