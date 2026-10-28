<script setup lang="ts">
import {
  CodeBracketIcon,
  CircleStackIcon,
  HomeIcon,
} from '@heroicons/vue/24/outline';
import { computed, onMounted, provide, ref, watch } from 'vue';
import { darkTheme, NConfigProvider } from 'naive-ui';
import { Toaster } from 'vue-sonner';

import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';

import { dashboardStore } from './stores/dashboard';
import { nativeNotificationStore } from './stores/native-notifications';
import CommandPalette from './components/CommandPalette.vue';
import VisualPreferences from './components/VisualPreferences.vue';
import WorkspaceManagerModal from './components/WorkspaceManagerModal.vue';
import WorkspaceSwitcher from './components/WorkspaceSwitcher.vue';
import { createNaiveThemeOverrides } from './utils/naive-theme';
import {
  currentTheme,
  loadVisualPreferences,
} from './utils/visual-preferences';
import {
  readSidebarCollapsed,
  storeSidebarCollapsed,
} from './utils/sidebar-preferences';
const naiveTheme = computed(() =>
  currentTheme.value === 'dark' ? darkTheme : null,
);
const naiveThemeOverrides = computed(() =>
  createNaiveThemeOverrides(currentTheme.value),
);

loadVisualPreferences();

const workspaceManagerOpen = ref(false);
const projectSidebarCollapsed = ref(readSidebarCollapsed());
provide('projectSidebarCollapsed', projectSidebarCollapsed);

const route = useRoute();
const router = useRouter();

const isProjectRoute = computed(
  () =>
    typeof route.name === 'string' &&
    (route.name === 'project-details' || route.name.startsWith('project-')),
);
const showProjectChrome = isProjectRoute;

nativeNotificationStore.setNavigator((target) => {
  void router.push(target);
});

const { knownProjects, workspaces, selectedWorkspaceId, switchWorkspace } =
  dashboardStore;

function openWorkspaceManager(): void {
  workspaceManagerOpen.value = true;
}
provide('openWorkspaceManager', openWorkspaceManager);

function toggleProjectSidebar(): void {
  if (!showProjectChrome.value) return;
  projectSidebarCollapsed.value = !projectSidebarCollapsed.value;
}

watch(projectSidebarCollapsed, (collapsed) => {
  storeSidebarCollapsed(collapsed);
});

onMounted(() => {
  void dashboardStore.ensureDashboardLoaded();
});
</script>

<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="naiveThemeOverrides">
    <div
      class="app-shell app-shell-topnav"
      :class="{
        'app-shell-project-sidebar': showProjectChrome,
        'app-shell-project-sidebar-collapsed':
          showProjectChrome && projectSidebarCollapsed,
      }"
    >
      <button
        v-if="showProjectChrome"
        class="brand project-sidebar-brand"
        type="button"
        :aria-label="
          projectSidebarCollapsed
            ? 'Expandir sidebar do projeto'
            : 'Recolher sidebar do projeto'
        "
        :aria-pressed="projectSidebarCollapsed"
        :title="
          projectSidebarCollapsed
            ? 'Expandir sidebar do projeto'
            : 'Recolher sidebar do projeto'
        "
        @click="toggleProjectSidebar"
      >
        <div class="brand-mark" aria-hidden="true">
          <CodeBracketIcon />
        </div>

        <div class="brand-copy">
          <strong>Dev Dashboard</strong>
          <span>Local workspace</span>
        </div>
      </button>

      <header id="primary-navigation" class="sidebar topbar">
        <RouterLink
          class="topbar-icon-link topbar-nav-link"
          :class="{ 'is-active': route.name === 'dashboard' }"
          :to="{ name: 'dashboard' }"
          aria-label="Visão geral"
          title="Visão geral"
        >
          <HomeIcon aria-hidden="true" />
        </RouterLink>

        <div class="sidebar-section topbar-workspace">
          <span class="sidebar-label">Workspace ativo</span>
          <WorkspaceSwitcher
            :workspaces="workspaces"
            :selected-id="selectedWorkspaceId"
            @select="switchWorkspace"
            @add="openWorkspaceManager"
          />
        </div>

        <div class="sidebar-tools topbar-tools">
          <RouterLink
            class="topbar-icon-link topbar-nav-link"
            :class="{ 'is-active': route.name === 'database' }"
            :to="{ name: 'database' }"
            aria-label="Banco de dados"
            title="Banco de dados"
          >
            <CircleStackIcon aria-hidden="true" />
          </RouterLink>
          <VisualPreferences />
        </div>
      </header>

      <main class="main-content">
        <RouterView v-slot="{ Component }">
          <component :is="Component" />
        </RouterView>
      </main>

      <CommandPalette :projects="knownProjects" :workspaces="workspaces" />

      <WorkspaceManagerModal
        :open="workspaceManagerOpen"
        @close="workspaceManagerOpen = false"
      />

      <Toaster
        :theme="currentTheme"
        position="bottom-right"
        rich-colors
        close-button
        :duration="2500"
      />
    </div>
  </n-config-provider>
</template>

<style>
.topbar-icon-link {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-muted);
  text-decoration: none;
  transition:
    color 160ms ease,
    background 160ms ease;
}

.topbar-icon-link:hover {
  color: var(--text);
  background: var(--surface-2);
}

.topbar-icon-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.topbar-icon-link.is-active {
  border-color: transparent;
  color: var(--accent);
  background: var(--accent-soft);
}

.topbar-icon-link svg {
  width: 20px;
  height: 20px;
}
/* Toaster (vue-sonner) teleporta o conteúdo pra fora da árvore do App, então
   isso não pode ser scoped. Deixa os toasts translúcidos com um leve
   desfoque, no lugar do fundo sólido do preset rich-colors padrão. */
[data-sonner-toast] {
  background: color-mix(
    in srgb,
    var(--sonner-toast-bg, var(--normal-bg)) 78%,
    transparent
  ) !important;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

[data-sonner-toast][data-type='success'] {
  --sonner-toast-bg: var(--success-bg);
}

[data-sonner-toast][data-type='error'] {
  --sonner-toast-bg: var(--error-bg);
}

[data-sonner-toast][data-type='warning'] {
  --sonner-toast-bg: var(--warning-bg);
}

[data-sonner-toast][data-type='info'] {
  --sonner-toast-bg: var(--info-bg);
}
</style>
