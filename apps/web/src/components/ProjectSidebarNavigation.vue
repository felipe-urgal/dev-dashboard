<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue';
import {
  AdjustmentsHorizontalIcon,
  BeakerIcon,
  CheckBadgeIcon,
  ChevronDownIcon,
  CircleStackIcon,
  CodeBracketIcon,
  CommandLineIcon,
  CpuChipIcon,
  CubeIcon,
  CubeTransparentIcon,
  DocumentTextIcon,
  FolderIcon,
  LockClosedIcon,
  PlayCircleIcon,
  QueueListIcon,
  RocketLaunchIcon,
  ServerStackIcon,
  ShieldCheckIcon,
} from '@heroicons/vue/24/outline';
import { RouterLink, useRoute, type RouteLocationRaw } from 'vue-router';

import type { Project } from '@dev-dashboard/contracts';

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

type SidebarGroupId = 'server' | 'git' | 'development' | 'quality';

type SidebarItem = {
  id: string;
  label: string;
  icon?: Component;
  routeNames: string[];
  to: RouteLocationRaw;
  gitTab?: string;
};

type SidebarGroup = {
  id: SidebarGroupId;
  label: string;
  icon: Component;
  items: SidebarItem[];
};

const gitTabs = [
  ['sync', 'Sincronização'],
  ['branches', 'Branches'],
  ['diff', 'Diff'],
  ['commit', 'Commit'],
  ['undo', 'Desfazer'],
  ['pull-request', 'Pull Request'],
  ['history', 'Histórico'],
] as const;

const expandedGroups = ref<Record<SidebarGroupId, boolean>>({
  server: false,
  git: false,
  development: false,
  quality: false,
});

const environmentQuery = computed(() =>
  props.environmentInstanceId
    ? { environmentInstanceId: props.environmentInstanceId }
    : undefined,
);

function projectRoute(
  name: string,
  options: {
    environment?: boolean;
    query?: Record<string, string>;
  } = {},
): RouteLocationRaw {
  const query =
    options.query ?? (options.environment ? environmentQuery.value : undefined);

  return {
    name,
    params: { projectId: props.project.id },
    ...(query ? { query } : {}),
  };
}

