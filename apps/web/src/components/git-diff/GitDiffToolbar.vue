<script setup lang="ts">
import {
  ArrowPathIcon,
  Bars3BottomLeftIcon,
  ViewColumnsIcon,
} from '@heroicons/vue/24/outline';

import type { GitDiffScope } from '@dev-dashboard/contracts';

import UiButton from '../ui/UiButton.vue';

defineProps<{
  hasEntries: boolean;
  allCollapsed: boolean;
  loading: boolean;
  branchLabel: string;
  totalAdditions: number;
  totalDeletions: number;
  /** Mostra a dica dos atalhos (só faz sentido com vários arquivos). */
  showShortcuts: boolean;
}>();

const scope = defineModel<GitDiffScope>('scope', { required: true });
const viewMode = defineModel<'unified' | 'split'>('viewMode', {
  required: true,
});
const wrap = defineModel<boolean>('wrap', { required: true });

const emit = defineEmits<{ 'toggle-all': []; refresh: [] }>();

const SCOPES: { id: GitDiffScope; label: string }[] = [
  { id: 'combined', label: 'Todas' },
  { id: 'index', label: 'Staged' },
  { id: 'worktree', label: 'Não staged' },
];
</script>

<template>
  <div class="git-diff-bar">
    <div class="git-diff-segment" role="group" aria-label="Escopo do diff">
      <button
        v-for="item in SCOPES"
        :key="item.id"
        type="button"
        :aria-pressed="scope === item.id"
        @click="scope = item.id"
      >
        {{ item.label }}
      </button>
    </div>

    <template v-if="hasEntries">
      <div
        class="git-diff-segment"
        role="group"
        aria-label="Modo de visualização"
      >
        <button
          type="button"
          :aria-pressed="viewMode === 'unified'"
          @click="viewMode = 'unified'"
        >
          <Bars3BottomLeftIcon aria-hidden="true" />
          Unificado
        </button>
        <button
          type="button"
          :aria-pressed="viewMode === 'split'"
          @click="viewMode = 'split'"
        >
          <ViewColumnsIcon aria-hidden="true" />
          Lado a lado
        </button>
      </div>

      <UiButton :aria-pressed="wrap" @click="wrap = !wrap">
        Quebrar linhas
      </UiButton>
      <UiButton @click="emit('toggle-all')">
        {{ allCollapsed ? 'Expandir tudo' : 'Recolher tudo' }}
      </UiButton>
    </template>

    <UiButton
      icon
      variant="ghost"
      :busy="loading"
      :disabled="loading"
      aria-label="Atualizar diff"
      title="Atualizar diff"
      @click="emit('refresh')"
    >
      <ArrowPathIcon v-if="!loading" aria-hidden="true" />
    </UiButton>

    <span class="git-diff-bar-spacer" />

    <span v-if="showShortcuts" class="git-diff-hint">
      <kbd>J</kbd> <kbd>K</kbd> arquivos · <kbd>R</kbd> revisado
    </span>
    <span class="git-diff-summary">
      <strong>{{ branchLabel }}</strong>
      <b class="is-addition">+{{ totalAdditions }}</b>
      <b class="is-deletion">−{{ totalDeletions }}</b>
    </span>
  </div>
</template>

<style scoped>
.git-diff-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.git-diff-segment {
  display: inline-flex;
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
}

.git-diff-segment button {
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
  cursor: pointer;
}

.git-diff-segment button + button {
  border-left: 1px solid var(--border-strong);
}

.git-diff-segment button svg {
  width: 14px;
  height: 14px;
}

.git-diff-segment button[aria-pressed='true'] {
  color: var(--accent);
  background: var(--accent-soft);
}

.git-diff-bar :deep(.ui-button[aria-pressed='true']) {
  border-color: transparent;
  color: var(--accent);
  background: var(--accent-soft);
}

.git-diff-bar-spacer {
  flex: 1 1 0;
}

.git-diff-hint {
  color: var(--text-dim);
  font-size: 12px;
}

.git-diff-hint kbd {
  padding: 0 5px;
  border: 1px solid var(--border-strong);
  border-radius: 5px;
  color: var(--text-muted);
  font-family: var(--font-family-mono);
  font-size: 11px;
}

.git-diff-summary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.is-addition {
  color: var(--success-text);
}

.is-deletion {
  color: var(--danger-text);
}
</style>
