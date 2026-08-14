<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ClipboardDocumentIcon,
  EllipsisVerticalIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  PauseIcon,
  PlayIcon,
  TrashIcon,
  XCircleIcon,
} from '@heroicons/vue/24/outline';

import type { Project } from '@dev-dashboard/contracts';

import RailsParamsTree from './RailsParamsTree.vue';
import ProjectLogTerminal from './ProjectLogTerminal.vue';
import { useAutoDismiss } from '../composables/useAutoDismiss';
import { useProjectLogsPolling } from '../composables/useProjectLogsPolling';
import { useProjectProcessStatus } from '../composables/useProjectProcessStatus';
import { explainSql } from '../sql-explanation/describe';
import { exportLogSnapshot } from '../utils/log-export';
import type {
  RailsLogGroup,
  RailsRequestLogGroup,
} from '../utils/rails-log-parser';
import {
  parseRailsLog,
  railsRequestStatusTone,
} from '../utils/rails-log-parser';
import { parseRubyInspect } from '../utils/ruby-inspect-parser';
import { groupSqlLines, highlightSqlHtml } from '../utils/sql-highlight';
import './ProjectLogsExperience.css';

type ViewMode = 'flow' | 'diagnostic';
type CategoryFilter = 'all' | 'requests' | 'sql' | 'render' | 'errors';
type DiagnosticKind = 'error' | 'slow' | 'n1' | 'repeated-sql';

interface ServerDiagnosticIssue {
  id: string;
  kind: DiagnosticKind;
  tone: 'danger' | 'warning' | 'info';
  title: string;
  summary: string;
  groupKey: string;
  durationMs?: number | undefined;
  count?: number;
}

const EVENT_PAGE_SIZE = 500;

const props = defineProps<{ project: Project }>();

const {
  managedProcess,
  loadingStatus,
  errorMessage: processErrorMessage,
  supportsServer,
  processStatus,
  hasManagedProcess,
} = useProjectProcessStatus(() => props.project);

const logContainer = ref<HTMLElement | null>(null);
const searchQuery = ref('');
const categoryFilter = ref<CategoryFilter>('all');
const viewMode = ref<ViewMode>('flow');
const copiedRequestId = ref('');
const selectedGroupKey = ref('');
const selectedIssueId = ref('');
const eventLimit = ref(EVENT_PAGE_SIZE);

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

const parsedLog = computed(() =>
  parseRailsLog(logSnapshot.value?.content ?? ''),
);
const hasStructuredRequests = computed(() =>
  parsedLog.value.groups.some((group) => group.kind === 'request'),
);
const useGenericExperience = computed(
  () => props.project.type !== 'rails' || !hasStructuredRequests.value,
);

const orderedGroups = computed<RailsLogGroup[]>(() =>
  [...parsedLog.value.groups].reverse(),
);

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
        : group.lines.some(
            (line) => line.kind === 'error' || line.kind === 'warning',
          );
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

const flowGroups = computed(() => [...visibleGroups.value].reverse());
const cappedFlowGroups = computed(() =>
  flowGroups.value.slice(
    Math.max(0, flowGroups.value.length - eventLimit.value),
  ),
);
const hiddenFlowGroupCount = computed(() =>
  Math.max(0, flowGroups.value.length - cappedFlowGroups.value.length),
);

