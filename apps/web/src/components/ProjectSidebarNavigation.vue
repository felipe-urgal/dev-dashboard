<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue';
import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  ArrowUturnLeftIcon,
  BeakerIcon,
  CheckBadgeIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  ClipboardDocumentListIcon,
  CodeBracketIcon,
  DocumentDuplicateIcon,
  ServerStackIcon,
  ShareIcon,
} from '@heroicons/vue/24/outline';
import { RouterLink, useRoute } from 'vue-router';

import type { Project } from '@dev-dashboard/contracts';

import { projectToolIcons } from '../project-tool-icons';
import {
  PROJECT_GIT_TABS,
  PROJECT_TOOLS,
  buildProjectToolRoute,
  isProjectGitTabId,
  listProjectTools,
  type ProjectGitTabId,
  type ProjectTool,
  type ProjectToolRoute,
  type ProjectToolGroup,
} from '../project-tools';

const props = defineProps<{
  project: Project;
  sidebarCollapsed: boolean;
  sidekiqDetected: boolean;
  webpackDetected: boolean;
  environmentInstanceId?: string | undefined;
}>();

const emit = defineEmits<{
  'expand-sidebar': [];
}>();

const route = useRoute();

type SidebarGroupId = Exclude<ProjectToolGroup, 'direct'>;

type SidebarItem = {
  id: string;
  label: string;
  icon?: Component;
  routeNames: string[];
  to: ProjectToolRoute;
  gitTab?: ProjectGitTabId;
};

type SidebarGroup = {
  id: SidebarGroupId;
  label: string;
  icon: Component;
  items: SidebarItem[];
};

const gitTabIcons: Record<ProjectGitTabId, Component> = {
  sync: ArrowPathIcon,
  branches: ShareIcon,
  diff: DocumentDuplicateIcon,
  commit: CheckCircleIcon,
  undo: ArrowUturnLeftIcon,
  issues: ClipboardDocumentListIcon,
  'pull-request': ArrowUpTrayIcon,
  history: ClockIcon,
};

const groupMeta: Record<SidebarGroupId, { label: string; icon: Component }> = {
  server: { label: 'Servidor', icon: ServerStackIcon },
  git: { label: 'Git', icon: CodeBracketIcon },
  development: { label: 'Desenvolvimento', icon: BeakerIcon },
  quality: { label: 'Qualidade', icon: CheckBadgeIcon },
};

const expandedGroups = ref<Record<SidebarGroupId, boolean>>({
  server: false,
  git: false,
  development: false,
  quality: false,
});

function toolItem(tool: ProjectTool): SidebarItem {
  return {
    id: tool.id,
    label: tool.label,
    icon: projectToolIcons[tool.icon],
    routeNames: [tool.routeName, ...(tool.activeRouteNames ?? [])],
    to: buildProjectToolRoute(
      tool,
      props.project.id,
      props.environmentInstanceId,
    ),
  };
}

const visibleTools = computed(() =>
  listProjectTools(props.project, {
    sidekiqDetected: props.sidekiqDetected,
    webpackDetected: props.webpackDetected,
  }).filter((tool) => tool.sidebar !== false),
);

const gitTool = PROJECT_TOOLS.find((tool) => tool.id === 'git');

const groups = computed<SidebarGroup[]>(() =>
  (Object.keys(groupMeta) as SidebarGroupId[]).map((id) => {
    const tools = visibleTools.value.filter((tool) => tool.group === id);
    const gitTabItems: SidebarItem[] =
      id === 'git' && gitTool
        ? PROJECT_GIT_TABS.map((tab) => ({
            id: `git-${tab.id}`,
            label: tab.label,
            icon: gitTabIcons[tab.id],
            routeNames: [gitTool.routeName],
            gitTab: tab.id,
            to: buildProjectToolRoute(
              gitTool,
              props.project.id,
              props.environmentInstanceId,
              { tab: tab.id },
            ),
          }))
        : [];
    return {
      id,
      ...groupMeta[id],
      items: [...gitTabItems, ...tools.map(toolItem)],
    };
  }),
);

const directItems = computed<SidebarItem[]>(() =>
  visibleTools.value.filter((tool) => tool.group === 'direct').map(toolItem),
);

const mobileItems = computed(() => [
  ...groups.value.flatMap((group) => group.items),
  ...directItems.value,
]);

function currentGitTab(): ProjectGitTabId {
  const value = Array.isArray(route.query.tab)
    ? route.query.tab[0]
    : route.query.tab;
  return isProjectGitTabId(value) ? value : 'sync';
}

function isItemActive(item: SidebarItem): boolean {
  const name = typeof route.name === 'string' ? route.name : '';
  if (!item.routeNames.includes(name)) return false;
  return !item.gitTab || item.gitTab === currentGitTab();
}

