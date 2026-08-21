<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ClipboardDocumentIcon,
  DocumentTextIcon,
  ArrowPathIcon,
} from '@heroicons/vue/24/outline';
import type {
  GitFileStatus,
  GitImageDiffPreview,
  GitImagePreviewContent,
} from '@dev-dashboard/contracts';

import type {
  GitDiffFileEntry,
  GitDiffHunkState,
} from '../composables/useProjectGitDiffPage';
import type {
  GitSplitDiffRow,
  GitUnifiedDiffLine,
} from '../utils/git-diff-view';
import { gitFileToneFor } from '../utils/status-tones';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{
  entry: GitDiffFileEntry;
  viewMode: 'unified' | 'split';
  copiedPath: string;
  contextExpansionStep: number;
  statusLabels: Record<GitFileStatus, string>;
  fileName: (path: string) => string;
  directoryName: (path: string) => string;
  statBlocks: (entry: GitDiffFileEntry) => Array<'add' | 'del' | 'empty'>;
  linePrefix: (kind: string) => string;
  highlighted: (line: GitUnifiedDiffLine) => string;
  hunkLines: (state: GitDiffHunkState) => GitUnifiedDiffLine[];
  splitRowsFor: (state: GitDiffHunkState) => GitSplitDiffRow[];
  canExpandAbove: (state: GitDiffHunkState, entry: GitDiffFileEntry) => boolean;
  canExpandBelow: (state: GitDiffHunkState, entry: GitDiffFileEntry) => boolean;
}>();

const imageView = ref<'visual' | 'code'>('visual');

watch(
  () => props.entry.file.path,
  () => {
    imageView.value = 'visual';
  },
);

function highlightedLine(line: GitUnifiedDiffLine | null): string {
  return line ? props.highlighted(line) : '';
}

function isSvgPreview(preview: GitImageDiffPreview): boolean {
  return [preview.before, preview.after].some(
    (side) => side?.mimeType === 'image/svg+xml',
  );
}

function imageDataUrl(content: GitImagePreviewContent): string {
  return `data:${content.mimeType};base64,${content.base64}`;
}

const emit = defineEmits<{
  'toggle-collapsed': [];
  copy: [];
  'toggle-viewed': [viewed: boolean];
  'expand-context': [
    payload: { state: GitDiffHunkState; direction: 'up' | 'down' },
  ];
}>();
</script>