const selectedGroup = computed<RailsLogGroup | undefined>(() =>
  visibleGroups.value.find(
    (group) => groupSelectionKey(group) === selectedGroupKey.value,
  ),
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
const selectedN1Group = computed(() =>
  selectedSqlGroups.value.find((group) => group.n1Suspect),
);
const selectedParams = computed(() => {
  const raw = selectedRequestGroup.value?.parameters;
  if (!raw) return undefined;
  return parseRubyInspect(raw);
});

const diagnosticIssues = computed<ServerDiagnosticIssue[]>(() => {
  const issues: ServerDiagnosticIssue[] = [];

  for (const group of visibleGroups.value) {
    if (group.kind !== 'request') continue;
    const groupKey = groupSelectionKey(group);
    const route = `${group.method ?? 'REQ'} ${group.path ?? 'Requisição Rails'}`;

    if (group.errorLines.length || (group.status ?? 0) >= 500) {
      issues.push({
        id: `error:${groupKey}`,
        kind: 'error',
        tone: 'danger',
        title: route,
        summary:
          group.errorLines[0]?.text ??
          `A requisição terminou com status ${group.status ?? 'de erro'}.`,
        groupKey,
        durationMs: group.durationMs,
      });
    }

    if ((group.durationMs ?? 0) >= 1_000) {
      issues.push({
        id: `slow:${groupKey}`,
        kind: 'slow',
        tone: 'warning',
        title: route,
        summary: `Request lenta · ${formatDuration(group.durationMs)} · ${group.queryCount ?? 0} queries`,
        groupKey,
        durationMs: group.durationMs,
      });
    }

    for (const sqlGroup of groupSqlLines(group.sqlLines)) {
      if (sqlGroup.n1Suspect) {
        issues.push({
          id: `n1:${groupKey}:${sqlGroup.pattern}`,
          kind: 'n1',
          tone: 'warning',
          title: route,
          summary: `${sqlGroup.label ?? 'Consulta'} executada ${sqlGroup.count}× · possível N+1`,
          groupKey,
          count: sqlGroup.count,
          durationMs: sqlGroup.totalMs,
        });
      } else if (sqlGroup.count >= 3) {
        issues.push({
          id: `sql:${groupKey}:${sqlGroup.pattern}`,
          kind: 'repeated-sql',
          tone: 'info',
          title: route,
          summary: `${sqlGroup.label ?? 'Consulta semelhante'} executada ${sqlGroup.count}×`,
          groupKey,
          count: sqlGroup.count,
          durationMs: sqlGroup.totalMs,
        });
      }
    }
  }

  return issues;
});

const selectedIssue = computed(
  () =>
    diagnosticIssues.value.find(
      (issue) => issue.id === selectedIssueId.value,
    ) ?? diagnosticIssues.value[0],
);

const diagnosticSummary = computed(() => ({
  errors: diagnosticIssues.value.filter((issue) => issue.kind === 'error')
    .length,
  slow: diagnosticIssues.value.filter((issue) => issue.kind === 'slow').length,
  n1: diagnosticIssues.value.filter((issue) => issue.kind === 'n1').length,
  repeated: diagnosticIssues.value.filter(
    (issue) => issue.kind === 'repeated-sql',
  ).length,
}));

const visibleEventCount = computed(() =>
  viewMode.value === 'diagnostic'
    ? diagnosticIssues.value.length
    : flowGroups.value.length,
);
const streamUpdateLabel = computed(() => {
  if (loadingLogs.value) return 'Atualizando logs...';
  if (streamPaused.value) return 'Atualização automática pausada';
  return 'Acompanhando novas linhas a cada 2 segundos';
});

function selectIssue(issue: ServerDiagnosticIssue): void {
  selectedIssueId.value = issue.id;
  selectedGroupKey.value = issue.groupKey;
}

function loadMoreEvents(): void {
  eventLimit.value += EVENT_PAGE_SIZE;
}

function highlightedSql(text: string): string {
  return highlightSqlHtml(text);
}

function resetFilters(): void {
  searchQuery.value = '';
  categoryFilter.value = 'all';
  viewMode.value = 'flow';
  selectedGroupKey.value = '';
  selectedIssueId.value = '';
  eventLimit.value = EVENT_PAGE_SIZE;
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

function formatLogTime(value: string | undefined): string {
  if (!value) return '—';
  return value.match(/\b\d{2}:\d{2}:\d{2}\b/)?.[0] ?? value;
}

function toggleFlowGroup(group: RailsLogGroup): void {
  if (group.kind !== 'request') return;
  const key = groupSelectionKey(group);
  selectedGroupKey.value = selectedGroupKey.value === key ? '' : key;
}

function issueLabel(kind: DiagnosticKind): string {
  if (kind === 'error') return 'ERRO';
  if (kind === 'slow') return 'LENTA';
  if (kind === 'n1') return 'N+1';
  return 'SQL REPETIDA';
}

function handleExportLog(): void {
  const snapshot = logSnapshot.value;
  if (!snapshot) return;
  exportLogSnapshot({
    projectName: props.project.name,
    origin: 'servidor',
    identifier: snapshot.processId,
    capturedAt: snapshot.readAt,
    snapshot,
  });
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
  () => resetFilters(),
  { immediate: true },
);

watch(viewMode, () => {
  if (viewMode.value === 'flow') {
    followLogs.value = true;
    void scrollLogsToLatest();
    return;
  }

  if (selectedIssue.value) {
    selectIssue(selectedIssue.value);
  }
});

watch(visibleGroups, (groups) => {
  if (
    selectedGroupKey.value &&
    !groups.some((group) => groupSelectionKey(group) === selectedGroupKey.value)
  ) {
    selectedGroupKey.value = '';
  }
});

watch(diagnosticIssues, (issues) => {
  if (
    viewMode.value === 'diagnostic' &&
    !issues.some((issue) => issue.id === selectedIssueId.value)
  ) {
    selectedIssueId.value = issues[0]?.id ?? '';
  }
});

watch(selectedIssue, (issue) => {
  if (issue && viewMode.value === 'diagnostic') {
    selectedGroupKey.value = issue.groupKey;
  }
});
</script>

<template src="./ProjectLogsPanel.template.html"></template>

<style scoped src="./ProjectLogsPanel.css"></style>
