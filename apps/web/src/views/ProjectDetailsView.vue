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

import ProjectServerPanel from '../components/ProjectServerPanel.vue';
import { dashboardStore } from '../stores/dashboard';

import {
  capabilityLabel,
  projectInitials,
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
          <div class="project-avatar project-details-avatar">
            {{ projectInitials(project.name) }}
          </div>

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
        <a class="project-details-tab project-details-tab-active" href="#overview">
          Visão geral
        </a>
        <a class="project-details-tab" href="#server">Servidor</a>
        <a class="project-details-tab" href="#logs">Logs</a>
        <span class="project-details-tab project-details-tab-disabled">Git</span>
        <span class="project-details-tab project-details-tab-disabled">Testes</span>
      </nav>

      <div class="project-details-grid">
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
