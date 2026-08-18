<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

import {
  AdjustmentsHorizontalIcon,
  CircleStackIcon,
  CodeBracketIcon,
  CommandLineIcon,
  CubeIcon,
  DocumentTextIcon,
  EllipsisHorizontalIcon,
  QueueListIcon,
  ShieldCheckIcon,
} from '@heroicons/vue/24/outline';

import { useRoute } from 'vue-router';

import type { Project } from '@dev-dashboard/contracts';

const props = defineProps<{
  project: Project;
  databaseSupported: boolean;
  sidekiqDetected: boolean;
  webpackDetected: boolean;
}>();

const route = useRoute();
const moreToolsOpen = ref(false);
const moreToolsMenu = ref<HTMLElement | null>(null);
const moreToolsPopover = ref<HTMLElement | null>(null);
const moreToolsTrigger = ref<HTMLButtonElement | null>(null);
const moreToolsPosition = ref({ top: 0, right: 12 });

const isMoreToolRoute = () =>
  [
    'project-database',
    'project-dependencies',
    'project-console',
    'project-rails-sidekiq',
    'project-rails-webpack',
    'project-environment',
    'project-doctor',
    'project-readme',
  ].includes(String(route.name));

function updateMoreToolsPosition(): void {
  const trigger = moreToolsTrigger.value;
  if (!trigger) return;

  const rect = trigger.getBoundingClientRect();
  moreToolsPosition.value = {
    top: rect.bottom + 6,
    right: Math.max(12, window.innerWidth - rect.right),
  };
}

function closeMoreTools(): void {
  const shouldRestoreFocus = moreToolsOpen.value;
  moreToolsOpen.value = false;
  window.removeEventListener('resize', updateMoreToolsPosition);
  window.removeEventListener('scroll', updateMoreToolsPosition, true);

  if (shouldRestoreFocus) moreToolsTrigger.value?.focus();
}

function handleMoreToolsDocumentClick(event: MouseEvent): void {
  if (!moreToolsOpen.value) return;

  const target = event.target;
  if (
    target instanceof Element &&
    (moreToolsMenu.value?.contains(target) ||
      (target as HTMLElement).closest('.project-details-more-popover'))
  ) {
    return;
  }

  closeMoreTools();
}

function handleMoreToolsKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeMoreTools();
}

async function toggleMoreTools(): Promise<void> {
  if (moreToolsOpen.value) {
    closeMoreTools();
    return;
  }

  moreToolsOpen.value = true;
  await nextTick();
  updateMoreToolsPosition();
  moreToolsPopover.value
    ?.querySelector<HTMLElement>('[role="menuitem"]')
    ?.focus();
  window.addEventListener('resize', updateMoreToolsPosition);
  window.addEventListener('scroll', updateMoreToolsPosition, true);
}

onMounted(() => {
  document.addEventListener('click', handleMoreToolsDocumentClick);
  document.addEventListener('keydown', handleMoreToolsKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleMoreToolsDocumentClick);
  document.removeEventListener('keydown', handleMoreToolsKeydown);
  closeMoreTools();
});
</script>

