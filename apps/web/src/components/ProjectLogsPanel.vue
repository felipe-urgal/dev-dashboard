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
  ChevronDownIcon,
  ClipboardDocumentIcon,
  CodeBracketIcon,
  DocumentTextIcon,
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
import type {
  RailsLogGroup,
  RailsLogLine,
  RailsRequestLogGroup,
} from '../utils/rails-log-parser';
import {
  parseRailsLog,
  railsRequestStatusTone,
} from '../utils/rails-log-parser';
import {
  RequestGate,
  RequestGeneration,
} from '../utils/request-generation';

type ViewMode = 'requests' | 'raw';
type CategoryFilter = 'all' | 'requests' | 'sql' | 'render' | 'errors';

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
const categoryFilter = ref<CategoryFilter>('all');
const viewMode = ref<ViewMode>(props.project.type === 'rails' ? 'requests' : 'raw');
const copiedRequestId = ref('');

useAutoDismiss(processErrorMessage, '');
useAutoDismiss(logErrorMessage, '');
useAutoDismiss(copiedRequestId, '');

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

const parsedLog = computed(() => parseRailsLog(logSnapshot.value?.content ?? ''));
const hasStructuredRequests = computed(() =>
  parsedLog.value.groups.some((group) => group.kind === 'request'),
);

const requestGroups = computed(() =>
  parsedLog.value.groups.filter(
    (group): group is RailsRequestLogGroup => group.kind === 'request',
  ),
);

function groupMatchesCategory(group: RailsLogGroup): boolean {
  switch (categoryFilter.value) {
    case 'requests':
      return group.kind === 'request';
    case 'sql':
      return group.kind === 'request' && group.sqlLines.length > 0;
    case 'render':
      return group.kind === 'request' && group.renderLines.length > 0;
    case 'errors':
      return group.kind === 'request'
        ? group.errorLines.length > 0 || (group.status ?? 0) >= 400
        : group.lines.some((line) => line.kind === 'error' || line.kind === 'warning');
    default:
      return true;
  }
}

function lineMatchesCategory(line: RailsLogLine): boolean {
  switch (categoryFilter.value) {
    case 'requests':
      return ['request', 'controller', 'parameters', 'completed'].includes(line.kind);
    case 'sql':
      return line.kind === 'sql' || line.kind === 'source';
    case 'render':
      return line.kind === 'render';
    case 'errors':
      return line.kind === 'error' || line.kind === 'warning';
    default:
      return true;
  }
}

const visibleGroups = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();

  return parsedLog.value.groups.filter((group) => {
    const matchesSearch = !query || group.searchableText.includes(query);
    return matchesSearch && groupMatchesCategory(group);
  });
});

const visibleRawLines = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();

  return parsedLog.value.lines.filter((line) => {
    const matchesSearch = !query || line.text.toLowerCase().includes(query);
    return matchesSearch && lineMatchesCategory(line);
  });
});

const visibleLineCount = computed(() =>
  viewMode.value === 'requests'
    ? visibleGroups.value.reduce((total, group) => total + group.lines.length, 0)
    : visibleRawLines.value.length,
);

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
  categoryFilter.value = 'all';
  viewMode.value = props.project.type === 'rails' ? 'requests' : 'raw';
}

function formatDuration(value: number | undefined): string {
  if (value === undefined) return '—';
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}s`;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}ms`;
}

function methodTone(method: string | undefined): string {
  switch (method) {
    case 'POST':
      return 'method-post';
    case 'PUT':
    case 'PATCH':
      return 'method-write';
    case 'DELETE':
      return 'method-delete';
    default:
      return 'method-read';
  }
}

function rawLineClass(line: RailsLogLine): string {
  switch (line.kind) {
    case 'request':
    case 'completed':
      return 'project-log-line-request';
    case 'controller':
    case 'parameters':
      return 'project-log-line-controller';
    case 'sql':
      return 'project-log-line-sql';
    case 'source':
      return 'project-log-line-source';
    case 'render':
      return 'project-log-line-render';
    case 'warning':
      return 'project-log-line-warning';
    case 'error':
      return 'project-log-line-error';
    default:
      return 'project-log-line-neutral';
  }
}

async function copyRequestId(requestId: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(requestId);
    copiedRequestId.value = requestId;
  } catch {
    copiedRequestId.value = '';
  }
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

