<script setup lang="ts">
import { computed, h, type Component } from 'vue';
import { NDropdown, type DropdownOption } from 'naive-ui';
import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  ArrowUturnLeftIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
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
  description: string;
  icon: Component;
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
  'pull-request': ArrowUpTrayIcon,
  history: ClockIcon,
};

const toolDescriptions: Record<string, string> = {
  server: 'Iniciar, parar e acompanhar os logs',
  terminal: 'Shell integrado ao projeto',
  console: 'Console interativo do Rails',
  sidekiq: 'Filas e jobs em segundo plano',
  webpack: 'Build e dev server dos assets',
  tests: 'Rodar a suíte e ver resultados',
};

const gitTabDescriptions: Record<ProjectGitTabId, string> = {
  sync: 'Status, pull e push',
  branches: 'Criar, trocar e apagar branches',
  diff: 'Mudanças do working tree',
  commit: 'Montar e registrar commits',
  undo: 'Desfazer alterações com segurança',
  'pull-request': 'Abrir e acompanhar o PR',
  history: 'Commits e histórico da branch',
};

const groupMeta: Record<NavGroupId, { label: string; icon: Component }> = {
  server: { label: 'Execução', icon: ServerStackIcon },
  git: { label: 'Git', icon: CodeBracketIcon },
};

function toolItem(tool: ProjectTool): NavItem {
  return {
    id: tool.id,
    label: tool.label,
    description: toolDescriptions[tool.id] ?? '',
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

const hubs = computed<NavHub[]>(() => {
  const grouped = (Object.keys(groupMeta) as NavGroupId[]).map((id) => {
    const gitTabItems: NavItem[] =
      id === 'git' && gitTool
        ? PROJECT_GIT_TABS.map((tab) => ({
            id: `git-${tab.id}`,
            label: tab.label,
            description: gitTabDescriptions[tab.id],
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

function menuOptions(hub: NavHub): DropdownOption[] {
  return hub.items.map((item) => ({
    key: item.id,
    label: item.label,
    description: item.description,
    navIcon: item.icon,
    props: { class: isItemActive(item) ? 'project-nav-menu-active' : '' },
  }));
}

/** Opção do menu: ícone, título e uma linha dizendo para que serve. */
function renderMenuLabel(option: DropdownOption) {
  return h('span', { class: 'project-nav-option' }, [
    h(option.navIcon as Component, {
      class: 'project-nav-option-icon',
      'aria-hidden': 'true',
    }),
    h('span', { class: 'project-nav-option-text' }, [
      h('strong', String(option.label ?? '')),
      h('small', String(option.description ?? '')),
    ]),
  ]);
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
        placement="bottom"
        :delay="0"
        :duration="150"
        :show-arrow="false"
        :menu-props="() => ({ class: 'project-nav-menu' })"
        :options="menuOptions(hub)"
        :render-label="renderMenuLabel"
        @select="(key) => selectItem(hub, key)"
      >
        <button
          type="button"
          class="project-nav-hub project-nav-hub-menu"
          :class="{ 'project-nav-hub-active': hub === activeHub }"
          :aria-current="hub === activeHub ? 'page' : undefined"
          :aria-label="
            hub === activeHub ? `${hub.label} · ${activeLabel(hub)}` : hub.label
          "
          aria-haspopup="menu"
        >
          <component :is="hub.icon" aria-hidden="true" />
          <span class="project-nav-label">{{ hub.label }}</span>
          <span v-if="hub === activeHub" class="project-nav-current">
            {{ activeLabel(hub) }}
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
        <span class="project-nav-label">{{ hub.label }}</span>
      </RouterLink>
    </template>
  </nav>
</template>

<style scoped>
/* Barra segmentada: itens centralizados, sem alterar a altura da topbar. */
.project-nav {
  display: flex;
  align-items: center;
  align-self: center;
  min-width: 0;
  gap: 2px;
  padding: 3px;
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-0) 55%, transparent);
  scrollbar-width: none;
}

.project-nav::-webkit-scrollbar {
  display: none;
}

.project-nav-hub {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: 9px;
  color: var(--text-muted);
  background: transparent;
  font: inherit;
  font-size: 13.5px;
  font-weight: var(--font-weight-strong);
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition:
    color 140ms ease,
    background 140ms ease;
}

.project-nav-hub svg {
  width: 17px;
  height: 17px;
  flex: 0 0 17px;
}

.project-nav-hub:hover {
  color: var(--text);
  background: var(--surface-2);
}

.project-nav-hub-active,
.project-nav-hub-active:hover {
  color: var(--accent);
  background: var(--accent-soft);
}

/* Item atual dentro do grupo: "Execução │ Testes" na mesma linha. */
.project-nav-current {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 6px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  font-size: 12px;
  font-weight: 600;
}

.project-nav-hub .project-nav-chevron {
  width: 12px;
  height: 12px;
  flex-basis: 12px;
  margin-left: -2px;
  opacity: 0.65;
}

.project-nav-hub:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
</style>

<style>
/* Menu suspenso: cartão com ícone, título e descrição por opção. */
.n-dropdown-menu.project-nav-menu {
  min-width: 270px;
  margin-top: 8px;
  padding: 6px;
  border: 1px solid var(--border-strong);
  border-radius: 14px;
  background: var(--surface-1);
  box-shadow: 0 14px 36px rgb(0 0 0 / 0.35);
}

.project-nav-menu .n-dropdown-option-body {
  --n-option-height: 54px;
  height: 54px !important;
  padding: 0 12px;
  border-radius: 10px;
}

.project-nav-menu .n-dropdown-option-body__prefix,
.project-nav-menu .n-dropdown-option-body__suffix {
  display: none;
}

.project-nav-menu .n-dropdown-option-body::before {
  display: none;
}

.project-nav-menu .n-dropdown-option-body:hover {
  background: var(--surface-2);
}

.project-nav-option {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.project-nav-option-icon {
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
  color: var(--text-muted);
}

.project-nav-option-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
  line-height: 1.3;
  text-align: center;
}

.project-nav-option-text strong {
  color: var(--text);
  font-size: 13.5px;
  font-weight: 600;
}

.project-nav-option-text small {
  color: var(--text-dim);
  font-size: 12px;
}

.project-nav-menu .n-dropdown-option-body.project-nav-menu-active {
  background: var(--accent-soft);
}

.project-nav-menu .project-nav-menu-active .project-nav-option-icon,
.project-nav-menu .project-nav-menu-active .project-nav-option-text strong {
  color: var(--accent);
}
</style>
