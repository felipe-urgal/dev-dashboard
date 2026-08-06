<script setup lang="ts">
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
} from '@heroicons/vue/24/outline';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import type {
  Activity,
  ActivityList,
  ActivityOrigin,
  ActivityStatus,
  ActivitySummary,
  Workspace,
} from '@dev-dashboard/contracts';

import {
  ApiRequestError,
  fetchActivities,
  fetchProjects,
  fetchWorkspaces,
  type ActivityQuery,
} from '../api';
import LoadingSkeleton from '../components/LoadingSkeleton.vue';
import StatusBadge from '../components/StatusBadge.vue';
import { useAutoDismiss } from '../composables/useAutoDismiss';
import {
  activityDetailPath,
  formatInstant,
  originLabel,
  statusLabel,
} from '../utils/activity-format';
import { formatDuration } from '../utils/process-format';
import { RequestGeneration } from '../utils/request-generation';
import { activityToneFor } from '../utils/status-tones';

interface ProjectOption {
  id: string;
  name: string;
  workspaceId?: string;
}

interface ActivityGroup {
  key: string;
  label: string;
  items: Activity[];
}

const EMPTY_SUMMARY: ActivitySummary = {
  running: 0,
  succeeded: 0,
  failed: 0,
  total: 0,
};

const workspaces = ref<Workspace[]>([]);
const projects = ref<ProjectOption[]>([]);
const items = ref<Activity[]>([]);
const summary = ref<ActivitySummary>({ ...EMPTY_SUMMARY });
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const totalPages = ref(0);

const workspaceFilter = ref('');
const projectFilter = ref('');
const originFilter = ref<'' | ActivityOrigin>('');
const statusFilter = ref<'' | ActivityStatus>('');
const searchInput = ref('');
const searchFilter = ref('');

const loading = ref(false);
const referenceErrorMessage = ref('');
const activityErrorMessage = ref('');
const lastUpdatedAt = ref('');
const now = ref(Date.now());

useAutoDismiss(referenceErrorMessage, '');
useAutoDismiss(activityErrorMessage, '');

const generation = new RequestGeneration();
let controller: AbortController | undefined;
let clockInterval: ReturnType<typeof setInterval> | undefined;
let searchTimer: ReturnType<typeof setTimeout> | undefined;

const eligibleProjects = computed(() =>
  workspaceFilter.value
    ? projects.value.filter(
        (project) => project.workspaceId === workspaceFilter.value,
      )
    : projects.value,
);

const projectNameById = computed(() => {
  const map = new Map<string, string>();
  for (const project of projects.value) {
    map.set(project.id, project.name);
  }
  return map;
});

const projectWorkspaceById = computed(() => {
  const map = new Map<string, string>();
  for (const project of projects.value) {
    if (project.workspaceId) {
      map.set(project.id, project.workspaceId);
    }
  }
  return map;
});

const workspaceNameById = computed(() => {
  const map = new Map<string, string>();
  for (const workspace of workspaces.value) {
    map.set(workspace.id, workspace.name);
  }
  return map;
});

const hasItems = computed(() => items.value.length > 0);

const hasActiveFilters = computed(() =>
  Boolean(
    workspaceFilter.value ||
    projectFilter.value ||
    originFilter.value ||
    statusFilter.value ||
    searchFilter.value,
  ),
);

const visibleStart = computed(() =>
  total.value === 0 ? 0 : (page.value - 1) * pageSize.value + 1,
);

const visibleEnd = computed(() =>
  Math.min(page.value * pageSize.value, total.value),
);

const activityGroups = computed<ActivityGroup[]>(() => {
  const groups = new Map<string, Activity[]>();
  for (const activity of items.value) {
    const key = activityDateKey(activity.startedAt);
    const group = groups.get(key);
    if (group) {
      group.push(activity);
    } else {
      groups.set(key, [activity]);
    }
  }

  return [...groups.entries()].map(([key, groupedItems]) => ({
    key,
    label: activityDateLabel(groupedItems[0]?.startedAt ?? key),
    items: groupedItems,
  }));
});

function activityDateKey(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function activityDateLabel(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;

  const today = new Date();
  const isToday =
    activityDateKey(parsed.toISOString()) ===
    activityDateKey(today.toISOString());
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
  }).format(parsed);
  return isToday ? `Hoje, ${formatted}` : formatted;
}

function formatActivityTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function activityDuration(activity: Activity): string {
  const finishedAt = activity.finishedAt
    ? new Date(activity.finishedAt).getTime()
    : now.value;
  return formatDuration(
    activity.startedAt,
    Number.isNaN(finishedAt) ? now.value : finishedAt,
  );
}

function projectNameFor(activity: Activity): string {
  return projectNameById.value.get(activity.projectId) ?? activity.projectId;
}

function workspaceNameFor(activity: Activity): string {
  const workspaceId =
    activity.workspaceId ?? projectWorkspaceById.value.get(activity.projectId);
  if (!workspaceId) return 'Workspace não informado';
  return workspaceNameById.value.get(workspaceId) ?? workspaceId;
}

function originClass(origin: ActivityOrigin): string {
  return `activity-origin-${origin}`;
}

function timelineClass(status: ActivityStatus): string {
  return `activity-timeline-${status}`;
}

async function loadReferenceData(): Promise<void> {
  try {
    const [loadedWorkspaces, loadedProjects] = await Promise.all([
      fetchWorkspaces(),
      fetchProjects(),
    ]);
    workspaces.value = loadedWorkspaces;
    projects.value = loadedProjects.map((project) => ({
      id: project.id,
      name: project.name,
      ...(project.workspaceId ? { workspaceId: project.workspaceId } : {}),
    }));
    referenceErrorMessage.value = '';
  } catch (error) {
    referenceErrorMessage.value =
      error instanceof ApiRequestError
        ? error.message
        : 'Não foi possível carregar workspaces e projetos.';
  }
}

async function loadActivities(): Promise<void> {
  controller?.abort();
  controller = new AbortController();
  const token = generation.invalidate();
  loading.value = true;
  activityErrorMessage.value = '';

  const query: ActivityQuery = {
    page: page.value,
    pageSize: pageSize.value,
    signal: controller.signal,
  };
  if (workspaceFilter.value) query.workspaceId = workspaceFilter.value;
  if (projectFilter.value) query.projectId = projectFilter.value;
  if (originFilter.value) query.origin = originFilter.value;
  if (statusFilter.value) query.status = statusFilter.value;
  if (searchFilter.value) query.search = searchFilter.value;

  try {
    const result: ActivityList = await fetchActivities(query);
    if (!generation.isCurrent(token)) return;
    items.value = result.items;
    summary.value = result.summary;
    total.value = result.total;
    totalPages.value = result.totalPages;
    page.value = result.page;
    pageSize.value = result.pageSize;
    lastUpdatedAt.value = new Date().toISOString();
  } catch (error) {
    if (controller?.signal.aborted) return;
    if (!generation.isCurrent(token)) return;
    activityErrorMessage.value =
      error instanceof ApiRequestError
        ? error.message
        : 'Não foi possível carregar as atividades.';
    items.value = [];
    summary.value = { ...EMPTY_SUMMARY };
    total.value = 0;
    totalPages.value = 0;
  } finally {
    if (generation.isCurrent(token)) {
      loading.value = false;
    }
  }
}

function resetToFirstPage(): void {
  page.value = 1;
  void loadActivities();
}

function goToPage(next: number): void {
  if (next < 1 || (totalPages.value > 0 && next > totalPages.value)) {
    return;
  }
  page.value = next;
  void loadActivities();
}

function clearFilters(): void {
  if (searchTimer) clearTimeout(searchTimer);
  searchInput.value = '';
  searchFilter.value = '';
  workspaceFilter.value = '';
  projectFilter.value = '';
  originFilter.value = '';
  statusFilter.value = '';
}

watch(workspaceFilter, () => {
  if (projectFilter.value) {
    const stillEligible = eligibleProjects.value.some(
      (project) => project.id === projectFilter.value,
    );
    if (!stillEligible) projectFilter.value = '';
  }
});

watch(searchInput, (value) => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const normalized = value.trim();
    if (normalized !== searchFilter.value) {
      searchFilter.value = normalized;
    }
  }, 300);
});

watch(
  [workspaceFilter, projectFilter, originFilter, statusFilter, searchFilter],
  () => {
    resetToFirstPage();
  },
);

onMounted(async () => {
  await loadReferenceData();
  await loadActivities();
  clockInterval = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onBeforeUnmount(() => {
  controller?.abort();
  if (clockInterval) clearInterval(clockInterval);
  if (searchTimer) clearTimeout(searchTimer);
});
</script>

<template src="./ActivityView.template.html"></template>
