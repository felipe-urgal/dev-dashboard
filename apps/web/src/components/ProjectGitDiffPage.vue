<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ArrowPathIcon, DocumentTextIcon } from '@heroicons/vue/24/outline';

import type { GitDiffScope } from '@dev-dashboard/contracts';

import { useProjectGitDiffPage } from '../composables/useProjectGitDiffPage';
import GitDiffFileList from './git-diff/GitDiffFileList.vue';
import GitDiffToolbar from './git-diff/GitDiffToolbar.vue';
import ProjectGitDiffFileCard from './ProjectGitDiffFileCard.vue';

const props = defineProps<{
  projectId: string;
}>();

const {
  CONTEXT_EXPANSION_STEP,
  snapshot,
  entries,
  scope,
  statusFilter,
  fileQuery,
  activePath,
  viewMode,
  loadingSnapshot,
  snapshotError,
  copiedPath,
  statusLabels,
  branchLabel,
  emptyMessage,
  visibleEntries,
  fileGroups,
  statusChips,
  hasSingleChangedFile,
  totalAdditions,
  totalDeletions,
  viewedCount,
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
  refresh,
  selectScope,
  retryFileDiff,
  toggleCollapsed,
  toggleAll,
  focusFile,
  reviewAndAdvance,
  moveActive,
  toggleActiveViewed,
  selectViewMode,
  copyPath,
} = useProjectGitDiffPage(props);

const wrapLines = ref(false);

const scopeModel = computed<GitDiffScope>({
  get: () => scope.value,
  set: (value) => void selectScope(value),
});

const viewModeModel = computed<'unified' | 'split'>({
  get: () => viewMode.value,
  set: (value) => selectViewMode(value),
});

/** Com mais de um arquivo há lista lateral e atalhos de teclado. */
const showList = computed(() => !hasSingleChangedFile.value);

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
  );
}

function handleKeydown(event: KeyboardEvent): void {
  if (!showList.value || event.ctrlKey || event.metaKey || event.altKey) return;
  if (isTypingTarget(event.target)) return;

  const key = event.key.toLowerCase();
  if (key === 'j') moveActive(1);
  else if (key === 'k') moveActive(-1);
  else if (key === 'r') toggleActiveViewed();
  else return;
  event.preventDefault();
}

onMounted(() => window.addEventListener('keydown', handleKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown));
</script>

<template>
  <section class="git-diff-page">
    <div v-if="snapshotError" class="project-error" role="alert">
      {{ snapshotError }}
    </div>

    <GitDiffToolbar
      v-if="snapshot || loadingSnapshot"
      v-model:scope="scopeModel"
      v-model:view-mode="viewModeModel"
      v-model:wrap="wrapLines"
      :has-entries="entries.length > 0"
      :all-collapsed="allCollapsed"
      :loading="loadingSnapshot"
      :branch-label="branchLabel"
      :total-additions="totalAdditions"
      :total-deletions="totalDeletions"
      :show-shortcuts="showList"
      @toggle-all="toggleAll"
      @refresh="refresh"
    />

    <div v-if="loadingSnapshot && !snapshot" class="git-diff-empty">
      <ArrowPathIcon class="spinning" aria-hidden="true" />
      <strong>Carregando alterações</strong>
      <span>Consultando arquivos staged e o working tree.</span>
    </div>

    <div v-else-if="snapshot && entries.length === 0" class="git-diff-empty">
      <DocumentTextIcon aria-hidden="true" />
      <strong>Nenhuma alteração para revisar</strong>
      <span>{{ emptyMessage }}</span>
    </div>

    <div
      v-else-if="snapshot"
      class="git-diff-layout"
      :class="{ 'is-single': !showList }"
    >
      <GitDiffFileList
        v-if="showList"
        v-model:query="fileQuery"
        v-model:status="statusFilter"
        :groups="fileGroups"
        :active-path="activePath"
        :viewed-count="viewedCount"
        :total="entries.length"
        :statuses="statusChips"
        @select="focusFile"
      />

      <div class="git-diff-file-stack" :class="{ 'is-wrap': wrapLines }">
        <article
          v-for="entry in visibleEntries"
          :key="entry.file.path"
          :ref="
            (element) =>
              registerCard(element as Element | null, entry.file.path)
          "
          class="git-diff-file-card"
          :class="{
            'is-collapsed': entry.collapsed,
            'is-active': showList && entry.file.path === activePath,
          }"
          :data-git-diff-path="entry.file.path"
        >
          <ProjectGitDiffFileCard
            :entry="entry"
            :view-mode="viewMode"
            :copied-path="copiedPath"
            :context-expansion-step="CONTEXT_EXPANSION_STEP"
            :status-labels="statusLabels"
            :file-name="fileName"
            :directory-name="directoryName"
            :stat-blocks="statBlocks"
            :line-prefix="linePrefix"
            :highlighted="highlighted"
            :hunk-lines="hunkLines"
            :split-rows-for="splitRowsFor"
            :can-expand-above="canExpandAbove"
            :can-expand-below="canExpandBelow"
            @toggle-collapsed="toggleCollapsed(entry)"
            @copy="copyPath(entry)"
            @toggle-viewed="reviewAndAdvance(entry, $event)"
            @expand-context="
              expandContext(entry, $event.state, $event.direction)
            "
            @retry="retryFileDiff(entry)"
          />
        </article>
        <p v-if="visibleEntries.length === 0" class="git-diff-empty">
          Nenhum arquivo corresponde ao filtro.
        </p>
      </div>
    </div>
  </section>
</template>

<style src="./ProjectGitDiffPage.css"></style>
<style src="./ProjectGitDiffImagePreview.css"></style>
<style scoped>
.git-diff-layout {
  display: grid;
  grid-template-columns: 310px minmax(0, 1fr);
  align-items: start;
  gap: 16px;
}

.git-diff-layout.is-single {
  grid-template-columns: minmax(0, 1fr);
}

@media (max-width: 900px) {
  .git-diff-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