watch(viewMode, () => {
  void scrollLogsToBottom();
});

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
        <div class="project-log-view-switch" aria-label="Visualização do log">
          <button
            type="button"
            :class="{ active: viewMode === 'requests' }"
            :disabled="!hasStructuredRequests"
            @click="viewMode = 'requests'"
          >
            <DocumentTextIcon aria-hidden="true" />
            Requisições
          </button>
          <button
            type="button"
            :class="{ active: viewMode === 'raw' }"
            @click="viewMode = 'raw'"
          >
            <CodeBracketIcon aria-hidden="true" />
            Raw limpo
          </button>
        </div>

        <label class="project-log-filter">
          <span>Mostrar</span>
          <select v-model="categoryFilter">
            <option value="all">Tudo</option>
            <option value="requests">Requisições</option>
            <option value="sql">SQL</option>
            <option value="render">Renderização</option>
            <option value="errors">Erros e avisos</option>
          </select>
        </label>

        <label class="project-log-search">
          <span class="sr-only">Buscar nos logs</span>
          <MagnifyingGlassIcon aria-hidden="true" />
          <input
            v-model="searchQuery"
            type="search"
            placeholder="Rota, controller, SQL ou erro..."
          />
        </label>

        <div class="project-log-toolbar-actions">
          <button
            type="button"
            :disabled="loadingLogs || !hasManagedProcess"
            title="Atualizar logs"
            @click="refreshLogs"
          >
            <ArrowPathIcon aria-hidden="true" />
            <span>Atualizar</span>
          </button>
          <button
            type="button"
            :disabled="loadingLogs || !hasManagedProcess"
            title="Limpar logs"
            @click="clearLogView"
          >
            <TrashIcon aria-hidden="true" />
            <span>Limpar</span>
          </button>
          <button
            type="button"
            class="stream-toggle-button"
            :disabled="!hasManagedProcess"
            @click="toggleStream"
          >
            <PlayIcon v-if="streamPaused" aria-hidden="true" />
            <PauseIcon v-else aria-hidden="true" />
            {{ streamPaused ? 'Retomar' : 'Pausar' }}
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
            <span>{{ visibleLineCount }} linhas</span>
            <span>{{ followLogs ? 'Auto scroll' : 'Rolagem pausada' }}</span>
          </div>
        </header>

        <div
          ref="logContainer"
          class="project-log-content"
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
            v-else-if="!parsedLog.lines.length"
            class="project-log-terminal-empty"
          >
            Nenhuma saída registrada.
          </div>

          <div
            v-else-if="viewMode === 'requests' && !visibleGroups.length"
            class="project-log-terminal-empty"
          >
            Nenhuma requisição corresponde aos filtros aplicados.
          </div>

          <div
            v-else-if="viewMode === 'raw' && !visibleRawLines.length"
            class="project-log-terminal-empty"
          >
            Nenhuma linha corresponde aos filtros aplicados.
          </div>

          <div v-else-if="viewMode === 'requests'" class="rails-request-list">
            <template v-for="group in visibleGroups" :key="group.id">
              <article
                v-if="group.kind === 'request'"
                class="rails-request-card"
                :class="{
                  'rails-request-slow': (group.durationMs ?? 0) >= 500,
                  'rails-request-failed': (group.status ?? 0) >= 400,
                }"
              >
                <header class="rails-request-header">
                  <div class="rails-request-heading">
                    <span
                      class="rails-method"
                      :class="methodTone(group.method)"
                    >
                      {{ group.method ?? 'REQ' }}
                    </span>
                    <strong>{{ group.path ?? 'Requisição Rails' }}</strong>
                    <span
                      v-if="group.status"
                      class="rails-status"
                      :class="`rails-status-${railsRequestStatusTone(group.status)}`"
                    >
                      {{ group.status }}
                    </span>
                  </div>

                  <div class="rails-request-duration">
                    <strong>{{ formatDuration(group.durationMs) }}</strong>
                    <span v-if="group.startedAt">{{ group.startedAt }}</span>
                  </div>
                </header>

                <div class="rails-request-context">
                  <span v-if="group.controller">
                    {{ group.controller }}#{{ group.action }}
                  </span>
                  <span v-if="group.format">{{ group.format }}</span>
                  <button
                    type="button"
                    :title="copiedRequestId === group.requestId ? 'Copiado' : 'Copiar request ID'"
                    @click="copyRequestId(group.requestId)"
                  >
                    <ClipboardDocumentIcon aria-hidden="true" />
                    {{ group.requestId.slice(0, 8) }}
                  </button>
                </div>

                <div class="rails-request-metrics">
                  <span v-if="group.queryCount !== undefined">
                    <strong>{{ group.queryCount }}</strong> queries
                    <template v-if="group.cachedQueries"> · {{ group.cachedQueries }} cache</template>
                  </span>
                  <span v-if="group.activeRecordDurationMs !== undefined">
                    SQL <strong>{{ formatDuration(group.activeRecordDurationMs) }}</strong>
                  </span>
                  <span v-if="group.viewDurationMs !== undefined">
                    Views <strong>{{ formatDuration(group.viewDurationMs) }}</strong>
                  </span>
                  <span v-if="group.gcDurationMs !== undefined">
                    GC <strong>{{ formatDuration(group.gcDurationMs) }}</strong>
                  </span>
                </div>

                <div v-if="group.parameters" class="rails-parameters">
                  <span>Parâmetros</span>
                  <code>{{ group.parameters }}</code>
                </div>

                <div v-if="group.errorLines.length" class="rails-error-lines">
                  <span
                    v-for="line in group.errorLines"
                    :key="line.id"
                  >{{ line.text }}</span>
                </div>

                <div class="rails-request-details">
                  <details v-if="group.sqlLines.length">
                    <summary>
                      <span>SQL</span>
                      <strong>{{ group.sqlLines.length }} operações</strong>
                      <ChevronDownIcon aria-hidden="true" />
                    </summary>
                    <div class="rails-detail-lines rails-sql-lines">
                      <code
                        v-for="line in [...group.sqlLines, ...group.sourceLines]"
                        :key="line.id"
                        :class="`rails-detail-${line.kind}`"
                      >{{ line.text }}</code>
                    </div>
                  </details>

                  <details v-if="group.renderLines.length">
                    <summary>
                      <span>Renderização</span>
                      <strong>{{ group.renderLines.length }} etapas</strong>
                      <ChevronDownIcon aria-hidden="true" />
                    </summary>
                    <div class="rails-detail-lines">
                      <code
                        v-for="line in group.renderLines"
                        :key="line.id"
                      >{{ line.text }}</code>
                    </div>
                  </details>

                  <details v-if="group.otherLines.length">
                    <summary>
                      <span>Outras linhas</span>
                      <strong>{{ group.otherLines.length }}</strong>
                      <ChevronDownIcon aria-hidden="true" />
                    </summary>
                    <div class="rails-detail-lines">
                      <code
                        v-for="line in group.otherLines"
                        :key="line.id"
                      >{{ line.text || ' ' }}</code>
                    </div>
                  </details>
                </div>
              </article>

              <div v-else class="rails-system-group">
                <span>Sistema</span>
                <code
                  v-for="line in group.lines"
                  :key="line.id"
                  :class="rawLineClass(line)"
                >{{ line.text || ' ' }}</code>
              </div>
            </template>
          </div>

          <code v-else class="project-log-raw-lines">
            <span
              v-for="line in visibleRawLines"
              :key="line.id"
              class="project-log-line"
              :class="rawLineClass(line)"
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
            <dd>{{ visibleLineCount }}</dd>
          </div>
        </dl>
      </section>

      <section v-if="hasStructuredRequests" class="project-log-summary-card">
        <span>Resumo Rails</span>
        <dl>
          <div>
            <dt>Requests</dt>
            <dd>{{ parsedLog.summary.totalRequests }}</dd>
          </div>
          <div>
            <dt>Sucesso</dt>
            <dd class="summary-success">{{ parsedLog.summary.successful }}</dd>
          </div>
          <div>
            <dt>Erros</dt>
            <dd class="summary-error">
              {{ parsedLog.summary.clientErrors + parsedLog.summary.serverErrors }}
            </dd>
          </div>
          <div>
            <dt>Queries</dt>
            <dd>{{ parsedLog.summary.totalQueries }}</dd>
          </div>
          <div>
            <dt>Tempo médio</dt>
            <dd>{{ formatDuration(parsedLog.summary.averageDurationMs) }}</dd>
          </div>
          <div>
            <dt>Mais lento</dt>
            <dd>{{ formatDuration(parsedLog.summary.slowestDurationMs) }}</dd>
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
.project-log-summary-card,
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

