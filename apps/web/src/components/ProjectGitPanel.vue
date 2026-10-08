<script setup lang="ts">
import { inject, onBeforeUnmount, ref, watch } from 'vue';
import { routeLocationKey } from 'vue-router';

import type {
  GitSyncProgressEvent,
  Project,
  ProjectGitOverview,
} from '@dev-dashboard/contracts';
import ProjectGitBranchesPage from './ProjectGitBranchesPage.vue';
import ProjectGitCommitPage from './ProjectGitCommitPage.vue';
import ProjectGitDiffPage from './ProjectGitDiffPage.vue';
import ProjectGitHistoryPage from './ProjectGitHistoryPage.vue';
import ProjectGitIssuesPage from './ProjectGitIssuesPage.vue';
import ProjectGitPullRequestPage from './ProjectGitPullRequestPage.vue';
import ProjectGitSyncPage from './ProjectGitSyncPage.vue';
import ProjectGitSubtabs from './ProjectGitSubtabs.vue';
import ProjectGitUndoPage from './ProjectGitUndoPage.vue';
import StatusBadge from './StatusBadge.vue';

import {
  fetchProjectGitMutationHistory,
  followProjectGitSyncProgress,
} from '../api/git-workspace';
import { useProjectGitPanelPolicy } from '../composables/useProjectGitPanelPolicy';

const props = defineProps<{ project: Project }>();
const route = inject(routeLocationKey, undefined);

const emit = defineEmits<{
  'git-updated': [overview: ProjectGitOverview];
}>();

const {
  tabs,
  activeTab,
  overview,
  workspace,
  loading,
  loadingWorkspace,
  remoteRefreshRunning,
  remoteRefreshErrorMessage,
  syncOperation,
  errorMessage,
  workspaceErrorMessage,
  mutationRunning,
  branchOperation,
  mutationMessage,
  mutationErrorMessage,
  createBranchName,
  commitMessage,
  commitMode,
  amendedBranch,
  pendingPushBranch,
  squashCommitCount,
  generation,
  formatDate,
  openTab,
  tabFromQuery,
  loadGit,
  loadWorkspace,
  configuredRemoteNames,
  refreshRemotesSilently,
  reloadGitData,
  runMutation,
  runRenameBranch,
  runDeleteBranch,
  runPublishBranch,
  runSquashBranch,
  runForcePushWithLease,
  runRefreshRemotes,
  runTrackRemoteBranch,
  runDeleteRemoteBranch,
  runUpdateCurrentBranch,
  runMainSynchronization,
  currentBranchOrHead,
  runCommit,
} = useProjectGitPanelPolicy(props, route, emit);

const lastMainSynchronizationAt = ref<string | null>(null);
const lastMainSynchronizationMessage = ref('');
const lastMainSynchronizationError = ref('');
const synchronizationProgress = ref<GitSyncProgressEvent[]>([]);

let syncProgressClose: (() => void) | undefined;
let activeSyncRunId: string | null = null;
let historyGeneration = 0;

function acceptSynchronizationProgress(event: GitSyncProgressEvent): void {
  if (
    event.stepId === 'operation' &&
    event.status === 'running' &&
    event.runId !== activeSyncRunId
  ) {
    activeSyncRunId = event.runId;
    synchronizationProgress.value = [];
  }

  if (!activeSyncRunId) activeSyncRunId = event.runId;
  if (event.runId !== activeSyncRunId) return;

  const index = synchronizationProgress.value.findIndex(
    (current) =>
      current.runId === event.runId && current.stepId === event.stepId,
  );
  if (index >= 0) {
    synchronizationProgress.value[index] = event;
  } else {
    synchronizationProgress.value.push(event);
  }

  if (synchronizationProgress.value.length > 50) {
    synchronizationProgress.value = synchronizationProgress.value.slice(-50);
  }
}

function startSynchronizationProgress(): void {
  syncProgressClose?.();
  const stream = followProjectGitSyncProgress(
    props.project.id,
    acceptSynchronizationProgress,
  );
  syncProgressClose = stream.close;
  void stream.done.catch(() => undefined);
}

async function loadLastMainSynchronization(): Promise<void> {
  const requestGeneration = ++historyGeneration;
  const projectId = props.project.id;

  try {
    const history = await fetchProjectGitMutationHistory(projectId, 1, 100);
    if (
      requestGeneration !== historyGeneration ||
      projectId !== props.project.id
    ) {
      return;
    }
    const latest = history.events.find(
      (event) =>
        event.operationId === 'sync-main' && event.result === 'succeeded',
    );
    lastMainSynchronizationAt.value = latest?.occurredAt ?? null;
  } catch {
    if (requestGeneration === historyGeneration) {
      lastMainSynchronizationAt.value = null;
    }
  }
}

async function handleMainSynchronization(): Promise<void> {
  const previousMessage = lastMainSynchronizationMessage.value;
  const previousError = lastMainSynchronizationError.value;
  const previousProgress = [...synchronizationProgress.value];
  const previousRunId = activeSyncRunId;

  clearMainSynchronizationConsole();
  const outcome = await runMainSynchronization();
  if (outcome === 'cancelled') {
    lastMainSynchronizationMessage.value = previousMessage;
    lastMainSynchronizationError.value = previousError;
    synchronizationProgress.value = previousProgress;
    activeSyncRunId = previousRunId;
    return;
  }

  lastMainSynchronizationMessage.value = mutationMessage.value;
  lastMainSynchronizationError.value = mutationErrorMessage.value;
  if (outcome === 'succeeded') {
    await loadLastMainSynchronization();
  }
}

async function handleCurrentBranchUpdate(): Promise<void> {
  const previousMessage = lastMainSynchronizationMessage.value;
  const previousError = lastMainSynchronizationError.value;
  const previousProgress = [...synchronizationProgress.value];
  const previousRunId = activeSyncRunId;

  clearMainSynchronizationConsole();
  const outcome = await runUpdateCurrentBranch();
  if (outcome === 'cancelled') {
    lastMainSynchronizationMessage.value = previousMessage;
    lastMainSynchronizationError.value = previousError;
    synchronizationProgress.value = previousProgress;
    activeSyncRunId = previousRunId;
    return;
  }

  lastMainSynchronizationMessage.value = mutationMessage.value;
  lastMainSynchronizationError.value = mutationErrorMessage.value;
}

function clearMainSynchronizationConsole(): void {
  lastMainSynchronizationMessage.value = '';
  lastMainSynchronizationError.value = '';
  synchronizationProgress.value = [];
  activeSyncRunId = null;
}

watch(
  () => props.project.id,
  () => {
    historyGeneration += 1;
    clearMainSynchronizationConsole();
    lastMainSynchronizationAt.value = null;
    startSynchronizationProgress();
    void loadLastMainSynchronization();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  historyGeneration += 1;
  syncProgressClose?.();
});
</script>

<template src="./ProjectGitPanel.template.html"></template>

<style scoped src="./ProjectGitPanel.css"></style>
