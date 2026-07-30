<script setup lang="ts">
import {
  computed,
  ref,
  watch,
} from 'vue';

import {
  CodeBracketIcon,
  FolderIcon,
  ShareIcon,
  Squares2X2Icon,
} from '@heroicons/vue/24/outline';

import {
  RouterLink,
  useRoute,
} from 'vue-router';

import type { Project } from '@dev-dashboard/contracts';

import { fetchProjectGit } from '../api';
import ProjectAvatar from '../components/ProjectAvatar.vue';
import ProjectDatabasePanel from '../components/ProjectDatabasePanel.vue';
import ProjectGitPanel from '../components/ProjectGitPanel.vue';
import ProjectLogsPanel from '../components/ProjectLogsPanel.vue';
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

const workspace = computed(() => {
  const workspaceId = project.value?.workspaceId;
  if (!workspaceId) return null;

  return dashboardStore.workspaces.value.find(
    (item) => item.id === workspaceId,
  ) ?? null;
});

const projectSourceLabel = computed(() => {
  if (project.value?.source === 'workspace') return 'Workspace';
  if (project.value?.source === 'standalone') return 'Projeto avulso';
  return 'Origem local';
});

async function loadProject(): Promise<void> {
  const requestedProjectId = projectId.value;
  loading.value = true;
  errorMessage.value = '';
  project.value = null;
  gitBranch.value = '';

  try {
    const loadedProject = await dashboardStore.ensureProject(requestedProjectId);
    if (projectId.value !== requestedProjectId || !loadedProject) return;

    project.value = loadedProject;

    if (loadedProject.capabilities.includes('git')) {
      try {
        const git = await fetchProjectGit(loadedProject.id);
        if (projectId.value === requestedProjectId) {
          gitBranch.value = git.branch ?? '';
        }
      } catch {
        gitBranch.value = '';
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
          <div class="project-details-identity">
            <ProjectAvatar
              :project="project"
              class="project-details-avatar"
            />

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
          </div>

          <div class="project-details-metadata" aria-label="Metadados do projeto">
            <span>
              <FolderIcon aria-hidden="true" />
              {{ workspace?.name ?? 'Sem workspace' }}
            </span>
            <span v-if="gitBranch">
              <ShareIcon aria-hidden="true" />
              {{ gitBranch }}
            </span>
            <span>
              <CodeBracketIcon aria-hidden="true" />
              {{ projectSourceLabel }}
            </span>
            <span>
              <Squares2X2Icon aria-hidden="true" />
              {{ project.capabilities.length }} capacidades
            </span>
          </div>
        </div>

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

      <div v-if="isReadmeRoute" class="project-readme-layout">
        <ProjectReadmePanel
          :key="`readme-${project.id}`"
          :project="project"
        />

        <aside class="project-readme-sidebar">
          <section class="project-summary-card">
            <span class="section-kicker">Resumo do projeto</span>
            <dl>
              <div>
                <dt>Workspace</dt>
                <dd>{{ workspace?.name ?? 'Não associado' }}</dd>
              </div>
              <div>
                <dt>Tipo</dt>
                <dd>{{ projectTypeLabels[project.type] }}</dd>
              </div>
              <div>
                <dt>Origem</dt>
                <dd>{{ project.source }}</dd>
              </div>
              <div>
                <dt>Capacidades</dt>
                <dd>{{ project.capabilities.length }}</dd>
              </div>
            </dl>
          </section>

          <section class="project-quick-links-card">
            <span class="section-kicker">Acessos rápidos</span>
            <RouterLink
              :to="{
                name: 'project-server',
                params: { projectId: project.id },
              }"
            >
              Gerenciar servidor
              <span aria-hidden="true">→</span>
            </RouterLink>
            <RouterLink
              :to="{
                name: 'project-logs',
                params: { projectId: project.id },
              }"
            >
              Acompanhar logs
              <span aria-hidden="true">→</span>
            </RouterLink>
            <RouterLink
              :to="{
                name: 'project-git',
                params: { projectId: project.id },
              }"
            >
              Abrir Git
              <span aria-hidden="true">→</span>
            </RouterLink>
          </section>
        </aside>
      </div>

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
