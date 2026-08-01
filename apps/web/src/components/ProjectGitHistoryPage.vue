<script setup lang="ts">
import {
  ArrowPathIcon,
  Bars3BottomLeftIcon,
  ClipboardDocumentIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  ViewColumnsIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';
import {
  computed,
  onBeforeUnmount,
  reactive,
  ref,
  watch,
} from 'vue';

import type {
  GitCommitDetailFile,
  GitCommitDetails,
  GitCommitFileDiff,
  GitCommitHistoryEntry,
  GitCommitHistoryKind,
  GitCommitHistoryPage,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

import type { ProjectGitHistoryScope } from '../api';
import {
  fetchProjectGitCommitDetail,
  fetchProjectGitCommitFileDiff,
  fetchProjectGitCommits,
} from '../api';
import { fetchProjectGitWorkspace } from '../api/git-workspace';
import { gitFileToneFor } from '../utils/status-tones';
import GitFileDiffView from './GitFileDiffView.vue';
import StatusBadge from './StatusBadge.vue';

import { useProjectGitHistoryPage } from '../composables/useProjectGitHistoryPage';

const props = defineProps<{
  projectId: string;
}>();

const {
  PAGE_SIZE,
  VIEW_MODE_KEY,
  LIST_WIDTH_KEY,
  DEFAULT_LIST_WIDTH,
  MIN_LIST_WIDTH,
  MAX_LIST_WIDTH,
  RESIZE_KEYBOARD_STEP,
  history,
  workspace,
  reference,
  search,
  author,
  kind,
  scope,
  page,
  loading,
  errorMessage,
  detail,
  detailLoading,
  detailError,
  selectedHash,
  fileStates,
  selectedFilePath,
  viewMode,
  copiedHash,
  listWidth,
  resizingList,
  diffLayoutEl,
  historyController,
  detailController,
  copyTimer,
  statusLabels,
  scopeOptions,
  kindOptions,
  clampListWidth,
  readStoredListWidth,
  persistListWidth,
  startListResize,
  handleResizeKeydown,
  readStoredViewMode,
  selectViewMode,
  branchGroups,
  authorOptions,
  commitBody,
  totalPages,
  pageWindow,
  rangeLabel,
  commitDays,
  formatTime,
  formatFullDate,
  relativeTime,
  fileName,
  directoryName,
  authorInitials,
  loadWorkspace,
  loadHistory,
  openCommit,
  closeCommit,
  loadFileDiff,
  selectedFile,
  selectFile,
  copyHash,
  goToPage,
  applyFilters,
  handleKeydown,
} = useProjectGitHistoryPage(props);
</script>

<template src="./ProjectGitHistoryPage.template.html"></template>

<style scoped src="./ProjectGitHistoryPage.css"></style>
<style src="./ProjectGitHistoryModal.css"></style>
