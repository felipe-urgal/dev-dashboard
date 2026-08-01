<script setup lang="ts">
import {
  computed,
  ref,
  watch,
} from 'vue';

import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ClipboardDocumentIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  PauseIcon,
  PlayIcon,
  ServerStackIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline';

import { RouterLink } from 'vue-router';

import type { Project } from '@dev-dashboard/contracts';

import RailsParamsTree from './RailsParamsTree.vue';
import { useAutoDismiss } from '../composables/useAutoDismiss';
import { useProjectLogsPolling } from '../composables/useProjectLogsPolling';
import { useProjectProcessStatus } from '../composables/useProjectProcessStatus';
import { explainSql } from '../sql-explanation/describe';
import type {
  RailsLogGroup,
  RailsLogLine,
  RailsRequestLogGroup,
} from '../utils/rails-log-parser';
import {
  parseRailsLog,
  railsRequestStatusTone,
} from '../utils/rails-log-parser';
import { parseRubyInspect } from '../utils/ruby-inspect-parser';
import {
  groupSqlLines,
  highlightSqlHtml,
} from '../utils/sql-highlight';

type ViewMode = 'requests' | 'raw';
type CategoryFilter = 'all' | 'requests' | 'sql' | 'render' | 'errors';

// A large first log (boot chatter, N previous requests) can be thousands of lines —
// rendering every one of them as DOM nodes at once is what used to freeze the tab.
// Both the request list and the raw feed render only a capped, most-recent window,
// with an explicit "load older" action to pull in more.
const REQUEST_LIST_PAGE_SIZE = 150;
const RAW_LINE_PAGE_SIZE = 1500;

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
const selectedGroupKey = ref('');
const requestListLimit = ref(REQUEST_LIST_PAGE_SIZE);
const rawLineLimit = ref(RAW_LINE_PAGE_SIZE);

const {
  loadingLogs,
  logSnapshot,
  logErrorMessage,
  followLogs,
  streamPaused,
  refreshLogs,
  scrollLogsToLatest,
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

// The parser emits groups in file order (oldest first); the inspector reads newest-first.
const orderedGroups = computed<RailsLogGroup[]>(() => [...parsedLog.value.groups].reverse());

function groupSelectionKey(group: RailsLogGroup): string {
  return group.kind === 'request' ? group.requestId : group.id;
}

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

  return orderedGroups.value.filter((group) => {
    const matchesSearch = !query || group.searchableText.includes(query);
    return matchesSearch && groupMatchesCategory(group);
  });
});

const cappedGroups = computed(() => visibleGroups.value.slice(0, requestListLimit.value));
const hiddenGroupsCount = computed(() =>
  Math.max(0, visibleGroups.value.length - cappedGroups.value.length),
);

const orderedRawLines = computed<RailsLogLine[]>(() =>
  orderedGroups.value.flatMap((group) => group.lines),
);

const visibleRawLines = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();

  return orderedRawLines.value.filter((line) => {
    const matchesSearch = !query || line.text.toLowerCase().includes(query);
    return matchesSearch && lineMatchesCategory(line);
  });
});

const cappedRawLines = computed(() => visibleRawLines.value.slice(0, rawLineLimit.value));
const hiddenRawLinesCount = computed(() =>
  Math.max(0, visibleRawLines.value.length - cappedRawLines.value.length),
);

const visibleLineCount = computed(() =>
  viewMode.value === 'requests'
    ? visibleGroups.value.reduce((total, group) => total + group.lines.length, 0)
    : visibleRawLines.value.length,
);

const selectedGroup = computed<RailsLogGroup | undefined>(
  () =>
    cappedGroups.value.find((group) => groupSelectionKey(group) === selectedGroupKey.value) ??
    cappedGroups.value[0],
);

const selectedRequestGroup = computed<RailsRequestLogGroup | undefined>(() =>
  selectedGroup.value?.kind === 'request' ? selectedGroup.value : undefined,
);

const selectedSqlGroups = computed(() => {
  if (!selectedRequestGroup.value) return [];

  return groupSqlLines(selectedRequestGroup.value.sqlLines).map((group) => ({
    ...group,
    explanation: explainSql(group.pattern),
  }));
});

