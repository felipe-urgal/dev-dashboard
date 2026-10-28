<script setup lang="ts">
import { MagnifyingGlassIcon } from '@heroicons/vue/24/outline';

import type { GitFileStatus } from '@dev-dashboard/contracts';

import {
  baseNameOf,
  statusLetter,
  type DiffListGroup,
  type DiffStatusFilter,
} from '../../utils/git-diff-tree';

defineProps<{
  groups: DiffListGroup[];
  activePath: string | null;
  viewedCount: number;
  total: number;
  /** Status presentes no diff, para os chips de filtro. */
  statuses: GitFileStatus[];
}>();

const query = defineModel<string>('query', { required: true });
const status = defineModel<DiffStatusFilter>('status', { required: true });

const emit = defineEmits<{ select: [path: string] }>();

const CHIP_LABELS: Record<GitFileStatus, string> = {
  modified: 'Modificados',
  added: 'Adicionados',
  deleted: 'Removidos',
  renamed: 'Renomeados',
  copied: 'Copiados',
  untracked: 'Não rastreados',
  conflicted: 'Com conflito',
  'type-changed': 'Tipo alterado',
};

function percent(done: number, all: number): number {
  return all === 0 ? 0 : Math.round((done / all) * 100);
}
</script>

<template>
  <aside class="git-diff-files" aria-label="Arquivos alterados">
    <div class="git-diff-files-top">
      <div class="git-diff-files-progress">
        <span>{{ viewedCount }} de {{ total }} revisados</span>
        <span
          class="git-diff-files-track"
          role="progressbar"
          :aria-valuenow="percent(viewedCount, total)"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-label="Arquivos revisados"
        >
          <span :style="{ width: `${percent(viewedCount, total)}%` }" />
        </span>
      </div>

      <label class="git-diff-files-search">
        <MagnifyingGlassIcon aria-hidden="true" />
        <input
          v-model="query"
          type="search"
          placeholder="Filtrar arquivos"
          aria-label="Filtrar arquivos"
        />
      </label>

      <div v-if="statuses.length > 1" class="git-diff-files-chips">
        <button
          type="button"
          :aria-pressed="status === 'all'"
          @click="status = 'all'"
        >
          Todos
        </button>
        <button
          v-for="item in statuses"
          :key="item"
          type="button"
          :aria-pressed="status === item"
          @click="status = item"
        >
          {{ CHIP_LABELS[item] }}
        </button>
      </div>
    </div>

    <div class="git-diff-files-list">
      <p v-if="groups.length === 0" class="git-diff-files-empty">
        Nenhum arquivo corresponde ao filtro.
      </p>
      <section v-for="group in groups" :key="group.directory">
        <div class="git-diff-files-dir">{{ group.directory }}</div>
        <button
          v-for="{ file, viewed } in group.items"
          :key="file.path"
          type="button"
          class="git-diff-files-item"
          :class="{ 'is-active': file.path === activePath }"
          :data-viewed="viewed || undefined"
          :title="file.path"
          @click="emit('select', file.path)"
        >
          <span
            class="git-diff-files-letter"
            :data-status="statusLetter(file.status)"
            >{{ statusLetter(file.status) }}</span
          >
          <span class="git-diff-files-name">{{ baseNameOf(file.path) }}</span>
          <span v-if="viewed" class="git-diff-files-check" aria-label="Revisado"
            >✓</span
          >
          <span class="git-diff-files-delta">
            <b class="is-addition">+{{ file.additions }}</b>
            <b class="is-deletion">−{{ file.deletions }}</b>
          </span>
        </button>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.git-diff-files {
  position: sticky;
  top: calc(var(--diff-sticky-top) + 0px);
  display: flex;
  max-height: calc(100vh - var(--diff-sticky-top) - 16px);
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-1);
}

.git-diff-files-top {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-bottom: 1px solid var(--border);
}

.git-diff-files-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-muted);
  font-size: 12.5px;
}

.git-diff-files-track {
  height: 6px;
  flex: 1;
  overflow: hidden;
  border-radius: 999px;
  background: var(--surface-3);
}

.git-diff-files-track span {
  display: block;
  height: 100%;
  background: var(--success-text);
}

.git-diff-files-search {
  display: flex;
  height: 32px;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  color: var(--text-dim);
}

.git-diff-files-search svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
}

.git-diff-files-search input {
  min-width: 0;
  flex: 1;
  border: 0;
  color: var(--text);
  background: transparent;
  font: inherit;
  font-size: 13px;
  outline: none;
}

.git-diff-files-search:focus-within {
  border-color: var(--accent);
}

.git-diff-files-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.git-diff-files-chips button {
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--text-muted);
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.git-diff-files-chips button[aria-pressed='true'] {
  border-color: transparent;
  color: var(--accent);
  background: var(--accent-soft);
}

.git-diff-files-list {
  flex: 1;
  overflow: auto;
  padding: 6px 6px 10px;
}

.git-diff-files-empty {
  margin: 0;
  padding: 16px 8px;
  color: var(--text-dim);
  font-size: 13px;
}

.git-diff-files-dir {
  padding: 10px 8px 4px;
  color: var(--text-dim);
  font-family: var(--font-family-mono);
  font-size: 11.5px;
}

.git-diff-files-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 0;
  border-radius: 8px;
  color: var(--text);
  background: transparent;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.git-diff-files-item:hover {
  background: var(--surface-2);
}

.git-diff-files-item.is-active {
  background: var(--accent-soft);
}

.git-diff-files-item[data-viewed] .git-diff-files-name {
  color: var(--text-dim);
  text-decoration: line-through;
}

.git-diff-files-name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-diff-files-check {
  color: var(--success-text);
  font-size: 12px;
}

.git-diff-files-delta {
  display: inline-flex;
  gap: 5px;
  font-family: var(--font-family-mono);
  font-size: 11.5px;
  white-space: nowrap;
}

.git-diff-files-letter {
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

.git-diff-files-letter[data-status='M'] {
  color: var(--warning-text);
  background: color-mix(in srgb, var(--warning-text) 22%, transparent);
}

.git-diff-files-letter[data-status='A'],
.git-diff-files-letter[data-status='U'] {
  color: var(--success-text);
  background: color-mix(in srgb, var(--success-text) 22%, transparent);
}

.git-diff-files-letter[data-status='D'],
.git-diff-files-letter[data-status='!'] {
  color: var(--danger-text);
  background: color-mix(in srgb, var(--danger-text) 22%, transparent);
}

.git-diff-files-letter[data-status='R'],
.git-diff-files-letter[data-status='C'] {
  color: var(--accent);
  background: var(--accent-soft);
}

.is-addition {
  color: var(--success-text);
}

.is-deletion {
  color: var(--danger-text);
}
</style>
