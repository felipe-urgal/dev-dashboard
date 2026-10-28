<script setup lang="ts">
import { computed, h } from 'vue';
import { NDropdown } from 'naive-ui';
import { CheckIcon, ChevronDownIcon } from '@heroicons/vue/24/outline';

import type { Workspace } from '@dev-dashboard/contracts';

const ADD_KEY = '__add-workspace__';

const props = defineProps<{
  workspaces: readonly Workspace[];
  selectedId: string;
}>();

const emit = defineEmits<{
  select: [workspaceId: string];
  add: [];
}>();

const selected = computed(() =>
  props.workspaces.find((workspace) => workspace.id === props.selectedId),
);

const options = computed(() => [
  ...props.workspaces.map((workspace) => ({
    key: workspace.id,
    label: () =>
      h('span', { class: 'workspace-switcher-option' }, [
        h('span', workspace.name),
        workspace.id === props.selectedId
          ? h(CheckIcon, {
              class: 'workspace-switcher-check',
              'aria-hidden': 'true',
            })
          : null,
      ]),
  })),
  { key: 'divider', type: 'divider' as const },
  { key: ADD_KEY, label: 'Adicionar workspace…' },
]);

function handleSelect(key: string): void {
  if (key === ADD_KEY) emit('add');
  else if (key !== props.selectedId) emit('select', key);
}
</script>

<template>
  <button
    v-if="workspaces.length === 0"
    type="button"
    class="workspace-switcher"
    aria-haspopup="dialog"
    @click="emit('add')"
  >
    Adicionar workspace
  </button>

  <n-dropdown
    v-else
    trigger="click"
    placement="bottom-start"
    :options="options"
    @select="handleSelect"
  >
    <button
      type="button"
      class="workspace-switcher"
      aria-haspopup="menu"
      :aria-label="`Workspace ativo: ${selected?.name ?? 'nenhum'}. Trocar workspace`"
    >
      <span class="workspace-switcher-badge" aria-hidden="true">{{
        (selected?.name ?? '?').charAt(0).toUpperCase()
      }}</span>
      <span class="workspace-switcher-name">{{ selected?.name }}</span>
      <ChevronDownIcon class="workspace-switcher-chevron" aria-hidden="true" />
    </button>
  </n-dropdown>
</template>

<style scoped>
.workspace-switcher {
  display: inline-flex;
  min-width: 190px;
  max-width: 260px;
  height: 40px;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  color: var(--text);
  background: var(--surface-1);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 160ms ease;
}

.workspace-switcher:hover {
  background: var(--surface-2);
}

.workspace-switcher:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.workspace-switcher-badge {
  display: grid;
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 6px;
  color: var(--accent);
  background: var(--accent-soft);
  font-size: 12px;
  font-weight: 750;
}

.workspace-switcher-name {
  flex: 1;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-switcher-chevron {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  color: var(--text-muted);
}
</style>

<style>
.workspace-switcher-option {
  display: flex;
  min-width: 170px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.workspace-switcher-check {
  width: 16px;
  height: 16px;
  color: var(--accent);
}
</style>