const selectedN1Group = computed(() => selectedSqlGroups.value.find((group) => group.n1Suspect));

const selectedParams = computed(() => {
  const raw = selectedRequestGroup.value?.parameters;
  if (!raw) return undefined;
  return parseRubyInspect(raw);
});

function selectGroup(group: RailsLogGroup): void {
  selectedGroupKey.value = groupSelectionKey(group);
}

function loadMoreRequests(): void {
  requestListLimit.value += REQUEST_LIST_PAGE_SIZE;
}

function loadMoreRawLines(): void {
  rawLineLimit.value += RAW_LINE_PAGE_SIZE;
}

function highlightedSql(text: string): string {
  return highlightSqlHtml(text);
}

function resetFilters(): void {
  searchQuery.value = '';
  categoryFilter.value = 'all';
  viewMode.value = props.project.type === 'rails' ? 'requests' : 'raw';
  selectedGroupKey.value = '';
  requestListLimit.value = REQUEST_LIST_PAGE_SIZE;
  rawLineLimit.value = RAW_LINE_PAGE_SIZE;
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
  void scrollLogsToLatest();
});

// Keep the selection valid (and the list highlight in sync) as polling replaces the
// group set every couple seconds, or as filters change which groups are visible.
watch(cappedGroups, (groups) => {
  if (!groups.some((group) => groupSelectionKey(group) === selectedGroupKey.value)) {
    selectedGroupKey.value = groups[0] ? groupSelectionKey(groups[0]) : '';
  }
});
</script>