.project-log-view-switch {
  display: flex;
  flex: 0 0 auto;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.project-log-view-switch button {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  gap: 6px;
  padding: 0 9px;
  border: 0;
  border-radius: 6px;
  color: var(--text-dim);
  background: transparent;
  font-size: 10px;
  font-weight: var(--font-weight-strong);
}

.project-log-view-switch button.active {
  color: var(--accent);
  background: var(--surface-1);
  box-shadow: 0 1px 4px rgb(0 0 0 / 8%);
}

.project-log-view-switch svg,
.project-log-toolbar-actions svg {
  width: 15px;
  height: 15px;
}

.project-log-filter {
  display: grid;
  flex: 0 0 145px;
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
  min-width: 180px;
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

.project-log-content {
  min-height: 430px;
  max-height: 62vh;
  overflow: auto;
  padding: 14px;
  outline: 0;
}

.rails-request-list {
  display: grid;
  gap: 10px;
}

.rails-request-card {
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 9%);
  border-radius: 10px;
  background: #151d29;
}

.rails-request-card:hover {
  border-color: rgb(137 169 255 / 32%);
}

.rails-request-slow {
  border-left: 3px solid #e4ad53;
}

.rails-request-failed {
  border-left: 3px solid #e86666;
}

.rails-request-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 14px 8px;
}