<template>
  <div ref="moreToolsMenu" class="project-details-more-menu">
    <button
      ref="moreToolsTrigger"
      type="button"
      class="project-details-more-trigger"
      :class="{
        'project-details-more-trigger-active': isMoreToolRoute(),
      }"
      aria-label="Mais ferramentas"
      aria-haspopup="menu"
      :aria-expanded="moreToolsOpen"
      aria-controls="project-details-more-popover"
      @click="toggleMoreTools"
    >
      <EllipsisHorizontalIcon aria-hidden="true" />
    </button>

    <Teleport to="body">
      <div
        v-if="moreToolsOpen"
        id="project-details-more-popover"
        ref="moreToolsPopover"
        class="project-details-more-popover"
        :style="{
          top: `${moreToolsPosition.top}px`,
          right: `${moreToolsPosition.right}px`,
        }"
        role="menu"
      >
        <RouterLink
          v-if="databaseSupported"
          class="project-details-more-item"
          :class="{
            'project-details-more-item-active':
              route.name === 'project-database',
          }"
          :to="{ name: 'project-database', params: { projectId: project.id } }"
          role="menuitem"
          @click="closeMoreTools"
        >
          <CircleStackIcon aria-hidden="true" />
          <span>Banco de dados</span>
        </RouterLink>
        <RouterLink
          v-if="project.type === 'rails' || project.type === 'node'"
          class="project-details-more-item"
          :class="{
            'project-details-more-item-active':
              route.name === 'project-dependencies',
          }"
          :to="{
            name: 'project-dependencies',
            params: { projectId: project.id },
          }"
          role="menuitem"
          @click="closeMoreTools"
        >
          <CubeIcon aria-hidden="true" />
          <span>Dependências</span>
        </RouterLink>
        <RouterLink
          v-if="project.type === 'rails'"
          class="project-details-more-item"
          :class="{
            'project-details-more-item-active':
              route.name === 'project-console',
          }"
          :to="{ name: 'project-console', params: { projectId: project.id } }"
          role="menuitem"
          @click="closeMoreTools"
        >
          <CommandLineIcon aria-hidden="true" />
          <span>Console</span>
        </RouterLink>
        <RouterLink
          v-if="project.type === 'rails' && sidekiqDetected"
          class="project-details-more-item"
          :class="{
            'project-details-more-item-active':
              route.name === 'project-rails-sidekiq',
          }"
          :to="{
            name: 'project-rails-sidekiq',
            params: { projectId: project.id },
          }"
          role="menuitem"
          @click="closeMoreTools"
        >
          <QueueListIcon aria-hidden="true" />
          <span>Sidekiq</span>
        </RouterLink>
        <RouterLink
          v-if="project.type === 'rails' && webpackDetected"
          class="project-details-more-item"
          :class="{
            'project-details-more-item-active':
              route.name === 'project-rails-webpack',
          }"
          :to="{
            name: 'project-rails-webpack',
            params: { projectId: project.id },
          }"
          role="menuitem"
          @click="closeMoreTools"
        >
          <CodeBracketIcon aria-hidden="true" />
          <span>Webpack</span>
        </RouterLink>
        <RouterLink
          class="project-details-more-item"
          :class="{
            'project-details-more-item-active':
              route.name === 'project-environment',
          }"
          :to="{
            name: 'project-environment',
            params: { projectId: project.id },
          }"
          role="menuitem"
          @click="closeMoreTools"
        >
          <AdjustmentsHorizontalIcon aria-hidden="true" />
          <span>Variáveis de ambiente</span>
        </RouterLink>
        <RouterLink
          class="project-details-more-item"
          :class="{
            'project-details-more-item-active': route.name === 'project-doctor',
          }"
          :to="{ name: 'project-doctor', params: { projectId: project.id } }"
          role="menuitem"
          @click="closeMoreTools"
        >
          <ShieldCheckIcon aria-hidden="true" />
          <span>Diagnóstico</span>
        </RouterLink>
        <RouterLink
          class="project-details-more-item"
          :class="{
            'project-details-more-item-active': route.name === 'project-readme',
          }"
          :to="{ name: 'project-readme', params: { projectId: project.id } }"
          role="menuitem"
          @click="closeMoreTools"
        >
          <DocumentTextIcon aria-hidden="true" />
          <span>README</span>
        </RouterLink>
      </div>
    </Teleport>
  </div>
</template>

<style>
/* The trigger lives in the project tabs while the menu itself is teleported. */
.project-details-more-menu {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
}

.project-details-more-trigger {
  display: inline-flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: var(--surface-1);
  cursor: pointer;
}

.project-details-more-trigger svg {
  width: 18px;
  height: 18px;
}

/* This menu is teleported to body, so it cannot inherit the view's scoped CSS. */
.project-details-more-popover {
  position: fixed;
  z-index: 1000;
  display: grid;
  min-width: 240px;
  max-width: min(320px, calc(100vw - 24px));
  max-height: calc(100vh - 24px);
  gap: 3px;
  overflow-y: auto;
  padding: 7px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
}

.project-details-more-item {
  display: flex;
  min-height: 36px;
  align-items: center;
  gap: 9px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  text-decoration: none;
}

.project-details-more-item svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  color: var(--text-dim);
}

.project-details-more-item:hover,
.project-details-more-item-active {
  color: var(--accent);
  background: var(--accent-soft);
}

.project-details-more-item:hover svg,
.project-details-more-item-active svg {
  color: var(--accent);
}
</style>
