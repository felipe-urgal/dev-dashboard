<script setup lang="ts">
import {
  computed,
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

import type { Project } from '@dev-dashboard/contracts';

import { useAutoDismiss } from '../composables/useAutoDismiss';
import { useProjectLogsPolling } from '../composables/useProjectLogsPolling';
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

const logContainer = ref<HTMLElement | null>(null);
const searchQuery = ref('');
const categoryFilter = ref<CategoryFilter>('all');
const viewMode = ref<ViewMode>(props.project.type === 'rails' ? 'requests' : 'raw');
const copiedRequestId = ref('');

const {
  loadingLogs,
  logSnapshot,
  logErrorMessage,
  followLogs,
  streamPaused,
  refreshLogs,
  scrollLogsToBottom,
  handleLogScroll,
  clearLogView,
  toggleStream,
} = useProjectLogsPolling(
  () => props.project,
  hasManagedProcess,
  supportsServer,
  logContainer,
);

useAutoDismiss(processErrorMessage, '');
useAutoDismiss(logErrorMessage, '');
useAutoDismiss(copiedRequestId, '');

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

function resetFilters(): void {
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
    resetFilters();
  },
  { immediate: true },
);

watch(viewMode, () => {
  void scrollLogsToBottom();
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

<style scoped src="./ProjectLogsPanel.css"></style>
