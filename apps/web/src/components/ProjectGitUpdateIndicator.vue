<script setup lang="ts">
import { ArrowPathIcon } from '@heroicons/vue/24/outline';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';

import type {
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

import { fetchProjectGit } from '../api';
import {
  fetchProjectGitRemote,
  fetchProjectGitWorkspace,
} from '../api/git-workspace';
import { getProjectGitUpdateIndicator } from '../utils/project-git-update-indicator';

const props = defineProps<{
  projectId: string;
  overview: ProjectGitOverview | null;
}>();

const workspace = ref<ProjectGitWorkspace | null>(null);
const refreshedOverview = ref<ProjectGitOverview | null>(null);
let generation = 0;
let lastRemoteRefreshAt = 0;

const effectiveOverview = computed(
  () => refreshedOverview.value ?? props.overview,
);
const indicator = computed(() =>
  getProjectGitUpdateIndicator(effectiveOverview.value, workspace.value),
);

async function loadState(refreshRemotes: boolean): Promise<void> {
  const requestedProjectId = props.projectId;
  const requestGeneration = ++generation;

  try {
    let nextWorkspace = await fetchProjectGitWorkspace(requestedProjectId);

    if (refreshRemotes) {
      lastRemoteRefreshAt = Date.now();
      const remotes = nextWorkspace.remotes
        .filter(
          (remote) => remote.name === 'origin' || remote.name === 'upstream',
        )
        .map((remote) => remote.name);

      if (remotes.length > 0) {
        const results = await Promise.allSettled(
          remotes.map((remote) =>
            fetchProjectGitRemote(requestedProjectId, remote),
          ),
        );

        if (results.some((result) => result.status === 'fulfilled')) {
          nextWorkspace = await fetchProjectGitWorkspace(requestedProjectId);
        }
      }
    }

    const nextOverview = await fetchProjectGit(requestedProjectId);
    if (
      requestGeneration !== generation ||
      props.projectId !== requestedProjectId
    ) {
      return;
    }

    workspace.value = nextWorkspace;
    refreshedOverview.value = nextOverview;
  } catch {
    if (requestGeneration === generation) {
      refreshedOverview.value = props.overview;
    }
  }
}

function refreshRemotesIfStale(): void {
  if (document.visibilityState === 'hidden') return;
  if (Date.now() - lastRemoteRefreshAt < 60_000) return;
  void loadState(true);
}

watch(
  () =>
    [
      props.projectId,
      props.overview?.branch,
      props.overview?.latestCommit?.hash,
      props.overview?.ahead,
      props.overview?.behind,
    ] as const,
  ([projectId], previous) => {
    const projectChanged = previous?.[0] !== projectId;
    refreshedOverview.value = props.overview;

    if (projectChanged) {
      workspace.value = null;
      lastRemoteRefreshAt = 0;
    }

    void loadState(projectChanged);
  },
  { immediate: true },
);

onMounted(() => {
  window.addEventListener('focus', refreshRemotesIfStale);
  document.addEventListener('visibilitychange', refreshRemotesIfStale);
});

onBeforeUnmount(() => {
  generation += 1;
  window.removeEventListener('focus', refreshRemotesIfStale);
  document.removeEventListener('visibilitychange', refreshRemotesIfStale);
});
</script>

<template>
  <RouterLink
    v-if="indicator"
    class="project-git-update-indicator"
    :to="{
      name: 'project-git',
      params: { projectId },
      query: { tab: 'sync' },
    }"
    :title="indicator.title"
    :aria-label="`${indicator.title} Abrir sincronização do Git.`"
  >
    <ArrowPathIcon aria-hidden="true" />
    <span>{{ indicator.label }}</span>
  </RouterLink>
</template>

<style scoped>
.project-git-update-indicator {
  display: inline-flex;
  min-width: 0;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: 1px solid color-mix(in srgb, var(--warning-text) 34%, var(--border));
  border-radius: 999px;
  color: var(--warning-text);
  background: color-mix(in srgb, var(--warning-text) 9%, var(--surface-1));
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  line-height: 1.2;
  text-decoration: none;
  white-space: nowrap;
  transition:
    border-color 150ms ease,
    background 150ms ease,
    color 150ms ease;
}

.project-git-update-indicator:hover {
  border-color: color-mix(in srgb, var(--warning-text) 55%, var(--border));
  background: color-mix(in srgb, var(--warning-text) 14%, var(--surface-1));
}

.project-git-update-indicator:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.project-git-update-indicator svg {
  width: 13px;
  height: 13px;
  flex: 0 0 auto;
}
</style>
