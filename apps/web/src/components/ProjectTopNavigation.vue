<script setup lang="ts">
import { computed, type Component } from 'vue';
import { NDropdown } from 'naive-ui';
import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  ArrowUturnLeftIcon,
  BeakerIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  ClipboardDocumentListIcon,
  CodeBracketIcon,
  DocumentDuplicateIcon,
  ServerStackIcon,
  ShareIcon,
} from '@heroicons/vue/24/outline';
import { RouterLink, useRoute, useRouter } from 'vue-router';

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
  sidekiqDetected: boolean;
  webpackDetected: boolean;
  environmentInstanceId?: string | undefined;
}>();

const route = useRoute();
const router = useRouter();

type NavGroupId = Exclude<ProjectToolGroup, 'direct'>;

type NavItem = {
  id: string;
  label: string;
  routeNames: string[];
  to: ProjectToolRoute;
  gitTab?: ProjectGitTabId;
};

type NavHub = {
  id: string;
  label: string;
  icon: Component;
  items: NavItem[];
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

const groupMeta: Record<NavGroupId, { label: string; icon: Component }> = {
  server: { label: 'Execução', icon: ServerStackIcon },
  git: { label: 'Git', icon: CodeBracketIcon },
  development: { label: 'Desenvolvimento', icon: BeakerIcon },
};

function toolItem(tool: ProjectTool): NavItem {
  return {
    id: tool.id,
    label: tool.label,
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

const hubs = computed<NavHub[]>(() => {
  const grouped = (Object.keys(groupMeta) as NavGroupId[]).map((id) => {
    const gitTabItems: NavItem[] =
      id === 'git' && gitTool
        ? PROJECT_GIT_TABS.map((tab) => ({
            id: `git-${tab.id}`,
            label: tab.label,
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
    const tools = visibleTools.value.filter((tool) => tool.group === id);
    return {
      id,
      ...groupMeta[id],
      items: [...gitTabItems, ...tools.map(toolItem)],
    };
  });

  const direct = visibleTools.value
    .filter((tool) => tool.group === 'direct')
    .map((tool) => ({
      id: tool.id,
      label: tool.label,
      icon: projectToolIcons[tool.icon],
      items: [toolItem(tool)],
    }));

  return [...grouped, ...direct].filter((hub) => hub.items.length > 0);
});

function currentGitTab(): ProjectGitTabId {
  const value = Array.isArray(route.query.tab)
    ? route.query.tab[0]
    : route.query.tab;
  return isProjectGitTabId(value) ? value : 'sync';
}

function isItemActive(item: NavItem): boolean {
  const name = typeof route.name === 'string' ? route.name : '';
  if (!item.routeNames.includes(name)) return false;
  return !item.gitTab || item.gitTab === currentGitTab();
}

const activeHub = computed(() =>
  hubs.value.find((hub) => hub.items.some(isItemActive)),
);

function menuOptions(hub: NavHub) {
  return hub.items.map((item) => ({
    key: item.id,
    label: item.label,
    props: { class: isItemActive(item) ? 'project-nav-menu-active' : '' },
  }));
}

function selectItem(hub: NavHub, key: string | number): void {
  const item = hub.items.find((candidate) => candidate.id === key);
  if (item) void router.push(item.to);
}

function activeLabel(hub: NavHub): string {
  return hub.items.find(isItemActive)?.label ?? '';
}
</script>

<template>
  <nav class="project-nav" aria-label="Áreas do projeto">
    <template v-for="hub in hubs" :key="hub.id">
      <NDropdown
        v-if="hub.items.length > 1"
        trigger="hover"
        :delay="0"
        :duration="150"
        placement="bottom-start"
        width="trigger"
        :menu-props="() => ({ class: 'project-nav-menu' })"
        :options="menuOptions(hub)"
        @select="(key) => selectItem(hub, key)"
      >
        <button
          type="button"
          class="project-nav-hub project-nav-hub-menu"
          :class="{ 'project-nav-hub-active': hub === activeHub }"
          :aria-current="hub === activeHub ? 'page' : undefined"
          aria-haspopup="menu"
        >
          <component :is="hub.icon" aria-hidden="true" />
          <span>{{ hub.label }}</span>
          <span v-if="hub === activeHub" class="project-nav-current">
            · {{ activeLabel(hub) }}
          </span>
          <ChevronDownIcon class="project-nav-chevron" aria-hidden="true" />
        </button>
      </NDropdown>

      <RouterLink
        v-else
        class="project-nav-hub"
        :class="{ 'project-nav-hub-active': hub === activeHub }"
        :aria-current="hub === activeHub ? 'page' : undefined"
        :to="hub.items[0]!.to"
      >
        <component :is="hub.icon" aria-hidden="true" />
        <span>{{ hub.label }}</span>
      </RouterLink>
    </template>
  </nav>
</template>

<style scoped>
.project-nav {
  display: flex;
  min-width: 0;
  gap: 2px;
  overflow-x: auto;
  scrollbar-width: none;
}

.project-nav::-webkit-scrollbar {
  display: none;
}

.project-nav-hub {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 0;
  color: var(--text-muted);
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-weight: var(--font-weight-strong);
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition: color 150ms ease;
}

/* O dropdown segue a largura do botão: o mínimo evita quebrar os submenus. */
.project-nav-hub-menu {
  min-width: 150px;
  justify-content: center;
}

.project-nav-hub svg {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
}

.project-nav-hub .project-nav-chevron {
  width: 13px;
  height: 13px;
  flex-basis: 13px;
  margin-left: -2px;
}

.project-nav-current {
  color: var(--text-muted);
  font-weight: 500;
}

.project-nav-hub:hover {
  color: var(--text);
}

.project-nav-hub-active {
  color: var(--accent);
}

.project-nav-hub::after {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: transparent;
  content: '';
  transition: background 150ms ease;
}

.project-nav-hub:hover::after,
.project-nav-hub-active::after {
  background: var(--accent);
}

.project-nav-hub:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
  border-radius: 6px;
}
</style>

<style>
/* O menu encosta na borda inferior do topbar (o padrão deixa 6px de folga). */
.n-dropdown-menu.project-nav-menu {
  margin-top: 1px;
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

.n-dropdown-option-body.project-nav-menu-active .n-dropdown-option-body__label {
  color: var(--accent);
}
</style>
