<script setup lang="ts">
import {
  ArrowPathIcon,
  Bars3BottomLeftIcon,
  DocumentTextIcon,
  FunnelIcon,
  ViewColumnsIcon,
} from '@heroicons/vue/24/outline';
import ProjectGitDiffFileCard from './ProjectGitDiffFileCard.vue';

import { useProjectGitDiffPage } from '../composables/useProjectGitDiffPage';

const props = defineProps<{
  projectId: string;
}>();

const {
  CONTEXT_EXPANSION_STEP,
  snapshot,
  entries,
  statusFilter,
  viewMode,
  loadingSnapshot,
  snapshotError,
  copiedPath,
  statusLabels,
  statusOptions,
  branchLabel,
  visibleEntries,
  hasSingleChangedFile,
  totalAdditions,
  totalDeletions,
  viewedCount,
  viewedPercent,
  allCollapsed,
  fileName,
  directoryName,
  linePrefix,
  statBlocks,
  highlighted,
  hunkLines,
  splitRowsFor,
  canExpandAbove,
  canExpandBelow,
  expandContext,
  registerCard,
  toggleCollapsed,
  toggleAll,
  toggleViewed,
  selectViewMode,
  copyPath,
} = useProjectGitDiffPage(props);
</script>

<template src="./ProjectGitDiffPage.template.html"></template>

<style src="./ProjectGitDiffPage.css"></style>
<style src="./ProjectGitDiffImagePreview.css"></style>
