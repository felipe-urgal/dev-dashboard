<script setup lang="ts">
import { PlusIcon } from '@heroicons/vue/24/outline';

import type { BranchFilter } from '../../utils/git-branches';
import UiButton from '../ui/UiButton.vue';
import UiSearchField from '../ui/UiSearchField.vue';

defineProps<{
  localCount: number;
  remoteOnlyCount: number;
  disabled: boolean;
  creating: boolean;
}>();

const query = defineModel<string>('query', { required: true });
const filter = defineModel<BranchFilter>('filter', { required: true });

const emit = defineEmits<{ create: [] }>();

const FILTERS: { id: BranchFilter; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'local', label: 'Locais' },
  { id: 'remote', label: 'Só no origin' },
  { id: 'unpublished', label: 'Não publicadas' },
];
</script>

<template>
  <div class="git-branch-toolbar">
    <UiSearchField
      v-model="query"
      label="Buscar branch"
      placeholder="Buscar branch"
    />

    <div class="git-branch-filters" role="group" aria-label="Filtro">
      <button
        v-for="item in FILTERS"
        :key="item.id"
        type="button"
        :aria-pressed="filter === item.id"
        @click="filter = item.id"
      >
        {{ item.label }}
      </button>
    </div>

    <span class="git-branch-counts">
      {{ localCount }} {{ localCount === 1 ? 'local' : 'locais' }} ·
      {{ remoteOnlyCount }} só no origin
    </span>

    <span class="git-branch-spacer" />

    <UiButton variant="primary" :disabled="disabled" @click="emit('create')">
      <PlusIcon aria-hidden="true" />
      {{ creating ? 'Criando…' : 'Nova branch' }}
    </UiButton>
  </div>
</template>

<style scoped>
.git-branch-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.git-branch-filters {
  display: inline-flex;
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
}

.git-branch-filters button {
  height: 32px;
  padding: 0 12px;
  border: 0;
  color: var(--text-muted);
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.git-branch-filters button + button {
  border-left: 1px solid var(--border-strong);
}

.git-branch-filters button[aria-pressed='true'] {
  color: var(--accent);
  background: var(--accent-soft);
}

.git-branch-counts {
  color: var(--text-dim);
  font-size: 13px;
}

.git-branch-spacer {
  flex: 1 1 0;
}
</style>
