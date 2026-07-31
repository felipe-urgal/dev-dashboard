<script setup lang="ts">
import {
  computed,
  ref,
  watch,
} from 'vue';

import {
  ShareIcon,
} from '@heroicons/vue/24/outline';

import {
  RouterLink,
  useRoute,
} from 'vue-router';

import type {
  Project,
  ProjectGitOverview,
} from '@dev-dashboard/contracts';

import { fetchProjectGit } from '../api';
import ProjectDatabasePanel from '../components/ProjectDatabasePanel.vue';
import ProjectGitPanel from '../components/ProjectGitPanel.vue';
import ProjectLogsPanel from '../components/ProjectLogsPanel.vue';
import ProjectPullRequestSummary from '../components/ProjectPullRequestSummary.vue';
import ProjectReadmePanel from '../components/ProjectReadmePanel.vue';
import ProjectScriptsPanel from '../components/ProjectScriptsPanel.vue';
import ProjectServerPanel from '../components/ProjectServerPanel.vue';
import ProjectTestsPanel from '../components/ProjectTestsPanel.vue';
import { dashboardStore } from '../stores/dashboard';
import { projectTypeLabels } from '../utils/project-labels';

const route = useRoute();

const project = ref<Project | null>(null);
const loading = ref(true);
const errorMessage = ref('');
const gitBranch = ref('');
const gitOverview = ref<ProjectGitOverview | null>(null);

const projectId = computed(() => {
  const value = route.params.projectId;
  return Array.isArray(value) ? value[0] ?? '' : String(value ?? '');
});

const isReadmeRoute = computed(() => route.name === 'project-details');
const isServerRoute = computed(() => route.name === 'project-server');
const isLogsRoute = computed(() => route.name === 'project-logs');
const isGitRoute = computed(() => route.name === 'project-git');
const isTestsRoute = computed(() => route.name === 'project-tests');
const isDatabaseRoute = computed(() => route.name === 'project-database');
const isScriptsRoute = computed(() => route.name === 'project-scripts');

function updateGitOverview(git: ProjectGitOverview): void {
  gitBranch.value = git.branch ?? '';
  gitOverview.value = git;
}

async function loadProject(): Promise<void> {
  const requestedProjectId = projectId.value;
  loading.value = true;
  errorMessage.value = '';
  project.value = null;
  gitBranch.value = '';
  gitOverview.value = null;

  try {
    const loadedProject = await dashboardStore.ensureProject(requestedProjectId);
    if (projectId.value !== requestedProjectId || !loadedProject) return;

    project.value = loadedProject;

    if (loadedProject.capabilities.includes('git')) {
      try {
        const git = await fetchProjectGit(loadedProject.id);
        if (projectId.value === requestedProjectId) {
          updateGitOverview(git);
        }
      } catch {
        gitBranch.value = '';
        gitOverview.value = null;
      }
    }
  } catch (error) {
    if (projectId.value === requestedProjectId) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o projeto.';
    }
  } finally {
    if (projectId.value === requestedProjectId) {
      loading.value = false;
    }
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
      ← Voltar aos projetos
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
        O projeto pode ter sido removido ou o workspace ainda não contém esse
        identificador.
      </p>
      <RouterLink class="primary-button link-button" to="/">
        Voltar aos projetos
      </RouterLink>
    </div>

    <template v-else>
      <header class="project-details-hero">
        <div class="project-details-main">
          <div class="project-details-copy">
            <div class="project-title-row">
              <h2>{{ project.name }}</h2>
              <span
                class="type-badge"
                :class="`type-badge-${project.type}`"
              >
                {{ projectTypeLabels[project.type] }}
              </span>
            </div>
            <code>{{ project.path }}</code>
          </div>

          <div
            v-if="gitBranch"
            class="project-details-branch"
            aria-label="Branch atual"
          >
            <span>
              <ShareIcon aria-hidden="true" />
              {{ gitBranch }}
            </span>
          </div>
        </div>

        <ProjectPullRequestSummary
          v-if="gitOverview"
          :project-id="project.id"
          :overview="gitOverview"
        />
      </header>

      <nav class="project-details-tabs" aria-label="Áreas do projeto">
        <RouterLink
          class="project-details-tab"
          :class="{ 'project-details-tab-active': isReadmeRoute }"
          :to="{ name: 'project-details', params: { projectId: project.id } }"
        >
          README
        </RouterLink>

        <RouterLink
          class="project-details-tab"
          :class="{ 'project-details-tab-active': isServerRoute }"
          :to="{ name: 'project-server', params: { projectId: project.id } }"
        >
          Servidor
        </RouterLink>

        <RouterLink
          class="project-details-tab"
          :class="{ 'project-details-tab-active': isLogsRoute }"
          :to="{ name: 'project-logs', params: { projectId: project.id } }"
        >
          Logs
        </RouterLink>

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

        <RouterLink
          class="project-details-tab"
          :class="{ 'project-details-tab-active': isDatabaseRoute }"
          :to="{
            name: 'project-database',
            params: { projectId: project.id },
          }"
        >
          Banco de dados
        </RouterLink>

        <RouterLink
          class="project-details-tab"
          :class="{ 'project-details-tab-active': isScriptsRoute }"
          :to="{ name: 'project-scripts', params: { projectId: project.id } }"
        >
          Scripts
        </RouterLink>
      </nav>

      <ProjectReadmePanel
        v-if="isReadmeRoute"
        :key="`readme-${project.id}`"
        :project="project"
      />

      <ProjectServerPanel
        v-else-if="isServerRoute"
        :key="`server-${project.id}`"
        :project="project"
      />

      <ProjectLogsPanel
        v-else-if="isLogsRoute"
        :key="`logs-${project.id}`"
        :project="project"
      />

      <ProjectGitPanel
        v-else-if="isGitRoute"
        :key="`git-${project.id}`"
        :project="project"
        @git-updated="updateGitOverview"
      />

      <ProjectTestsPanel
        v-else-if="isTestsRoute"
        :key="`tests-${project.id}`"
        :project="project"
      />

      <ProjectDatabasePanel
        v-else-if="isDatabaseRoute"
        :key="`database-${project.id}`"
        :project="project"
      />

      <ProjectScriptsPanel
        v-else-if="isScriptsRoute"
        :key="`scripts-${project.id}`"
        :project="project"
      />
    </template>
  </section>
</template>

<style scoped src="./ProjectDetailsView.css"></style>