function isGroupActive(group: SidebarGroup): boolean {
  return group.items.some(isItemActive);
}

function activeGroupId(): SidebarGroupId | undefined {
  return groups.value.find(isGroupActive)?.id;
}

function toggleGroup(group: SidebarGroupId): void {
  if (props.sidebarCollapsed) emit('expand-sidebar');
  expandedGroups.value[group] = !expandedGroups.value[group];
}

function ensureActiveGroupOpen(): void {
  const group = activeGroupId();
  if (group) expandedGroups.value[group] = true;
}

watch(
  () => [route.name, route.query.tab, groups.value] as const,
  ensureActiveGroupOpen,
  { immediate: true },
);
</script>

<template>
  <div class="project-details-primary-tabs">
    <div class="project-sidebar-desktop-groups">
      <section
        v-for="group in groups"
        :key="group.id"
        class="project-details-menu-group"
      >
        <button
          class="project-details-tab project-details-menu-trigger"
          :class="{ 'project-details-tab-active': isGroupActive(group) }"
          type="button"
          :aria-expanded="expandedGroups[group.id]"
          :aria-controls="`project-sidebar-${group.id}-menu`"
          :title="sidebarCollapsed ? group.label : undefined"
          @click="toggleGroup(group.id)"
        >
          <component :is="group.icon" aria-hidden="true" />
          <span>{{ group.label }}</span>
          <ChevronDownIcon
            class="project-details-menu-chevron"
            aria-hidden="true"
          />
        </button>

        <nav
          v-show="expandedGroups[group.id] && !sidebarCollapsed"
          :id="`project-sidebar-${group.id}-menu`"
          class="project-details-submenu"
          :aria-label="`Ferramentas de ${group.label}`"
        >
          <RouterLink
            v-for="item in group.items"
            :key="item.id"
            class="project-details-submenu-item"
            :class="{
              'project-details-submenu-item-active': isItemActive(item),
            }"
            :aria-current="isItemActive(item) ? 'page' : undefined"
            :to="item.to"
          >
            <component :is="item.icon" v-if="item.icon" aria-hidden="true" />
            <span>{{ item.label }}</span>
          </RouterLink>
        </nav>
      </section>

      <RouterLink
        v-for="item in directItems"
        :key="item.id"
        class="project-details-tab"
        :class="{ 'project-details-tab-active': isItemActive(item) }"
        :aria-current="isItemActive(item) ? 'page' : undefined"
        :to="item.to"
        :title="sidebarCollapsed ? item.label : undefined"
      >
        <component :is="item.icon" v-if="item.icon" aria-hidden="true" />
        <span>{{ item.label }}</span>
      </RouterLink>
    </div>

    <div class="project-sidebar-mobile-links">
      <RouterLink
        v-for="item in mobileItems"
        :key="item.id"
        class="project-details-tab"
        :class="{ 'project-details-tab-active': isItemActive(item) }"
        :aria-current="isItemActive(item) ? 'page' : undefined"
        :to="item.to"
      >
        <component :is="item.icon" v-if="item.icon" aria-hidden="true" />
        <span>{{ item.label }}</span>
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.project-sidebar-desktop-groups {
  display: contents;
}

.project-sidebar-mobile-links {
  display: none;
}

.project-details-menu-group {
  display: grid;
  gap: 2px;
}

.project-details-menu-trigger {
  cursor: pointer;
}

.project-details-menu-chevron {
  width: 14px !important;
  height: 14px !important;
  margin-left: auto;
  transition: transform 150ms ease;
}

.project-details-menu-trigger[aria-expanded='true']
  .project-details-menu-chevron {
  transform: rotate(180deg);
}

.project-details-submenu {
  display: grid;
  gap: 2px;
  margin: 2px 0 5px 22px;
  padding-left: 10px;
  border-left: 1px solid var(--border);
}

.project-details-submenu-item {
  display: flex;
  min-height: 30px;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border-radius: 7px;
  color: var(--text-dim);
  font-size: 12px;
  font-weight: var(--font-weight-strong);
  line-height: 1.2;
  text-decoration: none;
}

.project-details-submenu-item svg {
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
}

.project-details-submenu-item:hover {
  color: var(--text);
  background: var(--surface-2);
}

.project-details-submenu-item-active {
  color: var(--accent);
  background: var(--accent-soft);
}

@media (min-width: 901px) and (max-height: 860px) {
  .project-details-submenu {
    gap: 1px;
    margin-left: 20px;
    padding-left: 8px;
  }

  .project-details-submenu-item {
    min-height: 26px;
    padding-inline: 8px;
    font-size: 11px;
  }
}

@media (max-width: 900px) {
  .project-sidebar-desktop-groups {
    display: none;
  }

  .project-sidebar-mobile-links {
    display: contents;
  }
}
</style>
