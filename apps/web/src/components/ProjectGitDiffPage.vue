<script setup lang="ts">
import {
  ArrowPathIcon,
  Bars3BottomLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClipboardDocumentIcon,
  DocumentTextIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  ViewColumnsIcon,
} from '@heroicons/vue/24/outline';
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';

import type {
  GitDiffFile,
  GitDiffScope,
  GitDiffSnapshot,
  GitFileDiff,
  GitFileStatus,
  ProjectGitOverview,
} from '@dev-dashboard/contracts';

import {
  fetchProjectGit,
  fetchProjectGitDiff,
  fetchProjectGitFileDiff,
  fetchProjectGitFileLines,
} from '../api';
import type { GitDiffHunk, GitUnifiedDiffLine } from '../utils/git-diff-view';
import {
  annotateGitDiffWordChanges,
  buildGitDiffContextLines,
  buildSplitGitDiffRows,
  countGitDiffMatches,
  parseUnifiedGitDiff,
  renderGitDiffLineHtml,
  splitGitDiffHunks,
} from '../utils/git-diff-view';
import { gitFileToneFor } from '../utils/status-tones';
import StatusBadge from './StatusBadge.vue';

import { useProjectGitDiffPage } from '../composables/useProjectGitDiffPage';

const props = defineProps<{
  projectId: string;
}>();

const {
  VIEW_MODE_KEY,
  CONTEXT_EXPANSION_STEP,
  MAX_PARALLEL_FILE_DIFFS,
  scope,
  syntaxModule,
  loadSyntaxModule,
  snapshot,
  overview,
  entries,
  fileSearch,
  diffSearch,
  statusFilter,
  viewMode,
  loadingSnapshot,
  snapshotError,
  copiedPath,
  cardElements,
  pendingLoads,
  snapshotController,
  fileControllers,
  observer,
  copyTimer,
  statusLabels,
  statusOptions,
  readStoredViewMode,
  persistViewMode,
  branchLabel,
  visibleEntries,
  hasSingleChangedFile,
  totalAdditions,
  totalDeletions,
  viewedCount,
  viewedPercent,
  allCollapsed,
  diffMatchCount,
  fileName,
  directoryName,
  linePrefix,
  statBlocks,
  highlighted,
  withSyntax,
  detectionSample,
  hunkLines,
  splitRowsFor,
  nextExpansionAbove,
  nextExpansionBelow,
  canExpandAbove,
  canExpandBelow,
  expandContext,
  buildEntry,
  loadFileDiff,
  requestFileDiff,
  drainPendingLoads,
  registerCard,
  setupObserver,
  loadOverview,
  loadSnapshot,
  refresh,
  toggleCollapsed,
  toggleAll,
  toggleViewed,
  selectViewMode,
  copyPath,
} = useProjectGitDiffPage(props);
</script>

<template src="./ProjectGitDiffPage.template.html"></template>

<style scoped src="./ProjectGitDiffPage.css"></style>
