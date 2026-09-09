<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import type { Project } from '@dev-dashboard/contracts';

import EmptyState from '../components/EmptyState.vue';
import ProjectSecurityCenterPanel from '../components/ProjectSecurityCenterPanel.vue';
import { dashboardStore } from '../stores/dashboard';
import { recordProjectVisit } from '../stores/project-recents';

const route = useRoute();
const project = ref<Project | null>(null);
const loading = ref(true);
const errorMessage = ref('');
let generation = 0;

const projectId = computed(() => {
  const value = route.params.projectId;
  return Array.isArray(value) ? (value[0] ?? '') : String(value ?? '');
});

async function loadProject(): Promise<void> {
  const requestGeneration = ++generation;
  const requestedProjectId = projectId.value;
  loading.value = true;
  errorMessage.value = '';
  project.value = null;

  try {
    const loadedProject = await dashboardStore.ensureProject(requestedProjectId);
    if (requestGeneration !== generation) return;
    project.value = loadedProject;
    if (loadedProject) void recordProjectVisit(loadedProject.id);
  } catch (error) {
    if (requestGeneration === generation) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o projeto.';
    }
  } finally {
    if (requestGeneration === generation) loading.value = false;
  }
}

watch(projectId, () => void loadProject(), { immediate: true });
</script>

<template>
  <section class="content security-center-page">
    <EmptyState
      v-if="loading"
      class="page-empty-state"
      icon="•••"
      title="Carregando projeto"
      description="Preparando o Security Center."
    />

    <EmptyState
      v-else-if="errorMessage"
      class="page-empty-state"
      icon="!"
      title="Não foi possível carregar o projeto"
      :description="errorMessage"
    >
      <template #actions>
        <button class="primary-button" type="button" @click="loadProject">
          Tentar novamente
        </button>
      </template>
    </EmptyState>

    <EmptyState
      v-else-if="!project"
      class="page-empty-state"
      icon="◇"
      title="Projeto não encontrado"
      description="O projeto pode ter sido removido ou o workspace ainda não contém esse identificador."
    >
      <template #actions>
        <RouterLink class="primary-button link-button" to="/">
          Voltar aos projetos
        </RouterLink>
      </template>
    </EmptyState>

    <template v-else>
      <header class="security-center-page-header">
        <div>
          <span>Projeto atual</span>
          <h2>{{ project.name }}</h2>
        </div>
        <RouterLink
          class="secondary-button link-button"
          :to="{ name: 'project-server', params: { projectId: project.id } }"
        >
          Voltar ao projeto
        </RouterLink>
      </header>

      <ProjectSecurityCenterPanel :project="project" />
    </template>
  </section>
</template>

<style scoped>
.security-center-page {
  display: grid;
  gap: var(--space-4);
}

.security-center-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.security-center-page-header h2 {
  margin: var(--space-1) 0 0;
}

.security-center-page-header span {
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

@media (max-width: 720px) {
  .security-center-page-header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
