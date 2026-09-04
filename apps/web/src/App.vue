<script setup lang="ts">
import {
  CodeBracketIcon,
  CircleStackIcon,
  HomeIcon,
  PlayCircleIcon,
  PlusIcon,
  RocketLaunchIcon,
} from '@heroicons/vue/24/outline';
import { computed, onMounted, ref, watch } from 'vue';
import { darkTheme, NConfigProvider } from 'naive-ui';
import { Toaster } from 'vue-sonner';

import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';

import { dashboardStore } from './stores/dashboard';
import { nativeNotificationStore } from './stores/native-notifications';
import { useDashboardToastBridge } from './composables/useDashboardToastBridge';
import CommandPalette from './components/CommandPalette.vue';
import VisualPreferences from './components/VisualPreferences.vue';
import WorkspaceManagerModal from './components/WorkspaceManagerModal.vue';
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
useDashboardToastBridge();

const workspaceManagerOpen = ref(false);
const sidebarCollapsed = ref(readSidebarCollapsed());

const route = useRoute();
const router = useRouter();

nativeNotificationStore.setNavigator((target) => {
  void router.push(target);
});

const { knownProjects, workspaces, selectedWorkspaceId, switchWorkspace } =
  dashboardStore;

function openWorkspaceManager(): void {
  workspaceManagerOpen.value = true;
}

function handleWorkspaceSwitch(event: Event): void {
  const target = event.target as HTMLSelectElement;
  void switchWorkspace(target.value);
}

function toggleSidebarCollapsed(): void {
  sidebarCollapsed.value = !sidebarCollapsed.value;
}

watch(sidebarCollapsed, (collapsed) => {
  storeSidebarCollapsed(collapsed);
});

onMounted(() => {
  void dashboardStore.ensureDashboardLoaded();
});
</script>

<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="naiveThemeOverrides">
    <div
      class="app-shell"
      :class="{ 'app-shell-sidebar-collapsed': sidebarCollapsed }"
    >
      <aside
        id="primary-sidebar"
        class="sidebar"
        :class="{ 'sidebar-collapsed': sidebarCollapsed }"
      >
        <button
          class="brand brand-toggle"
          type="button"
          aria-controls="primary-sidebar"
          :aria-expanded="!sidebarCollapsed"
          :aria-label="
            sidebarCollapsed ? 'Expandir navegação' : 'Recolher navegação'
          "
          :title="
            sidebarCollapsed ? 'Expandir navegação' : 'Recolher navegação'
          "
          @click="toggleSidebarCollapsed"
        >
          <div class="brand-mark" aria-hidden="true">
            <CodeBracketIcon />
          </div>

          <div class="brand-copy">
            <strong>Dev Dashboard</strong>
            <span>Local workspace</span>
          </div>
        </button>

        <div class="sidebar-section">
          <span class="sidebar-label">Workspace ativo</span>
          <div class="sidebar-workspace-row">
            <select
              v-if="workspaces.length > 0"
              class="sidebar-workspace-select"
              :value="selectedWorkspaceId"
              aria-label="Trocar workspace ativo"
              @change="handleWorkspaceSwitch"
            >
              <option
                v-for="workspace in workspaces"
                :key="workspace.id"
                :value="workspace.id"
              >
                {{ workspace.name }}
              </option>
            </select>

            <div v-else class="workspace-summary-empty">Nenhum workspace</div>

            <button
              type="button"
              class="sidebar-workspace-add-icon"
              aria-label="Adicionar workspace"
              aria-haspopup="dialog"
              @click.stop="openWorkspaceManager"
            >
              <PlusIcon aria-hidden="true" />
            </button>
          </div>
        </div>

        <nav class="navigation" aria-label="Navegação principal">
          <span class="sidebar-label navigation-label">Navegação</span>

          <RouterLink
            class="navigation-item"
            :class="{ 'navigation-item-active': route.name === 'dashboard' }"
            :to="{ name: 'dashboard' }"
            :aria-label="sidebarCollapsed ? 'Visão geral' : undefined"
            :title="sidebarCollapsed ? 'Visão geral' : undefined"
          >
            <HomeIcon class="navigation-icon" aria-hidden="true" />
            <span class="navigation-text">Visão geral</span>
          </RouterLink>

          <RouterLink
            class="navigation-item"
            :class="{ 'navigation-item-active': route.name === 'processes' }"
            :to="{ name: 'processes' }"
            :aria-label="sidebarCollapsed ? 'Processos' : undefined"
            :title="sidebarCollapsed ? 'Processos' : undefined"
          >
            <PlayCircleIcon class="navigation-icon" aria-hidden="true" />
            <span class="navigation-text">Processos</span>
          </RouterLink>

          <RouterLink
            class="navigation-item"
            :class="{ 'navigation-item-active': route.name === 'production' }"
            :to="{ name: 'production' }"
            :aria-label="sidebarCollapsed ? 'Produção' : undefined"
            :title="sidebarCollapsed ? 'Produção' : undefined"
          >
            <RocketLaunchIcon class="navigation-icon" aria-hidden="true" />
            <span class="navigation-text">Produção</span>
          </RouterLink>

          <RouterLink
            class="navigation-item"
            :class="{ 'navigation-item-active': route.name === 'database' }"
            :to="{ name: 'database' }"
            :aria-label="sidebarCollapsed ? 'Banco de dados' : undefined"
            :title="sidebarCollapsed ? 'Banco de dados' : undefined"
          >
            <CircleStackIcon class="navigation-icon" aria-hidden="true" />
            <span class="navigation-text">Banco de dados</span>
          </RouterLink>
        </nav>

        <div class="sidebar-tools">
          <VisualPreferences />
        </div>
      </aside>

      <main class="main-content">
        <RouterView />
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
