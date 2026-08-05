<script setup lang="ts">
import { inject } from 'vue';
import { routeLocationKey } from 'vue-router';

import type {
  Project,
  ProjectGitOverview,
} from '@dev-dashboard/contracts';
import ProjectGitBranchesPage from './ProjectGitBranchesPage.vue';
import ProjectGitCommitPage from './ProjectGitCommitPage.vue';
import ProjectGitDiffPage from './ProjectGitDiffPage.vue';
import ProjectGitHistoryPage from './ProjectGitHistoryPage.vue';
import ProjectGitMutationHistoryPage from './ProjectGitMutationHistoryPage.vue';
import ProjectGitPullRequestPage from './ProjectGitPullRequestPage.vue';
import ProjectGitSyncPage from './ProjectGitSyncPage.vue';
import ProjectGitUndoPage from './ProjectGitUndoPage.vue';
import StatusBadge from './StatusBadge.vue';

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
  errorMessage,
  workspaceErrorMessage,
  mutationRunning,
  mutationMessage,
  mutationErrorMessage,
  createBranchName,
  commitMessage,
  commitMode,
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
  runRefreshRemotes,
  runTrackRemoteBranch,
  runDeleteRemoteBranch,
  runMainSynchronization,
  currentBranchOrHead,
  runCommit,
} = useProjectGitPanelPolicy(props, route, emit);
</script>

<template src="./ProjectGitPanel.template.html"></template>

<style scoped src="./ProjectGitPanel.css"></style>
