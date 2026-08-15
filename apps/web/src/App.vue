<script setup lang="ts">
import {
  CodeBracketIcon,
  HomeIcon,
  PlayCircleIcon,
  PlusIcon,
} from '@heroicons/vue/24/outline';
import { onMounted, ref, watch } from 'vue';

import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';

import { dashboardStore } from './stores/dashboard';
import { nativeNotificationStore } from './stores/native-notifications';
import AppDialog from './components/AppDialog.vue';
import VisualPreferences from './components/VisualPreferences.vue';
import WorkspaceManagerModal from './components/WorkspaceManagerModal.vue';
import {
  readSidebarCollapsed,
  storeSidebarCollapsed,
} from './utils/sidebar-preferences';

const workspaceManagerOpen = ref(false);
const sidebarCollapsed = ref(readSidebarCollapsed());

const route = useRoute();
const router = useRouter();

nativeNotificationStore.setNavigator((target) => {
  void router.push(target);
});

const { workspaces, selectedWorkspaceId, switchWorkspace } = dashboardStore;

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
        :title="sidebarCollapsed ? 'Expandir navegação' : 'Recolher navegação'"
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
            @click="workspaceManagerOpen = true"
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
      </nav>

      <div class="sidebar-tools">
        <VisualPreferences />
      </div>
    </aside>

    <main class="main-content">
      <RouterView />
    </main>

    <WorkspaceManagerModal
      :open="workspaceManagerOpen"
      @close="workspaceManagerOpen = false"
    />

    <AppDialog />
  </div>
</template>
