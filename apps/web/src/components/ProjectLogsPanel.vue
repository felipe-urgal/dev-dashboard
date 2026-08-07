<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ClipboardDocumentIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  PauseIcon,
  PlayIcon,
  TrashIcon,
  XCircleIcon,
} from '@heroicons/vue/24/outline';

import type { Project } from '@dev-dashboard/contracts';

import RailsParamsTree from './RailsParamsTree.vue';
import ProjectLogExperience from './ProjectLogExperience.vue';
import { useAutoDismiss } from '../composables/useAutoDismiss';
import { useProjectLogsPolling } from '../composables/useProjectLogsPolling';
import { useProjectProcessStatus } from '../composables/useProjectProcessStatus';
import { explainSql } from '../sql-explanation/describe';
import { exportLogSnapshot } from '../utils/log-export';
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
import { groupSqlLines, highlightSqlHtml } from '../utils/sql-highlight';

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
  durationMs?: number;
  count?: number;
}

const REQUEST_LIST_PAGE_SIZE = 150;
const RAW_LINE_PAGE_SIZE = 1500;

const props = defineProps<{ project: Project }>();

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
const viewMode = ref<ViewMode>('flow');
const copiedRequestId = ref('');
const selectedGroupKey = ref('');
const selectedIssueId = ref('');
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

const parsedLog = computed(() => parseRailsLog(logSnapshot.value?.content ?? ''));
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

const cappedGroups = computed(() =>
  visibleGroups.value.slice(0, requestListLimit.value),
);
const hiddenGroupsCount = computed(() =>
  Math.max(0, visibleGroups.value.length - cappedGroups.value.length),
);

// Fluxo é cronológico, como um terminal: a linha mais recente fica no final.
const flowRawLines = computed<RailsLogLine[]>(() => parsedLog.value.lines);
const visibleRawLines = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return flowRawLines.value.filter((line) => {
    const matchesSearch = !query || line.text.toLowerCase().includes(query);
    return matchesSearch && lineMatchesCategory(line);
  });
});
const cappedRawLines = computed(() =>
  visibleRawLines.value.slice(Math.max(0, visibleRawLines.value.length - rawLineLimit.value)),
);
const hiddenRawLinesCount = computed(() =>
  Math.max(0, visibleRawLines.value.length - cappedRawLines.value.length),
);

const selectedGroup = computed<RailsLogGroup | undefined>(
  () =>
    cappedGroups.value.find(
      (group) => groupSelectionKey(group) === selectedGroupKey.value,
    ) ?? cappedGroups.value[0],
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
    diagnosticIssues.value.find((issue) => issue.id === selectedIssueId.value) ??
    diagnosticIssues.value[0],
);

const diagnosticSummary = computed(() => ({
  errors: diagnosticIssues.value.filter((issue) => issue.kind === 'error').length,
  slow: diagnosticIssues.value.filter((issue) => issue.kind === 'slow').length,
  n1: diagnosticIssues.value.filter((issue) => issue.kind === 'n1').length,
  repeated: diagnosticIssues.value.filter((issue) => issue.kind === 'repeated-sql').length,
}));

const visibleLineCount = computed(() =>
  viewMode.value === 'diagnostic'
    ? visibleGroups.value.reduce((total, group) => total + group.lines.length, 0)
    : visibleRawLines.value.length,
);

function selectGroup(group: RailsLogGroup): void {
  selectedGroupKey.value = groupSelectionKey(group);
}

function selectIssue(issue: ServerDiagnosticIssue): void {
  selectedIssueId.value = issue.id;
  selectedGroupKey.value = issue.groupKey;
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
  viewMode.value = 'flow';
  selectedGroupKey.value = '';
  selectedIssueId.value = '';
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
  }
});

watch(cappedGroups, (groups) => {
  if (!groups.some((group) => groupSelectionKey(group) === selectedGroupKey.value)) {
    selectedGroupKey.value = groups[0] ? groupSelectionKey(groups[0]) : '';
  }
});

watch(diagnosticIssues, (issues) => {
  if (!issues.some((issue) => issue.id === selectedIssueId.value)) {
    selectedIssueId.value = issues[0]?.id ?? '';
  }
});
</script>

<template src="./ProjectLogsPanel.template.html"></template>

<style scoped src="./ProjectLogsPanel.css"></style>
