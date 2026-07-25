<script setup lang="ts">
import {
  computed,
  ref,
  watch,
} from 'vue';

import {
  RouterLink,
  useRoute,
} from 'vue-router';

import type { Project } from '@dev-dashboard/contracts';

import ProjectAvatar from '../components/ProjectAvatar.vue';
import ProjectServerPanel from '../components/ProjectServerPanel.vue';
import ProjectGitPanel from '../components/ProjectGitPanel.vue';
import ProjectTestsPanel from '../components/ProjectTestsPanel.vue';
import ProjectDatabasePanel from '../components/ProjectDatabasePanel.vue';
import ProjectScriptsPanel from '../components/ProjectScriptsPanel.vue';
import { dashboardStore } from '../stores/dashboard';

import {
  capabilityLabel,
  projectTypeLabels,
} from '../utils/project-labels';

const route = useRoute();

const project = ref<Project | null>(null);
const loading = ref(true);
const errorMessage = ref('');

const projectId = computed(() => {
  const value = route.params.projectId;
  return Array.isArray(value) ? value[0] ?? '' : String(value ?? '');
});

const isGitRoute = computed(() => route.name === 'project-git');
const isTestsRoute = computed(() => route.name === 'project-tests');
const isDatabaseRoute = computed(() => route.name === 'project-database');
const isScriptsRoute = computed(() => route.name === 'project-scripts');

const workspace = computed(() => {
  const workspaceId = project.value?.workspaceId;
  if (!workspaceId) {
    return null;
  }

  return dashboardStore.workspaces.value.find(
    (item) => item.id === workspaceId,
  ) ?? null;
});

async function loadProject(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  project.value = null;

  try {
    project.value = await dashboardStore.ensureProject(projectId.value);
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível carregar o projeto.';
  } finally {
    loading.value = false;
  }
}

watch(projectId, () => {
  void loadProject();
}, {
  immediate: true,
});
</script>

<template>
  <section class="content project-details-page">
    <RouterLink class="details-back-link" to="/">
      ← Voltar à visão geral
    </RouterLink>

    <div v-if="loading" class="empty-state page-empty-state">
      <div class="empty-icon">•••</div>
      <h3>Carregando projeto</h3>
      <p>Localizando o repositório e suas configurações.</p>
    </div>

    <div v-else-if="errorMessage" class="empty-state page-empty-state">
      <div class="empty-icon">!</div>
      <h3>Não foi possível carregar o projeto</h3>
      <p>{{ errorMessage }}</p>
      <button class="primary-button" type="button" @click="loadProject">
        Tentar novamente
      </button>
    </div>

    <div v-else-if="!project" class="empty-state page-empty-state">
      <div class="empty-icon">◇</div>
      <h3>Projeto não encontrado</h3>
      <p>
        O projeto pode ter sido removido ou o workspace ainda não
        contém esse identificador.
      </p>
      <RouterLink class="primary-button link-button" to="/">
        Voltar aos projetos
      </RouterLink>
    </div>

    <template v-else>
      <header class="project-details-hero">
        <div class="project-details-identity">
          <ProjectAvatar
            :project="project"
            class="project-details-avatar"
          />

          <div>
            <div class="project-details-badges">
              <span
                class="type-badge"
                :class="`type-badge-${project.type}`"
              >
                {{ projectTypeLabels[project.type] }}
              </span>
              <span>{{ workspace?.name ?? project.source }}</span>
            </div>

            <h2>{{ project.name }}</h2>
            <code>{{ project.path }}</code>
          </div>
        </div>

        <div class="capabilities project-details-capabilities">
          <span
            v-for="capability in project.capabilities"
            :key="capability"
            class="capability"
          >
            {{ capabilityLabel(capability) }}
          </span>
        </div>
      </header>

      <nav class="project-details-tabs" aria-label="Áreas do projeto">
        <RouterLink
          class="project-details-tab"
          :class="{ 'project-details-tab-active': !isGitRoute && !isTestsRoute && !isDatabaseRoute && !isScriptsRoute }"
          :to="{ name: 'project-details', params: { projectId: project.id } }"
        >
          Visão geral
        </RouterLink>
        <a v-if="!isGitRoute && !isTestsRoute && !isDatabaseRoute && !isScriptsRoute" class="project-details-tab" href="#server">Servidor</a>
        <a v-if="!isGitRoute && !isTestsRoute && !isDatabaseRoute && !isScriptsRoute" class="project-details-tab" href="#logs">Logs</a>
        <RouterLink
          class="project-details-tab"
          :class="{ 'project-details-tab-active': isGitRoute }"
          :to="{ name: 'project-git', params: { projectId: project.id } }"
        >
          Git
        </RouterLink>
        <RouterLink
          class="project-details-tab"
          :class="{ 'project-details-tab-active': isTestsRoute }"
          :to="{ name: 'project-tests', params: { projectId: project.id } }"
        >
          Testes
        </RouterLink>
        <RouterLink class="project-details-tab" :class="{ 'project-details-tab-active': isDatabaseRoute }" :to="{ name: 'project-database', params: { projectId: project.id } }">Banco de dados</RouterLink>
        <RouterLink class="project-details-tab" :class="{ 'project-details-tab-active': isScriptsRoute }" :to="{ name: 'project-scripts', params: { projectId: project.id } }">Scripts</RouterLink>
      </nav>

      <ProjectGitPanel v-if="isGitRoute" :key="`git-${project.id}`" :project="project" />
      <ProjectTestsPanel v-else-if="isTestsRoute" :key="`tests-${project.id}`" :project="project" />
      <ProjectDatabasePanel v-else-if="isDatabaseRoute" :key="`database-${project.id}`" :project="project" />
      <ProjectScriptsPanel v-else-if="isScriptsRoute" :key="`scripts-${project.id}`" :project="project" />

      <div v-else class="project-details-grid">
        <section id="overview" class="details-card">
          <div class="details-card-heading">
            <div>
              <span class="section-kicker">Visão geral</span>
              <h3>Informações do projeto</h3>
            </div>
          </div>

          <dl class="project-metadata-list">
            <div>
              <dt>Tipo</dt>
              <dd>{{ projectTypeLabels[project.type] }}</dd>
            </div>
            <div>
              <dt>Origem</dt>
              <dd>{{ project.source }}</dd>
            </div>
            <div>
              <dt>Workspace</dt>
              <dd>{{ workspace?.name ?? 'Não associado' }}</dd>
            </div>
            <div>
              <dt>Capacidades</dt>
              <dd>{{ project.capabilities.length }}</dd>
            </div>
          </dl>
        </section>

        <section id="server" class="details-card project-server-card">
          <div class="details-card-heading">
            <div>
              <span class="section-kicker">Execução</span>
              <h3>Servidor e logs</h3>
            </div>
          </div>

          <div id="logs">
            <ProjectServerPanel
              :key="project.id"
              :project="project"
              mode="details"
              :default-logs-open="true"
            />
          </div>
        </section>
      </div>
    </template>
  </section>
</template>
