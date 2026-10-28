<script setup lang="ts">
import { NDropdown } from 'naive-ui';
import { EllipsisHorizontalIcon } from '@heroicons/vue/24/outline';

import type { GitFileChange } from '@dev-dashboard/contracts';

import {
  baseNameOf,
  directoryOf,
  statusLetter,
} from '../../utils/git-diff-tree';
import {
  groupUndoFiles,
  stagedFilesToUnstage,
  undoActionsFor,
  type UndoFileAction,
} from '../../utils/git-undo';
import { dangerMenuLabel } from '../../utils/ui-menu';
import UiButton from '../ui/UiButton.vue';

const props = defineProps<{
  files: readonly GitFileChange[];
  disabled: boolean;
  /** Operação em andamento, para trocar o rótulo do botão da linha. */
  operation: { kind: string; path?: string | undefined } | null;
}>();

const emit = defineEmits<{
  action: [action: UndoFileAction, file: GitFileChange];
  'unstage-all': [];
  'open-diff': [];
}>();

function pathLabel(file: GitFileChange): string {
  return file.previousPath && file.status === 'renamed'
    ? `${file.previousPath} → ${file.path}`
    : file.path;
}

function menuOptions(file: GitFileChange) {
  return undoActionsFor(file).menu.map((item) => ({
    key: item.key,
    label: dangerMenuLabel(`${item.label} — ${item.risk}`),
  }));
}

function unstageLabel(file: GitFileChange): string {
  return props.operation?.kind === 'unstage' &&
    props.operation.path === file.path
    ? 'Removendo…'
    : 'Tirar do staged';
}
</script>

<template>
  <section class="git-undo-files" aria-label="Alterações locais">
    <header>
      Alterações locais
      <small
        >{{ files.length }}
        {{ files.length === 1 ? 'arquivo' : 'arquivos' }}</small
      >
    </header>

    <p v-if="files.length === 0" class="git-undo-files-empty">
      Nenhuma alteração local. A árvore está igual ao último commit.
    </p>

    <section v-for="group in groupUndoFiles(files)" :key="group.id">
      <div class="git-undo-files-section">
        {{ group.title }} <span>{{ group.files.length }}</span>
        <span class="git-undo-files-spacer" />
        <button
          v-if="group.id === 'staged' && stagedFilesToUnstage(files).length > 1"
          type="button"
          :disabled="disabled"
          @click="emit('unstage-all')"
        >
          {{
            operation?.kind === 'unstage-all'
              ? 'Removendo…'
              : 'Tirar tudo do staged'
          }}
        </button>
      </div>

      <div
        v-for="file in group.files"
        :key="file.path"
        class="git-undo-files-row"
        :data-path="file.path"
      >
        <span
          class="git-undo-files-letter"
          :data-status="statusLetter(file.status)"
          >{{ statusLetter(file.status) }}</span
        >
        <span class="git-undo-files-path" :title="pathLabel(file)">
          <template v-if="file.previousPath && file.status === 'renamed'">
            {{ file.previousPath }} → {{ file.path }}
          </template>
          <template v-else>
            <span>{{ directoryOf(file.path) }}</span
            >{{ baseNameOf(file.path) }}
          </template>
        </span>
        <button
          type="button"
          class="git-undo-files-diff"
          @click="emit('open-diff')"
        >
          Diff
        </button>
        <UiButton
          v-if="undoActionsFor(file).safe"
          size="sm"
          :disabled="disabled"
          @click="emit('action', 'unstage', file)"
        >
          {{ unstageLabel(file) }}
        </UiButton>
        <NDropdown
          v-if="undoActionsFor(file).menu.length > 0"
          trigger="click"
          placement="bottom-end"
          :options="menuOptions(file)"
          :disabled="disabled"
          @select="(key: UndoFileAction) => emit('action', key, file)"
        >
          <UiButton
            icon
            size="sm"
            variant="ghost"
            :disabled="disabled"
            :aria-label="`Mais ações para ${file.path}`"
            aria-haspopup="menu"
          >
            <EllipsisHorizontalIcon aria-hidden="true" />
          </UiButton>
        </NDropdown>
      </div>
    </section>
  </section>
</template>

<style scoped>
.git-undo-files {
  overflow: hidden;
  padding-bottom: 8px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-1);
}

.git-undo-files > header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 16px;
  border-bottom: 1px solid var(--border);
  font-weight: 650;
}

.git-undo-files > header small {
  color: var(--text-dim);
  font-size: 12.5px;
  font-weight: 500;
}

.git-undo-files-empty {
  margin: 0;
  padding: 30px 16px;
  color: var(--text-dim);
  font-size: 13px;
  text-align: center;
}

.git-undo-files-section {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px 4px;
  color: var(--text-dim);
  font-size: 11.5px;
  font-weight: 650;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.git-undo-files-section > span:not(.git-undo-files-spacer) {
  color: var(--text-muted);
}

.git-undo-files-spacer {
  flex: 1 1 0;
}

.git-undo-files-section button {
  padding: 0;
  border: 0;
  color: var(--accent);
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
  cursor: pointer;
}

.git-undo-files-section button:disabled {
  color: var(--text-dim);
  cursor: default;
}

.git-undo-files-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 16px;
  font-size: 13px;
}

.git-undo-files-row:hover {
  background: var(--surface-2);
}

.git-undo-files-path {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-family: var(--font-family-mono);
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-undo-files-path span {
  color: var(--text-dim);
}

.git-undo-files-diff {
  padding: 0;
  border: 0;
  color: var(--text-dim);
  background: transparent;
  font: inherit;
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
}

.git-undo-files-letter {
  display: grid;
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 5px;
  color: var(--text-muted);
  background: var(--surface-3);
  font-size: 10.5px;
  font-weight: 700;
}

.git-undo-files-letter[data-status='M'] {
  color: var(--warning-text);
  background: color-mix(in srgb, var(--warning-text) 22%, transparent);
}

.git-undo-files-letter[data-status='A'],
.git-undo-files-letter[data-status='U'] {
  color: var(--success-text);
  background: color-mix(in srgb, var(--success-text) 22%, transparent);
}

.git-undo-files-letter[data-status='D'],
.git-undo-files-letter[data-status='!'] {
  color: var(--danger-text);
  background: color-mix(in srgb, var(--danger-text) 22%, transparent);
}

.git-undo-files-letter[data-status='R'],
.git-undo-files-letter[data-status='C'] {
  color: var(--accent);
  background: var(--accent-soft);
}
</style>