.rails-request-heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.rails-request-heading > strong {
  overflow: hidden;
  color: #edf2fb;
  font-family: var(--font-mono);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rails-method,
.rails-status {
  display: inline-flex;
  min-height: 22px;
  align-items: center;
  justify-content: center;
  padding: 0 7px;
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.03em;
}

.method-read {
  color: #9ac2ff;
  background: rgb(69 127 214 / 18%);
}

.method-post {
  color: #91e6a8;
  background: rgb(42 173 81 / 18%);
}

.method-write {
  color: #dfc3ff;
  background: rgb(139 92 246 / 18%);
}

.method-delete {
  color: #ffadad;
  background: rgb(222 75 75 / 18%);
}

.rails-status-success {
  color: #91e6a8;
  background: rgb(42 173 81 / 16%);
}

.rails-status-redirect {
  color: #9ac2ff;
  background: rgb(69 127 214 / 16%);
}

.rails-status-warning {
  color: #ffd09a;
  background: rgb(220 139 45 / 18%);
}

.rails-status-error {
  color: #ffadad;
  background: rgb(222 75 75 / 18%);
}

.rails-status-neutral {
  color: #b8c2d0;
  background: rgb(255 255 255 / 7%);
}

.rails-request-duration {
  display: grid;
  flex: 0 0 auto;
  gap: 3px;
  color: #7f8da0;
  font-size: 9px;
  text-align: right;
}

.rails-request-duration strong {
  color: #d9e2f0;
  font-family: var(--font-mono);
  font-size: 11px;
}

.rails-request-context,
.rails-request-metrics {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  padding: 0 14px 10px;
  color: #8d9aab;
  font-size: 10px;
}

.rails-request-context > span,
.rails-request-metrics > span {
  padding-right: 8px;
  border-right: 1px solid rgb(255 255 255 / 8%);
}

.rails-request-context > span:last-of-type,
.rails-request-metrics > span:last-child {
  border-right: 0;
}

.rails-request-context button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  border: 0;
  color: #718096;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9px;
}

.rails-request-context button:hover {
  color: #a9c4ff;
}

.rails-request-context svg {
  width: 13px;
  height: 13px;
}

.rails-request-metrics strong {
  color: #dbe5f3;
  font-family: var(--font-mono);
}

.rails-parameters {
  display: grid;
  gap: 5px;
  margin: 0 14px 10px;
  padding: 8px 10px;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 7px;
  background: rgb(4 8 15 / 22%);
}

