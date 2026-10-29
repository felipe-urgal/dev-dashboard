<script setup lang="ts">
import {
  ArrowPathIcon,
  Bars3BottomLeftIcon,
  ClipboardDocumentIcon,
  DocumentTextIcon,
  ViewColumnsIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';
import { onBeforeUnmount, watch } from 'vue';

import { gitFileToneFor } from '../utils/status-tones';
import { useProjectGitHistoryPage } from '../composables/useProjectGitHistoryPage';
import GitFileDiffView from './GitFileDiffView.vue';
import GitPdfDiffPreview from './GitPdfDiffPreview.vue';
import ProjectGitHistoryRow from './ProjectGitHistoryRow.vue';
import StatusBadge from './StatusBadge.vue';
import UiButton from './ui/UiButton.vue';
import UiSearchField from './ui/UiSearchField.vue';
import UiTag from './ui/UiTag.vue';

const props = defineProps<{
  projectId: string;
}>();

const {
  history,
  reference,
  search,
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
  modalDialog,
  statusLabels,
  scopeOptions,
  kindOptions,
  selectViewMode,
  branchGroups,
  referenceInWorkspace,
  commitBody,
  totalPages,
  rangeLabel,
  commitDays,
  formatTime,
  formatFullDate,
  relativeTime,
  fileName,
  directoryName,
  authorInitials,
  loadHistory,
  openCommit,
  closeCommit,
  selectedFile,
  selectFile,
  retrySelectedFile,
  retryCommitDetail,
  copyHash,
  goToPage,
  applyFilters,
  handleModalKeydown,
} = useProjectGitHistoryPage(props);

/** A busca roda sozinha, sem exigir Enter. */
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(search, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applyFilters, 300);
});
onBeforeUnmount(() => clearTimeout(searchTimer));

function setScope(value: typeof scope.value): void {
  if (scope.value === value) return;
  scope.value = value;
  applyFilters();
}

function setKind(value: typeof kind.value): void {
  if (kind.value === value) return;
  kind.value = value;
  applyFilters();
}
</script>

