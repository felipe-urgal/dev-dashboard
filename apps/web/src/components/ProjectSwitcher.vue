<script setup lang="ts">
import { computed, h } from 'vue';
import { NDropdown } from 'naive-ui';
import { CheckIcon, ChevronDownIcon } from '@heroicons/vue/24/outline';

import type { Project, Workspace } from '@dev-dashboard/contracts';

const HOME_KEY = '__all-projects__';
const ADD_KEY = '__add-workspace__';
const WORKSPACE_PREFIX = 'workspace:';

const props = defineProps<{
  projects: readonly Project[];
  currentId: string;
  workspaces: readonly Workspace[];
  selectedWorkspaceId: string;
  runningIds: ReadonlySet<string>;
  /** Branch atual do projeto, exibida abaixo do nome. */
  branch?: string;
  /** Sem alterações: branch verde; com alterações: amarela. */
  branchClean?: boolean;
}>();

const emit = defineEmits<{
  select: [projectId: string];
  home: [];
  'select-workspace': [workspaceId: string];
  'add-workspace': [];
}>();

const current = computed(() =>
  props.projects.find((project) => project.id === props.currentId),
);

const workspaceName = computed(
  () =>
    props.workspaces.find(
      (workspace) => workspace.id === props.selectedWorkspaceId,
    )?.name ?? '',
);

const options = computed(() => [
  {
    key: 'header',
    type: 'render' as const,
    render: () =>
      h('div', { class: 'project-switcher-heading' }, workspaceName.value),
  },
  ...props.projects.map((project) => ({
    key: project.id,
    label: () =>
      h(
        'span',
        {
          class: [
            'project-switcher-option',
            { 'project-switcher-option-off': !project.enabled },
          ],
        },
        [
          h('span', {
            class: [
              'project-switcher-dot',
              { 'project-switcher-dot-on': props.runningIds.has(project.id) },
            ],
            'aria-hidden': 'true',
          }),
          h('span', { class: 'project-switcher-option-name' }, project.name),
          project.id === props.currentId
            ? h(CheckIcon, {
                class: 'project-switcher-check',
                'aria-hidden': 'true',
              })
            : null,
        ],
      ),
  })),
  { key: 'divider', type: 'divider' as const },
  { key: HOME_KEY, label: 'Todos os projetos' },
  {
    key: 'workspaces',
    label: 'Trocar workspace',
    children: [
      ...props.workspaces.map((workspace) => ({
        key: `${WORKSPACE_PREFIX}${workspace.id}`,
        label: workspace.name,
        disabled: workspace.id === props.selectedWorkspaceId,
      })),
      { key: 'workspace-divider', type: 'divider' as const },
      { key: ADD_KEY, label: 'Adicionar workspace…' },
    ],
  },
]);

function handleSelect(key: string): void {
  if (key === HOME_KEY) emit('home');
  else if (key === ADD_KEY) emit('add-workspace');
  else if (key.startsWith(WORKSPACE_PREFIX)) {
    emit('select-workspace', key.slice(WORKSPACE_PREFIX.length));
  } else if (key !== props.currentId) emit('select', key);
}
</script>

<template>
  <n-dropdown
    trigger="click"
    placement="bottom-start"
    :options="options"
    @select="handleSelect"
  >
    <button
      type="button"
      class="project-switcher"
      aria-haspopup="menu"
      :aria-label="`Projeto atual: ${current?.name ?? 'nenhum'}. Trocar de projeto`"
    >
      <span class="project-switcher-badge" aria-hidden="true">{{
        (current?.name ?? '?').charAt(0).toUpperCase()
      }}</span>
      <span class="project-switcher-text">
        <span class="project-switcher-name">{{ current?.name }}</span>
        <span
          v-if="branch"
          class="project-switcher-branch"
          :class="{ 'project-switcher-branch-dirty': !branchClean }"
          :title="branchClean ? branch : `${branch} · com alterações`"
          >{{ branch }}</span
        >
      </span>
      <ChevronDownIcon class="project-switcher-chevron" aria-hidden="true" />
    </button>
  </n-dropdown>
</template>

<style scoped>
.project-switcher {
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

.project-switcher:hover {
  background: var(--surface-2);
}

.project-switcher:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.project-switcher-badge {
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

.project-switcher-text {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.2;
  text-align: left;
}

.project-switcher-branch {
  max-width: 100%;
  overflow: hidden;
  color: var(--success-text);
  font-family: var(--font-family-mono);
  font-size: 11px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-switcher-branch-dirty {
  color: var(--warning-text);
}

.project-switcher-name {
  min-width: 0;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-switcher-chevron {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  color: var(--text-muted);
}
</style>

<style>
.project-switcher-heading {
  padding: 6px 12px 4px;
  color: var(--text-dim);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.project-switcher-option {
  display: flex;
  min-width: 200px;
  align-items: center;
  gap: 10px;
}

.project-switcher-option-off {
  opacity: 0.55;
}

.project-switcher-option-name {
  flex: 1;
}

.project-switcher-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--border-strong);
}

.project-switcher-dot-on {
  background: var(--success-text);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--success-text) 22%, transparent);
}

.project-switcher-check {
  width: 16px;
  height: 16px;
  color: var(--accent);
}
</style>