.rails-parameters span {
  color: #7f8da0;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

.rails-parameters code {
  color: #d1bdf3;
  font-family: var(--font-mono);
  font-size: 10px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.rails-error-lines {
  display: grid;
  gap: 4px;
  margin: 0 14px 10px;
  padding: 9px 10px;
  border: 1px solid rgb(232 102 102 / 26%);
  border-radius: 7px;
  color: #ffadad;
  background: rgb(222 75 75 / 9%);
  font-family: var(--font-mono);
  font-size: 10px;
}

.rails-request-details {
  border-top: 1px solid rgb(255 255 255 / 7%);
}

.rails-request-details details + details {
  border-top: 1px solid rgb(255 255 255 / 6%);
}

.rails-request-details summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 16px;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 14px;
  color: #8d9aab;
  cursor: pointer;
  font-size: 10px;
  list-style: none;
}

.rails-request-details summary::-webkit-details-marker {
  display: none;
}

.rails-request-details summary:hover {
  color: #d9e2f0;
  background: rgb(255 255 255 / 3%);
}

.rails-request-details summary strong {
  font-weight: 600;
}

.rails-request-details summary svg {
  width: 14px;
  height: 14px;
  transition: transform 140ms ease;
}

.rails-request-details details[open] summary svg {
  transform: rotate(180deg);
}

.rails-detail-lines {
  display: grid;
  gap: 4px;
  padding: 10px 14px 12px;
  border-top: 1px solid rgb(255 255 255 / 5%);
  background: #0f1520;
}

.rails-detail-lines code {
  color: #b8c2d0;
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.rails-sql-lines code {
  color: #b8d4ff;
}

.rails-sql-lines .rails-detail-source {
  color: #74839a;
}

.rails-system-group {
  display: grid;
  gap: 3px;
  padding: 10px 12px;
  border: 1px dashed rgb(255 255 255 / 10%);
  border-radius: 8px;
  background: rgb(255 255 255 / 2%);
}

.rails-system-group > span {
  margin-bottom: 3px;
  color: #6f7d90;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.rails-system-group code,
.project-log-raw-lines {
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.65;
}

.project-log-raw-lines {
  display: block;
}

.project-log-line,
.rails-system-group code {
  display: block;
  min-height: 18px;
  color: #c7d0dd;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.project-log-line-request {
  color: #9ac2ff !important;
}

.project-log-line-controller {
  color: #dfc3ff !important;
}

.project-log-line-sql {
  color: #b8d4ff !important;
}

.project-log-line-source,
.project-log-line-render {
  color: #8491a4 !important;
}

.project-log-line-warning {
  color: #f4cf8e !important;
}

.project-log-line-error {
  color: #ff9a9a !important;
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
.project-log-summary-card,
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
.project-log-summary-card > span,
.project-log-quick-actions > span {
  color: var(--text-dim);
  font-size: 10px;
  font-weight: var(--font-weight-strong);
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

.project-log-status-card dl,
.project-log-summary-card dl {
  display: grid;
  gap: 0;
  margin: 0;
}

.project-log-summary-card > span {
  display: block;
  margin-bottom: 8px;
}

.project-log-status-card dl > div,
.project-log-summary-card dl > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}

.project-log-status-card dl > div:last-child,
.project-log-summary-card dl > div:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.project-log-status-card dt,
.project-log-summary-card dt {
  color: var(--text-dim);
  font-size: var(--font-xs);
}

.project-log-status-card dd,
.project-log-summary-card dd {
  margin: 0;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
}

.project-log-summary-card .summary-success {
  color: var(--success-text);
}

.project-log-summary-card .summary-error {
  color: var(--danger-text);
}

.project-log-quick-actions {
  display: grid;
  gap: 8px;
}

.project-log-quick-actions > span {
  margin-bottom: 2px;
}

.project-log-quick-actions a {
  display: grid;
  grid-template-columns: 17px minmax(0, 1fr) 15px;
  align-items: center;
  gap: 8px;
  min-height: 39px;
  padding: 0 9px;
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
  width: 15px;
  height: 15px;
}

@media (max-width: 1180px) {
  .project-logs-toolbar {
    flex-wrap: wrap;
  }

  .project-log-search {
    order: 3;
    flex-basis: 100%;
  }
}

@media (max-width: 980px) {
  .project-logs-layout {
    grid-template-columns: 1fr;
  }

  .project-logs-sidebar {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .project-logs-toolbar {
    align-items: stretch;
  }

  .project-log-view-switch,
  .project-log-filter,
  .project-log-toolbar-actions {
    flex: 1 1 auto;
  }

  .project-log-toolbar-actions {
    justify-content: flex-end;
  }

  .project-log-toolbar-actions button span {
    display: none;
  }

  .project-log-terminal-header {
    align-items: flex-start;
    flex-direction: column;
    padding: 9px 12px;
  }

  .project-log-terminal-header > div:last-child {
    flex-wrap: wrap;
  }

  .project-log-content {
    min-height: 360px;
    max-height: 66vh;
    padding: 9px;
  }

  .rails-request-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .rails-request-duration {
    text-align: left;
  }

  .rails-request-heading {
    width: 100%;
  }

  .project-logs-sidebar {
    grid-template-columns: 1fr;
  }
}
</style>