const groups = computed<SidebarGroup[]>(() => [
  {
    id: 'server',
    label: 'Servidor',
    icon: ServerStackIcon,
    items: [
      ...(props.project.capabilities.includes('server')
        ? [
            {
              id: 'server',
              label: 'Servidor',
              icon: ServerStackIcon,
              routeNames: ['project-server', 'project-details'],
              to: projectRoute('project-server', { environment: true }),
            },
          ]
        : []),
      {
        id: 'terminal',
        label: 'Terminal',
        icon: CommandLineIcon,
        routeNames: ['project-terminal'],
        to: projectRoute('project-terminal', { environment: true }),
      },
      ...(props.project.type === 'rails'
        ? [
            {
              id: 'console',
              label: 'Console Rails',
              icon: CommandLineIcon,
              routeNames: ['project-console'],
              to: projectRoute('project-console', { environment: true }),
            },
          ]
        : []),
      ...(props.project.type === 'rails' && props.sidekiqDetected
        ? [
            {
              id: 'sidekiq',
              label: 'Sidekiq',
              icon: QueueListIcon,
              routeNames: ['project-rails-sidekiq'],
              to: projectRoute('project-rails-sidekiq', { environment: true }),
            },
          ]
        : []),
      ...(props.project.type === 'rails' && props.webpackDetected
        ? [
            {
              id: 'webpack',
              label: 'Webpack',
              icon: CodeBracketIcon,
              routeNames: ['project-rails-webpack'],
              to: projectRoute('project-rails-webpack', { environment: true }),
            },
          ]
        : []),
    ],
  },
  {
    id: 'git',
    label: 'Git',
    icon: CodeBracketIcon,
    items: [
      ...gitTabs.map(([id, label]) => ({
        id: `git-${id}`,
        label,
        routeNames: ['project-git'],
        gitTab: id,
        to: projectRoute('project-git', { query: { tab: id } }),
      })),
      ...(props.project.capabilities.includes('git')
        ? [
            {
              id: 'worktrees',
              label: 'Worktrees',
              icon: FolderIcon,
              routeNames: ['project-worktrees'],
              to: projectRoute('project-worktrees'),
            },
          ]
        : []),
    ],
  },
  {
    id: 'development',
    label: 'Desenvolvimento',
    icon: BeakerIcon,
    items: [
      {
        id: 'tests',
        label: 'Testes',
        icon: BeakerIcon,
        routeNames: ['project-tests'],
        to: projectRoute('project-tests', { environment: true }),
      },
      ...(props.project.type === 'rails' || props.project.type === 'node'
        ? [
            {
              id: 'dependencies',
              label: 'Dependências',
              icon: CubeIcon,
              routeNames: ['project-dependencies'],
              to: projectRoute('project-dependencies'),
            },
          ]
        : []),
      {
        id: 'dev-container',
        label: 'Dev Container',
        icon: CubeTransparentIcon,
        routeNames: ['project-dev-container'],
        to: projectRoute('project-dev-container', { environment: true }),
      },
      {
        id: 'compose',
        label: 'Compose',
        icon: ServerStackIcon,
        routeNames: ['project-compose'],
        to: projectRoute('project-compose', { environment: true }),
      },
      {
        id: 'environment',
        label: 'Variáveis de ambiente',
        icon: AdjustmentsHorizontalIcon,
        routeNames: ['project-environment'],
        to: projectRoute('project-environment'),
      },
      {
        id: 'migrations',
        label: 'Migrations',
        icon: CircleStackIcon,
        routeNames: ['project-migrations'],
        to: projectRoute('project-migrations', { environment: true }),
      },
    ],
  },
  {
    id: 'quality',
    label: 'Qualidade',
    icon: CheckBadgeIcon,
    items: [
      {
        id: 'local-ci',
        label: 'Local CI',
        icon: PlayCircleIcon,
        routeNames: ['project-local-ci'],
        to: projectRoute('project-local-ci'),
      },
      {
        id: 'readiness',
        label: 'Readiness',
        icon: CheckBadgeIcon,
        routeNames: ['project-readiness'],
        to: projectRoute('project-readiness'),
      },
      {
        id: 'security',
        label: 'Segurança',
        icon: LockClosedIcon,
        routeNames: ['project-security-center'],
        to: projectRoute('project-security-center'),
      },
      {
        id: 'doctor',
        label: 'Diagnóstico',
        icon: ShieldCheckIcon,
        routeNames: ['project-doctor'],
        to: projectRoute('project-doctor'),
      },
    ],
  },
]);

const directItems = computed<SidebarItem[]>(() => [
  {
    id: 'agent',
    label: 'Agente',
    icon: CpuChipIcon,
    routeNames: ['project-agent'],
    to: projectRoute('project-agent', { environment: true }),
  },
  ...(props.project.capabilities.includes('production')
    ? [
        {
          id: 'production',
          label: 'Produção',
          icon: RocketLaunchIcon,
          routeNames: ['project-production'],
          to: projectRoute('project-production'),
        },
      ]
    : []),
  {
    id: 'readme',
    label: 'README',
    icon: DocumentTextIcon,
    routeNames: ['project-readme'],
    to: projectRoute('project-readme'),
  },
]);

const mobileItems = computed(() => [
  ...groups.value.flatMap((group) => group.items),
  ...directItems.value,
]);

function currentGitTab(): string {
  const value = Array.isArray(route.query.tab)
    ? route.query.tab[0]
    : route.query.tab;
  return typeof value === 'string' && gitTabs.some(([id]) => id === value)
    ? value
    : 'sync';
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
  font-size: 10px;
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
    font-size: 9px;
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
