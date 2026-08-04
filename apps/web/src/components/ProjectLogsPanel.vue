<script setup lang="ts">
import {
  computed,
  ref,
  watch,
} from 'vue';

import {
  ArrowDownTrayIcon,
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

<template src="./ProjectLogsPanel.template.html"></template>

<style scoped src="./ProjectLogsPanel.css"></style>
