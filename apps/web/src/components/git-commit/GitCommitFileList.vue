<script setup lang="ts">
import type { GitFileChange } from '@dev-dashboard/contracts';

import { isFileStaged, type CommitScope } from '../../utils/git-commit-scope';
import {
  baseNameOf,
  directoryOf,
  statusLetter,
} from '../../utils/git-diff-tree';

defineProps<{ scope: CommitScope }>();

const emit = defineEmits<{ 'open-diff': [] }>();

function letterOf(file: GitFileChange): string {
  return statusLetter(file.status);
}
</script>

<template>
  <aside class="git-commit-files" aria-label="O que entra no commit">
    <header>
      O que entra no commit
      <small>
        {{ scope.tracked.length }}
        {{ scope.tracked.length === 1 ? 'arquivo' : 'arquivos' }}
      </small>
    </header>

    <template v-if="scope.conflicts.length > 0">
      <div class="git-commit-files-section is-conflict">Conflitos</div>
      <div
        v-for="file in scope.conflicts"
        :key="file.path"
        class="git-commit-files-row"
      >
        <span class="git-commit-files-letter" data-status="!">!</span>
        <span class="git-commit-files-path"
          ><span>{{ directoryOf(file.path) }}</span
          >{{ baseNameOf(file.path) }}</span
        >
        <button type="button" @click="emit('open-diff')">Diff</button>
      </div>
    </template>

    <div class="git-commit-files-section">
      Rastreadas · entram <span>{{ scope.tracked.length }}</span>
    </div>
    <p v-if="scope.tracked.length === 0" class="git-commit-files-empty">
      Nenhuma alteração rastreada.
    </p>
    <div
      v-for="file in scope.tracked"
      :key="file.path"
      class="git-commit-files-row"
    >
      <span class="git-commit-files-letter" :data-status="letterOf(file)">{{
        letterOf(file)
      }}</span>
      <span class="git-commit-files-path" :title="file.path"
        ><span>{{ directoryOf(file.path) }}</span
        >{{ baseNameOf(file.path) }}</span
      >
      <span v-if="isFileStaged(file)" class="git-commit-files-staged"
        >staged</span
      >
      <button type="button" @click="emit('open-diff')">Diff</button>
    </div>

    <template v-if="scope.untracked.length > 0">
      <div class="git-commit-files-section">
        Não rastreadas · ficam de fora <span>{{ scope.untracked.length }}</span>
      </div>
      <div
        v-for="file in scope.untracked"
        :key="file.path"
        class="git-commit-files-row is-excluded"
      >
        <span class="git-commit-files-letter" data-status="U">U</span>
        <span class="git-commit-files-path" :title="file.path"
          ><span>{{ directoryOf(file.path) }}</span
          >{{ baseNameOf(file.path) }}</span
        >
      </div>
    </template>
  </aside>
</template>

<style scoped>
.git-commit-files {
  overflow: hidden;
  padding-bottom: 8px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-1);
}

.git-commit-files > header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 16px;
  border-bottom: 1px solid var(--border);
  font-weight: 650;
}

.git-commit-files > header small {
  color: var(--text-dim);
  font-size: 12.5px;
  font-weight: 500;
}

.git-commit-files-section {
  display: flex;
  gap: 8px;
  padding: 10px 16px 4px;
  color: var(--text-dim);
  font-size: 11.5px;
  font-weight: 650;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.git-commit-files-section span {
  color: var(--success-text);
}

.git-commit-files-section.is-conflict {
  color: var(--danger-text);
}

.git-commit-files-empty {
  margin: 0;
  padding: 6px 16px;
  color: var(--text-dim);
  font-size: 13px;
}

.git-commit-files-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 16px;
  font-size: 13px;
}

.git-commit-files-row:hover {
  background: var(--surface-2);
}

.git-commit-files-row.is-excluded {
  opacity: 0.55;
}

.git-commit-files-path {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-family: var(--font-family-mono);
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-commit-files-path span {
  color: var(--text-dim);
}

.git-commit-files-staged {
  padding: 1px 8px;
  border-radius: 999px;
  color: var(--accent);
  background: var(--accent-soft);
  font-size: 11px;
  font-weight: 650;
}

.git-commit-files-row button {
  padding: 0;
  border: 0;
  color: var(--text-dim);
  background: transparent;
  font: inherit;
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
}

.git-commit-files-letter {
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

.git-commit-files-letter[data-status='M'] {
  color: var(--warning-text);
  background: color-mix(in srgb, var(--warning-text) 22%, transparent);
}

.git-commit-files-letter[data-status='A'],
.git-commit-files-letter[data-status='U'] {
  color: var(--success-text);
  background: color-mix(in srgb, var(--success-text) 22%, transparent);
}

.git-commit-files-letter[data-status='D'],
.git-commit-files-letter[data-status='!'] {
  color: var(--danger-text);
  background: color-mix(in srgb, var(--danger-text) 22%, transparent);
}

.git-commit-files-letter[data-status='R'],
.git-commit-files-letter[data-status='C'] {
  color: var(--accent);
  background: var(--accent-soft);
}
</style>