<template>
  <div class="project-logs-layout">
    <section class="project-logs-topbar">
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

      <dl class="project-log-status-metrics">
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

      <nav class="project-log-quick-actions" aria-label="Ações rápidas">
        <span>Ações rápidas</span>
        <div>
          <RouterLink
            :to="{
              name: 'project-server',
              params: { projectId: project.id },
            }"
          >
            <ServerStackIcon aria-hidden="true" />
            Ir para Servidor
          </RouterLink>
          <a
            v-if="processUrls[0]"
            :href="processUrls[0]"
            target="_blank"
            rel="noopener noreferrer"
          >
            <ArrowTopRightOnSquareIcon aria-hidden="true" />
            Abrir localhost
          </a>
        </div>
      </nav>
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
            <span>Mais recente no topo</span>
            <span>{{ followLogs ? 'Auto scroll' : 'Rolagem pausada' }}</span>
          </div>
        </header>

        <div class="project-log-content">
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

          <div v-else-if="viewMode === 'requests'" class="rails-inspector">
            <div
              ref="logContainer"
              class="rails-inspector-list"
              tabindex="0"
              @scroll="handleLogScroll"
            >
              <button
                v-for="group in cappedGroups"
                :key="groupSelectionKey(group)"
                type="button"
                class="rails-list-item"
                :class="{
                  selected: groupSelectionKey(group) === selectedGroupKey,
                  'list-item-slow':
                    group.kind === 'request' && (group.durationMs ?? 0) >= 500,
                  'list-item-error':
                    group.kind === 'request' && (group.status ?? 0) >= 400,
                }"
                @click="selectGroup(group)"
              >
                <template v-if="group.kind === 'request'">
                  <div class="rails-list-row1">
                    <span class="rails-method" :class="methodTone(group.method)">
                      {{ group.method ?? 'REQ' }}
                    </span>
                    <span
                      v-if="group.status"
                      class="rails-status"
                      :class="`rails-status-${railsRequestStatusTone(group.status)}`"
                    >
                      {{ group.status }}
                    </span>
                  </div>
                  <div class="rails-list-path">{{ group.path ?? 'Requisição Rails' }}</div>
                  <div class="rails-list-row2">
                    <span>{{ formatDuration(group.durationMs) }}</span>
                    <span v-if="group.startedAt">{{ group.startedAt }}</span>
                  </div>
                </template>

                <template v-else>
                  <div class="rails-list-row1">
                    <span class="rails-list-system-tag">Sistema</span>
                  </div>
                  <div class="rails-list-path">{{ group.lines[0]?.text || '—' }}</div>
                </template>
              </button>

              <button
                v-if="hiddenGroupsCount > 0"
                type="button"
                class="rails-load-more"
                @click="loadMoreRequests"
              >
                Carregar mais antigas ({{ hiddenGroupsCount }} ocultas)
              </button>
            </div>

            <div class="rails-inspector-detail">
              <template v-if="selectedRequestGroup">
                <header class="rails-detail-header">
                  <div class="rails-detail-heading">
                    <span
                      class="rails-method"
                      :class="methodTone(selectedRequestGroup.method)"
                    >
                      {{ selectedRequestGroup.method ?? 'REQ' }}
                    </span>
                    <span
                      v-if="selectedRequestGroup.status"
                      class="rails-status"
                      :class="`rails-status-${railsRequestStatusTone(selectedRequestGroup.status)}`"
                    >
                      {{ selectedRequestGroup.status }}
                    </span>
                    <h3>{{ selectedRequestGroup.path ?? 'Requisição Rails' }}</h3>
                  </div>
                  <div class="rails-detail-sub">
                    <span v-if="selectedRequestGroup.controller">
                      {{ selectedRequestGroup.controller }}#{{ selectedRequestGroup.action }}
                    </span>
                    <span v-if="selectedRequestGroup.format">{{ selectedRequestGroup.format }}</span>
                    <button
                      type="button"
                      :title="
                        copiedRequestId === selectedRequestGroup.requestId
                          ? 'Copiado'
                          : 'Copiar request ID'
                      "
                      @click="copyRequestId(selectedRequestGroup.requestId)"
                    >
                      <ClipboardDocumentIcon aria-hidden="true" />
                      {{ selectedRequestGroup.requestId.slice(0, 8) }}
                    </button>
                  </div>
                </header>

                <dl class="rails-detail-stats">
                  <div>
                    <dt>Duração</dt>
                    <dd :class="{ 'stat-slow': (selectedRequestGroup.durationMs ?? 0) >= 500 }">
                      {{ formatDuration(selectedRequestGroup.durationMs) }}
                    </dd>
                  </div>
                  <div>
                    <dt>Queries</dt>
                    <dd :class="{ 'stat-warn': selectedN1Group }">
                      {{ selectedRequestGroup.queryCount ?? 0 }}
                      <template v-if="selectedRequestGroup.cachedQueries">
                        · {{ selectedRequestGroup.cachedQueries }} cache
                      </template>
                    </dd>
                  </div>
                  <div>
                    <dt>SQL</dt>
                    <dd>{{ formatDuration(selectedRequestGroup.activeRecordDurationMs) }}</dd>
                  </div>
                  <div>
                    <dt>Views</dt>
                    <dd>{{ formatDuration(selectedRequestGroup.viewDurationMs) }}</dd>
                  </div>
                  <div>
                    <dt>GC</dt>
                    <dd>{{ formatDuration(selectedRequestGroup.gcDurationMs) }}</dd>
                  </div>
                </dl>

                <div v-if="selectedN1Group" class="rails-n1-callout" role="status">
                  <ExclamationTriangleIcon aria-hidden="true" />
                  <div>
                    <strong>N+1 provável.</strong>
                    Essa consulta rodou
                    <strong>{{ selectedN1Group.count }}×</strong>
                    nesta requisição
                    <template v-if="selectedN1Group.label">
                      ({{ selectedN1Group.label }})
                    </template>
                    · {{ formatDuration(selectedN1Group.totalMs) }} no total — considere
                    eager loading (<code>includes</code>) na origem.
                  </div>
                </div>

                <div v-if="selectedRequestGroup.errorLines.length" class="rails-detail-section">
                  <span class="rails-detail-section-title">Erro</span>
                  <pre class="rails-detail-pre rails-detail-error">{{
                    selectedRequestGroup.errorLines.map((line) => line.text).join('\n')
                  }}</pre>
                </div>

                <div v-if="selectedSqlGroups.length" class="rails-detail-section">
                  <span class="rails-detail-section-title">
                    SQL agrupado por padrão · {{ selectedRequestGroup.sqlLines.length }} execuções
                  </span>
                  <div class="sql-block">
                    <div
                      v-for="sqlGroup in selectedSqlGroups"
                      :key="(sqlGroup.label ?? '') + sqlGroup.pattern"
                      class="sql-row-wrap"
                    >
                      <div
                        class="sql-row"
                        :class="{ 'sql-row-hot': sqlGroup.n1Suspect }"
                      >
                        <span class="sql-count" :class="{ hot: sqlGroup.n1Suspect }">
                          ×{{ sqlGroup.count }}
                        </span>
                        <span class="sql-text" v-html="highlightedSql(sqlGroup.pattern)" />
                        <span class="sql-time" :class="{ hot: sqlGroup.n1Suspect }">
                          {{ formatDuration(sqlGroup.avgMs) }} cada · {{ formatDuration(sqlGroup.totalMs) }}
                        </span>
                      </div>
                      <details class="sql-explain">
                        <summary>
                          <span>Entender esta consulta</span>
                          <span class="sql-explain-hint">explicação em português</span>
                        </summary>
                        <div class="sql-explain-body">
                          <p>{{ sqlGroup.explanation.description }}</p>
                          <div class="sql-explain-return">
                            <strong>Retorno esperado</strong>
                            <span>{{ sqlGroup.explanation.expectedReturn }}</span>
                          </div>
                          <div
                            v-if="sqlGroup.explanation.mainTable || sqlGroup.explanation.relatedTables.length"
                            class="sql-explain-tables"
                          >
                            <span>Tabelas envolvidas</span>
                            <code
                              v-for="table in [
                                sqlGroup.explanation.mainTable,
                                ...sqlGroup.explanation.relatedTables,
                              ].filter((value, index, all) => value && all.indexOf(value) === index)"
                              :key="table"
                            >{{ table }}</code>
                          </div>
                        </div>
                      </details>
                    </div>
                  </div>
                </div>

                <div v-if="selectedRequestGroup.renderLines.length" class="rails-detail-section">
                  <span class="rails-detail-section-title">
                    Renderização · {{ selectedRequestGroup.renderLines.length }} etapas
                  </span>
                  <pre class="rails-detail-pre">{{
                    selectedRequestGroup.renderLines.map((line) => line.text).join('\n')
                  }}</pre>
                </div>

                <div v-if="selectedParams !== undefined" class="rails-detail-section">
                  <span class="rails-detail-section-title">Parâmetros</span>
                  <RailsParamsTree :value="selectedParams" />
                </div>
                <div v-else-if="selectedRequestGroup.parameters" class="rails-detail-section">
                  <span class="rails-detail-section-title">Parâmetros</span>
                  <pre class="rails-detail-pre">{{ selectedRequestGroup.parameters }}</pre>
                </div>

                <div v-if="selectedRequestGroup.otherLines.length" class="rails-detail-section">
                  <span class="rails-detail-section-title">
                    Outras linhas · {{ selectedRequestGroup.otherLines.length }}
                  </span>
                  <pre class="rails-detail-pre">{{
                    selectedRequestGroup.otherLines.map((line) => line.text || ' ').join('\n')
                  }}</pre>
                </div>
              </template>

              <template v-else-if="selectedGroup">
                <span class="rails-detail-section-title">Sistema</span>
                <div class="rails-system-group">
                  <code
                    v-for="line in selectedGroup.lines"
                    :key="line.id"
                    :class="rawLineClass(line)"
                  >{{ line.text || ' ' }}</code>
                </div>
              </template>

              <div v-else class="rails-detail-empty">
                Selecione uma requisição na lista à esquerda.
              </div>
            </div>
          </div>

          <div
            v-else
            ref="logContainer"
            class="project-log-raw-wrap"
            tabindex="0"
            @scroll="handleLogScroll"
          >
            <code class="project-log-raw-lines">
              <span
                v-for="line in cappedRawLines"
                :key="line.id"
                class="project-log-line"
                :class="rawLineClass(line)"
              >{{ line.text || ' ' }}</span>
            </code>

            <button
              v-if="hiddenRawLinesCount > 0"
              type="button"
              class="rails-load-more"
              @click="loadMoreRawLines"
            >
              Carregar linhas mais antigas ({{ hiddenRawLinesCount }} ocultas)
            </button>
          </div>
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
              scrollLogsToLatest();
            "
          >
            Ir para o mais recente
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

  </div>
</template>

<style scoped src="./ProjectLogsPanel.css"></style>