<template>
  <section class="git-hist-page">
    <div class="git-hist-toolbar">
      <UiSearchField
        v-model="search"
        label="Buscar commits"
        placeholder="Buscar por mensagem ou hash"
      />

      <select
        v-model="reference"
        class="git-hist-select"
        aria-label="Referência do histórico"
        @change="applyFilters"
      >
        <option v-if="reference && !referenceInWorkspace" :value="reference">
          {{ reference }}
        </option>
        <optgroup
          v-for="group in branchGroups"
          :key="group.label"
          :label="group.label"
        >
          <option
            v-for="branch in group.items"
            :key="branch.name"
            :value="branch.name"
          >
            {{ branch.current ? `✓ ${branch.name}` : branch.name }}
          </option>
        </optgroup>
        <option v-if="branchGroups.length === 0" :value="reference">
          {{ reference || 'HEAD' }}
        </option>
      </select>

      <div class="git-hist-segmented" role="group" aria-label="Escopo">
        <button
          v-for="option in scopeOptions"
          :key="option.value"
          type="button"
          :aria-pressed="scope === option.value"
          @click="setScope(option.value)"
        >
          {{ option.label }}
        </button>
      </div>

      <div class="git-hist-segmented" role="group" aria-label="Tipo de commit">
        <button
          v-for="option in kindOptions"
          :key="option.value"
          type="button"
          :aria-pressed="kind === option.value"
          @click="setKind(option.value)"
        >
          {{ option.label }}
        </button>
      </div>

      <span class="git-hist-spacer" />

      <UiButton
        icon
        variant="ghost"
        aria-label="Atualizar histórico"
        title="Atualizar"
        :disabled="loading"
        @click="loadHistory()"
      >
        <ArrowPathIcon :class="{ spinning: loading }" aria-hidden="true" />
      </UiButton>
    </div>

    <p v-if="errorMessage" class="project-error" role="alert">
      {{ errorMessage }}
    </p>

    <div v-if="loading && !history" class="git-hist-note">
      <ArrowPathIcon class="spinning" aria-hidden="true" />
      Carregando commits…
    </div>

    <div v-else-if="(history?.commits.length ?? 0) === 0" class="git-hist-note">
      <DocumentTextIcon aria-hidden="true" />
      <strong>Nenhum commit encontrado</strong>
      <span>Ajuste a referência ou os filtros aplicados.</span>
    </div>

    <template v-else>
      <section v-for="day in commitDays" :key="day.key" class="git-hist-day">
        <header>
          <span class="git-hist-day-label">{{ day.label }}</span>
          <span>
            {{ day.commits.length }}
            commit{{ day.commits.length === 1 ? '' : 's' }}
          </span>
        </header>
        <ProjectGitHistoryRow
          v-for="commit in day.commits"
          :key="commit.hash"
          :commit="commit"
          :active="selectedHash === commit.hash"
          :format-time="formatTime"
          :format-full-date="formatFullDate"
          :relative-time="relativeTime"
          :author-initials="authorInitials"
          @open="openCommit(commit)"
        />
      </section>

      <nav class="git-hist-pagination" aria-label="Paginação do histórico">
        <span>{{ rangeLabel }}</span>
        <span class="git-hist-spacer" />
        <UiButton :disabled="page <= 1 || loading" @click="goToPage(page - 1)">
          Anterior
        </UiButton>
        <span>Página {{ page }} de {{ totalPages }}</span>
        <UiButton
          :disabled="page >= totalPages || loading"
          @click="goToPage(page + 1)"
        >
          Próxima
        </UiButton>
      </nav>
    </template>

    <Teleport to="body">
      <div
        v-if="selectedHash"
        class="git-hist-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="Detalhes do commit"
        @click.self="closeCommit()"
        @keydown="handleModalKeydown"
      >
        <article
          ref="modalDialog"
          class="git-hist-modal"
          aria-labelledby="git-hist-modal-title"
        >
          <header class="git-hist-modal-head">
            <div class="git-hist-modal-title">
              <div class="git-hist-modal-hash">
                <code>{{ detail?.shortHash ?? selectedHash.slice(0, 7) }}</code>
                <UiButton
                  icon
                  variant="ghost"
                  size="sm"
                  :title="
                    copiedHash === (detail?.hash ?? selectedHash)
                      ? 'Hash copiado'
                      : 'Copiar hash'
                  "
                  :aria-label="`Copiar hash ${detail?.shortHash ?? selectedHash.slice(0, 7)}`"
                  @click="copyHash(detail?.hash ?? selectedHash)"
                >
                  <ClipboardDocumentIcon aria-hidden="true" />
                </UiButton>
                <UiTag v-if="copiedHash === (detail?.hash ?? selectedHash)">
                  copiado
                </UiTag>
              </div>
              <h3 id="git-hist-modal-title">
                {{ detail?.subject ?? 'Carregando commit…' }}
              </h3>
              <p v-if="detail">
                {{ detail.authorName }} ·
                {{ formatFullDate(detail.authoredAt) }}
              </p>
            </div>

            <UiButton
              icon
              variant="ghost"
              aria-label="Fechar detalhes"
              data-history-modal-autofocus
              @click="closeCommit()"
            >
              <XMarkIcon aria-hidden="true" />
            </UiButton>
          </header>

          <div class="git-hist-modal-body">
            <div v-if="detailError" class="git-hist-note" role="alert">
              <p class="project-error">{{ detailError }}</p>
              <UiButton @click="retryCommitDetail">Tentar novamente</UiButton>
            </div>

            <div v-else-if="detailLoading" class="git-hist-note">
              <ArrowPathIcon class="spinning" aria-hidden="true" />
              Carregando detalhes…
            </div>

            <template v-else-if="detail">
              <details v-if="commitBody" class="git-hist-description">
                <summary>Exibir descrição</summary>
                <pre>{{ commitBody }}</pre>
              </details>

              <p v-if="detail.masked" class="git-hist-notice">
                {{ detail.redactionCount }} possível(is) segredo(s) foram
                mascarados.
              </p>

              <header class="git-hist-files-head">
                <strong>Arquivos alterados ({{ detail.files.length }})</strong>
                <span class="git-hist-delta">
                  <b class="is-addition">+{{ detail.additions }}</b>
                  <b class="is-deletion">−{{ detail.deletions }}</b>
                </span>
                <span class="git-hist-spacer" />
                <div
                  class="git-hist-segmented"
                  role="group"
                  aria-label="Modo de visualização"
                >
                  <button
                    type="button"
                    :aria-pressed="viewMode === 'unified'"
                    @click="selectViewMode('unified')"
                  >
                    <Bars3BottomLeftIcon aria-hidden="true" />
                    Unificado
                  </button>
                  <button
                    type="button"
                    :aria-pressed="viewMode === 'split'"
                    @click="selectViewMode('split')"
                  >
                    <ViewColumnsIcon aria-hidden="true" />
                    Lado a lado
                  </button>
                </div>
              </header>

              <p v-if="detail.files.length === 0" class="git-hist-note">
                Este commit não alterou arquivos.
              </p>

              <div v-else class="git-hist-diff-layout">
                <nav class="git-hist-files" aria-label="Arquivos do commit">
                  <button
                    v-for="state in fileStates"
                    :key="state.file.path"
                    type="button"
                    :data-active="
                      state.file.path === selectedFilePath || undefined
                    "
                    :aria-current="
                      state.file.path === selectedFilePath ? 'true' : undefined
                    "
                    @click="selectFile(state.file.path)"
                  >
                    <span class="git-hist-file-name" :title="state.file.path">
                      {{ fileName(state.file.path) }}
                    </span>
                    <span class="git-hist-file-dir">{{
                      directoryName(state.file.path)
                    }}</span>
                    <span v-if="state.file.binary" class="git-hist-file-counts"
                      >binário</span
                    >
                    <span v-else class="git-hist-file-counts git-hist-delta">
                      <b class="is-addition">+{{ state.file.additions }}</b>
                      <b class="is-deletion">−{{ state.file.deletions }}</b>
                    </span>
                  </button>
                </nav>

                <section v-if="selectedFile" class="git-hist-diff">
                  <header>
                    <span
                      class="git-hist-file-path"
                      :title="selectedFile.file.path"
                    >
                      {{ selectedFile.file.path }}
                      <small v-if="selectedFile.file.previousPath">
                        de {{ selectedFile.file.previousPath }}
                      </small>
                    </span>
                    <StatusBadge
                      :tone="gitFileToneFor(selectedFile.file.status)"
                    >
                      {{ statusLabels[selectedFile.file.status] }}
                    </StatusBadge>
                  </header>

                  <div class="git-hist-diff-body">
                    <div
                      v-if="selectedFile.error"
                      class="git-hist-note"
                      role="alert"
                    >
                      <p class="project-error">{{ selectedFile.error }}</p>
                      <UiButton @click="retrySelectedFile">
                        Tentar novamente
                      </UiButton>
                    </div>

                    <div v-else-if="selectedFile.loading" class="git-hist-note">
                      <ArrowPathIcon class="spinning" aria-hidden="true" />
                      Carregando diff…
                    </div>

                    <GitPdfDiffPreview
                      v-else-if="selectedFile.diff?.pdfPreview"
                      :preview="selectedFile.diff.pdfPreview"
                      :path="selectedFile.file.path"
                    />

                    <p
                      v-else-if="selectedFile.diff?.binary"
                      class="git-hist-note"
                    >
                      Diff binário não disponível.
                    </p>

                    <template v-else-if="selectedFile.diff">
                      <p
                        v-if="selectedFile.diff.masked"
                        class="git-hist-notice"
                      >
                        {{ selectedFile.diff.redactionCount }} possível(is)
                        segredo(s) foram mascarados neste arquivo.
                      </p>
                      <p
                        v-if="selectedFile.diff.truncated"
                        class="git-hist-notice"
                      >
                        O diff foi truncado para manter a interface responsiva.
                      </p>
                      <GitFileDiffView
                        :content="selectedFile.diff.content"
                        :path="selectedFile.file.path"
                        :view-mode="viewMode"
                      />
                    </template>
                  </div>
                </section>
              </div>
            </template>
          </div>
        </article>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.git-hist-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.git-hist-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.git-hist-toolbar :deep(.ui-search) {
  width: 300px;
  max-width: 100%;
}