<template>
  <header class="git-diff-file-head">
    <button
      type="button"
      class="git-diff-chevron"
      :aria-expanded="!entry.collapsed"
      :aria-label="
        entry.collapsed
          ? `Expandir ${entry.file.path}`
          : `Recolher ${entry.file.path}`
      "
      @click="emit('toggle-collapsed')"
    >
      <ChevronDownIcon aria-hidden="true" />
    </button>

    <span class="git-diff-file-path" :title="entry.file.path">
      <span class="git-diff-file-dir">{{
        directoryName(entry.file.path)
      }}</span>
      <strong>{{ fileName(entry.file.path) }}</strong>
      <small v-if="entry.file.previousPath"
        >de {{ entry.file.previousPath }}</small
      >
    </span>

    <button
      type="button"
      class="git-diff-copy-button"
      :class="{ 'is-done': copiedPath === entry.file.path }"
      :title="
        copiedPath === entry.file.path
          ? 'Caminho copiado'
          : 'Copiar caminho do arquivo'
      "
      :aria-label="`Copiar caminho de ${entry.file.path}`"
      @click="emit('copy')"
    >
      <ClipboardDocumentIcon aria-hidden="true" />
    </button>

    <div class="git-diff-file-meta">
      <StatusBadge :tone="gitFileToneFor(entry.file.status)">
        {{ statusLabels[entry.file.status] }}
      </StatusBadge>

      <span v-if="entry.file.binary" class="git-diff-file-counts">binário</span>
      <span v-else class="git-diff-file-counts git-diff-delta">
        <b class="is-addition">+{{ entry.file.additions }}</b>
        <b class="is-deletion">−{{ entry.file.deletions }}</b>
      </span>

      <span class="git-diff-statbar" aria-hidden="true">
        <i
          v-for="(block, index) in statBlocks(entry)"
          :key="index"
          :class="`is-${block}`"
        ></i>
      </span>

      <label class="git-diff-viewed">
        <input
          type="checkbox"
          :checked="entry.viewed"
          @change="
            emit('toggle-viewed', ($event.target as HTMLInputElement).checked)
          "
        />
        Revisado
      </label>
    </div>
  </header>

  <div v-if="!entry.collapsed" class="git-diff-file-body">
    <p
      v-if="entry.error"
      class="project-error git-diff-file-error"
      role="alert"
    >
      {{ entry.error }}
    </p>

    <div
      v-else-if="entry.loading || !entry.loaded"
      class="git-diff-detail-empty"
    >
      <ArrowPathIcon class="spinning" aria-hidden="true" />
      Carregando {{ entry.file.path }}…
    </div>

    <template v-else>
      <div
        v-if="entry.diff?.imagePreview && isSvgPreview(entry.diff.imagePreview)"
        class="git-diff-image-view-switch"
        aria-label="Visualização do SVG"
      >
        <button
          type="button"
          :class="{ active: imageView === 'visual' }"
          :aria-pressed="imageView === 'visual'"
          @click="imageView = 'visual'"
        >
          Visual
        </button>
        <button
          type="button"
          :class="{ active: imageView === 'code' }"
          :aria-pressed="imageView === 'code'"
          @click="imageView = 'code'"
        >
          Código
        </button>
      </div>

      <div
        v-if="
          entry.diff?.imagePreview &&
          (!isSvgPreview(entry.diff.imagePreview) || imageView === 'visual')
        "
        class="git-diff-image-preview"
        :class="{
          'is-single':
            !entry.diff.imagePreview.before || !entry.diff.imagePreview.after,
        }"
      >
        <figure v-if="entry.diff.imagePreview.before">
          <figcaption>Antes</figcaption>
          <div class="git-diff-image-stage">
            <img
              :src="imageDataUrl(entry.diff.imagePreview.before)"
              :alt="`Versão anterior de ${entry.file.path}`"
            />
          </div>
        </figure>

        <figure v-if="entry.diff.imagePreview.after">
          <figcaption>Depois</figcaption>
          <div class="git-diff-image-stage">
            <img
              :src="imageDataUrl(entry.diff.imagePreview.after)"
              :alt="`Versão atual de ${entry.file.path}`"
            />
          </div>
        </figure>
      </div>

      <div v-else-if="entry.diff?.binary" class="git-diff-detail-empty">
        <DocumentTextIcon aria-hidden="true" />
        <strong>Diff binário não disponível</strong>
        <span
          >O arquivo pode ser revisado por um editor ou ferramenta Git
          externa.</span
        >
      </div>

      <template v-else-if="entry.diff">
        <div
          v-if="entry.diff.masked || entry.diff.truncated"
          class="git-diff-warnings"
        >
          <p v-if="entry.diff.masked">
            {{ entry.diff.redactionCount }} possível(is) segredo(s) foram
            mascarados.
          </p>
          <p v-if="entry.diff.truncated">
            O diff foi truncado para manter a interface responsiva.
          </p>
        </div>

        <pre
          v-if="entry.hunks.length === 0 && entry.diff.content"
          class="git-diff-raw-meta"
          >{{ entry.diff.content }}</pre>

        <div v-else-if="entry.hunks.length === 0" class="git-diff-detail-empty">
          <DocumentTextIcon aria-hidden="true" />
          <strong>Diff textual vazio</strong>
          <span
            >O arquivo pode conter apenas mudança de modo ou metadados.</span
          >
        </div>

        <div
          v-else
          :class="viewMode === 'split' ? 'git-diff-split' : 'git-diff-unified'"
          role="table"
          :aria-label="`Diff de ${entry.file.path}`"
        >
          <div
            v-for="(line, index) in entry.leading"
            :key="`leading-${index}`"
            class="git-diff-unified-row is-meta"
            role="row"
          >
            <span class="git-diff-line-number" role="cell"></span>
            <span class="git-diff-line-number" role="cell"></span>
            <span class="git-diff-line-prefix" role="cell"></span>
            <code role="cell" v-html="highlighted(line)"></code>
          </div>

          <template
            v-for="(state, hunkIndex) in entry.hunks"
            :key="`hunk-${hunkIndex}`"
          >
            <div
              class="git-diff-hunk-head"
              role="row"
              data-git-action-feedback="off"
            >
              <button
                type="button"
                class="git-diff-expand"
                :disabled="!canExpandAbove(state, entry) || state.expanding"
                :title="`Mostrar ${contextExpansionStep} linhas acima`"
                :aria-label="`Mostrar ${contextExpansionStep} linhas acima de ${entry.file.path}`"
                @click="emit('expand-context', { state, direction: 'up' })"
              >
                <ChevronUpIcon aria-hidden="true" />
              </button>
              <button
                type="button"
                class="git-diff-expand"
                :disabled="!canExpandBelow(state, entry) || state.expanding"
                :title="`Mostrar ${contextExpansionStep} linhas abaixo`"
                :aria-label="`Mostrar ${contextExpansionStep} linhas abaixo de ${entry.file.path}`"
                @click="emit('expand-context', { state, direction: 'down' })"
              >
                <ChevronDownIcon aria-hidden="true" />
              </button>
              <code role="cell">{{ state.hunk.header.text }}</code>
            </div>

            <template v-if="viewMode === 'unified'">
              <div
                v-for="(line, lineIndex) in hunkLines(state)"
                :key="`u-${hunkIndex}-${lineIndex}`"
                class="git-diff-unified-row"
                :class="`is-${line.kind}`"
                role="row"
              >
                <span class="git-diff-line-number" role="cell">{{
                  line.oldLine ?? ''
                }}</span>
                <span class="git-diff-line-number" role="cell">{{
                  line.newLine ?? ''
                }}</span>
                <span class="git-diff-line-prefix" role="cell">{{
                  linePrefix(line.kind)
                }}</span>
                <code role="cell" v-html="highlighted(line)"></code>
              </div>
            </template>

            <template v-else>
              <template
                v-for="(row, rowIndex) in splitRowsFor(state)"
                :key="`s-${hunkIndex}-${rowIndex}`"
              >
                <div
                  v-if="row.kind === 'meta'"
                  class="git-diff-split-meta"
                  role="row"
                >
                  <code
                    role="cell"
                    v-html="highlightedLine(row.left ?? row.right)"
                  ></code>
                </div>

                <div v-else class="git-diff-split-row" role="row">
                  <div
                    class="git-diff-side-cell"
                    :class="row.left ? `is-${row.left.kind}` : 'is-empty'"
                  >
                    <span class="git-diff-line-number" role="cell">{{
                      row.left?.oldLine ?? ''
                    }}</span>
                    <span class="git-diff-line-prefix" role="cell">{{
                      row.left ? linePrefix(row.left.kind) : ''
                    }}</span>
                    <code
                      v-if="row.left"
                      role="cell"
                      v-html="highlighted(row.left)"
                    ></code>
                    <code v-else role="cell"></code>
                  </div>
                  <div
                    class="git-diff-side-cell"
                    :class="row.right ? `is-${row.right.kind}` : 'is-empty'"
                  >
                    <span class="git-diff-line-number" role="cell">{{
                      row.right?.newLine ?? ''
                    }}</span>
                    <span class="git-diff-line-prefix" role="cell">{{
                      row.right ? linePrefix(row.right.kind) : ''
                    }}</span>
                    <code
                      v-if="row.right"
                      role="cell"
                      v-html="highlighted(row.right)"
                    ></code>
                    <code v-else role="cell"></code>
                  </div>
                </div>
              </template>
            </template>
          </template>
        </div>
      </template>
    </template>
  </div>
</template>
