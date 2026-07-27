<script setup lang="ts">
import {
  computed,
  onMounted,
} from 'vue';

import {
  RouterLink,
  RouterView,
  useRoute,
} from 'vue-router';

import { dashboardStore } from './stores/dashboard';
import VisualPreferences from './components/VisualPreferences.vue';

const route = useRoute();

const {
  apiConnected,
  projects,
  selectedWorkspace,
} = dashboardStore;

const pageTitle = computed(() =>
  typeof route.meta.title === 'string'
    ? route.meta.title
    : 'Dev Dashboard',
);

const pageEyebrow = computed(() =>
  typeof route.meta.eyebrow === 'string'
    ? route.meta.eyebrow
    : 'Ambiente local',
);

function dashboardNavigationActive(
  section: 'overview' | 'repositories',
): boolean {
  if (route.name !== 'dashboard') {
    return false;
  }

  if (section === 'repositories') {
    return route.hash === '#repositories';
  }

  return route.hash !== '#repositories';
}

onMounted(() => {
  void dashboardStore.ensureDashboardLoaded();
});
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <RouterLink class="brand brand-link" to="/">
        <div class="brand-mark">DD</div>

        <div>
          <strong>Dev Dashboard</strong>
          <span>Local workspace</span>
        </div>
      </RouterLink>

      <nav class="navigation" aria-label="Navegação principal">
        <RouterLink
          class="navigation-item"
          :class="{
            'navigation-item-active':
              dashboardNavigationActive('overview'),
          }"
          :to="{ name: 'dashboard', hash: '#overview' }"
        >
          <span class="navigation-icon">⌂</span>
          Visão geral
        </RouterLink>

        <RouterLink
          class="navigation-item"
          :class="{
            'navigation-item-active':
              dashboardNavigationActive('repositories'),
          }"
          :to="{ name: 'dashboard', hash: '#repositories' }"
        >
          <span class="navigation-icon">◇</span>
          Repositórios
        </RouterLink>

        <RouterLink
          class="navigation-item"
          :class="{ 'navigation-item-active': route.name === 'processes' }"
          :to="{ name: 'processes' }"
        >
          <span class="navigation-icon">▶</span>
          Processos
        </RouterLink>

        <RouterLink
          class="navigation-item"
          :class="{ 'navigation-item-active': route.name === 'activity' }"
          :to="{ name: 'activity' }"
        >
          <span class="navigation-icon">≡</span>
          Atividade
        </RouterLink>
      </nav>

      <div class="sidebar-section">
        <span class="sidebar-label"> Workspace ativo </span>

        <div v-if="selectedWorkspace" class="workspace-summary">
          <span class="workspace-avatar">
            {{ selectedWorkspace.name.charAt(0).toUpperCase() }}
          </span>

          <div>
            <strong>{{ selectedWorkspace.name }}</strong>
            <span>{{ projects.length }} projetos</span>
          </div>
        </div>

        <div v-else class="workspace-summary-empty">
          Nenhum workspace
        </div>
      </div>

      <VisualPreferences />

      <div class="sidebar-footer">
        <span
          class="connection-dot"
          :class="{
            'connection-dot-online': apiConnected,
          }"
        />

        <span>
          API {{ apiConnected ? 'conectada' : 'desconectada' }}
        </span>
      </div>
    </aside>

    <main class="main-content">
      <header class="topbar">
        <div>
          <span class="eyebrow">{{ pageEyebrow }}</span>
          <h1>{{ pageTitle }}</h1>
        </div>

        <div class="topbar-actions">
          <button class="command-button" type="button" disabled>
            Buscar ou executar
            <kbd>⌘ K</kbd>
          </button>

          <div
            class="api-status"
            :class="{
              'api-status-online': apiConnected,
            }"
          >
            <span />
            {{ apiConnected ? 'Online' : 'Offline' }}
          </div>
        </div>
      </header>

      <RouterView />
    </main>
  </div>
</template>