.git-hist-select {
  height: 34px;
  max-width: 260px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  color: var(--text);
  background: var(--surface-0);
  font: inherit;
  font-size: 13px;
}

.git-hist-select:focus {
  border-color: var(--accent);
  outline: none;
}

.git-hist-segmented {
  display: inline-flex;
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
}

.git-hist-segmented button {
  display: inline-flex;
  height: 32px;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border: 0;
  color: var(--text-muted);
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.git-hist-segmented button + button {
  border-left: 1px solid var(--border-strong);
}

.git-hist-segmented button[aria-pressed='true'] {
  color: var(--accent);
  background: var(--accent-soft);
}

.git-hist-segmented svg {
  width: 14px;
  height: 14px;
}

.git-hist-spacer {
  flex: 1 1 0;
}

.git-hist-note {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 28px 24px;
  border: 1px solid var(--border);
  border-radius: 14px;
  color: var(--text-muted);
  background: var(--surface-1);
  text-align: center;
}

.git-hist-note svg {
  width: 22px;
  height: 22px;
}

.git-hist-day {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-1);
}

.git-hist-day > header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  font-weight: 650;
}

.git-hist-day-label {
  display: inline-block;
}

.git-hist-day-label::first-letter {
  text-transform: uppercase;
}

.git-hist-day > header span:not(.git-hist-day-label) {
  color: var(--text-dim);
  font-size: 12.5px;
  font-weight: 500;
}

.git-hist-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  color: var(--text-muted);
  font-size: 13px;
}

.spinning {
  animation: git-hist-spin 1s linear infinite;
}

@keyframes git-hist-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Modal do commit */
.git-hist-backdrop {
  position: fixed;
  z-index: 2000;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgb(0 0 0 / 55%);
}

.git-hist-modal {
  display: flex;
  width: min(1280px, 100%);
  height: min(860px, 100%);
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: 14px;
  color: var(--text);
  background: var(--surface-1);
  box-shadow: 0 16px 40px rgb(0 0 0 / 45%);
}

.git-hist-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.git-hist-modal-title {
  min-width: 0;
}

.git-hist-modal-hash {
  display: flex;
  align-items: center;
  gap: 6px;
}

.git-hist-modal-hash code {
  color: var(--accent);
  font-family: var(--font-family-mono);
  font-size: 13px;
}

.git-hist-modal-title h3 {
  margin: 4px 0 0;
  font-size: 16px;
}

.git-hist-modal-title p {
  margin: 4px 0 0;
  color: var(--text-dim);
  font-size: 12.5px;
}

.git-hist-modal-body {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  padding: 14px 20px 20px;
}

.git-hist-description summary {
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
}

.git-hist-description pre {
  margin: 8px 0 0;
  padding: 12px;
  overflow: auto;
  border-radius: 10px;
  color: var(--text-muted);
  background: var(--surface-0);
  font-family: var(--font-family-mono);
  font-size: 12.5px;
  white-space: pre-wrap;
}

.git-hist-notice {
  margin: 0;
  padding: 8px 12px;
  border-radius: 10px;
  color: var(--warning-text);
  background: color-mix(in srgb, var(--warning-text) 10%, transparent);
  font-size: 13px;
}

.git-hist-files-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.git-hist-delta {
  display: inline-flex;
  gap: 6px;
  font-family: var(--font-family-mono);
  font-size: 12.5px;
}

.git-hist-delta b {
  font-weight: 600;
}

.is-addition {
  color: var(--success-text);
}

.is-deletion {
  color: var(--danger-text, #f85149);
}

.git-hist-diff-layout {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 12px;
}

@media (max-width: 900px) {
  .git-hist-diff-layout {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: 160px minmax(0, 1fr);
  }
}

.git-hist-files {
  display: flex;
  min-height: 0;
  flex-direction: column;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
}

.git-hist-files button {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2px 8px;
  padding: 8px 12px;
  border: 0;
  border-top: 1px solid var(--border);
  color: var(--text);
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.git-hist-files button:first-child {
  border-top: 0;
}

.git-hist-files button:hover,
.git-hist-files button[data-active] {
  background: var(--surface-2);
}

.git-hist-files button[data-active] {
  box-shadow: inset 2px 0 0 var(--accent);
}

.git-hist-file-name {
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-hist-file-dir {
  grid-column: 1;
  overflow: hidden;
  color: var(--text-dim);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-hist-file-counts {
  grid-row: 1 / span 2;
  grid-column: 2;
  align-self: center;
  color: var(--text-dim);
  font-size: 12px;
}

.git-hist-diff {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 10px;
}

.git-hist-diff > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}

.git-hist-file-path {
  overflow: hidden;
  font-family: var(--font-family-mono);
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-hist-file-path small {
  margin-left: 8px;
  color: var(--text-dim);
}

.git-hist-diff-body {
  min-height: 0;
  flex: 1;
  overflow: auto;
}
</style>
