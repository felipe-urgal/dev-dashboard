<script setup lang="ts">
import {
  computed,
  ref,
} from 'vue';
import {
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';

import type { ProjectType } from '@dev-dashboard/contracts';

import Card from '../components/Card.vue';
import ProjectCard from '../components/ProjectCard.vue';
import { useAutoDismiss } from '../composables/useAutoDismiss';
import { dashboardStore } from '../stores/dashboard';

const {
  projects,
  loadingProjects,
  scanningWorkspace,
  deletingWorkspace,
  errorMessage,
  successMessage,
  warningCount,
  lastScannedPath,
  sortedProjects,
  scanSelectedWorkspace,
  handleDeleteWorkspace,
} = dashboardStore;

useAutoDismiss(errorMessage, '');
useAutoDismiss(successMessage, '');
useAutoDismiss(warningCount, 0);

type ProjectFilter = 'all' | ProjectType;

const projectSearch = ref('');
const projectFilter = ref<ProjectFilter>('all');

const projectTypeFilters: Array<{
  value: ProjectFilter;
  label: string;
}> = [
  { value: 'all', label: 'Todos' },
  { value: 'rails', label: 'Rails' },
  { value: 'node', label: 'Node' },
];

const normalizedProjectSearch = computed(() =>
  projectSearch.value.trim().toLocaleLowerCase('pt-BR'),
);

const filteredProjects = computed(() =>
  sortedProjects.value.filter((project) => {
    const matchesType =
      projectFilter.value === 'all' ||
      project.type === projectFilter.value;
    const matchesSearch =
      normalizedProjectSearch.value.length === 0 ||
      project.name
        .toLocaleLowerCase('pt-BR')
        .includes(normalizedProjectSearch.value) ||
      project.path
        .toLocaleLowerCase('pt-BR')
        .includes(normalizedProjectSearch.value);

    return matchesType && matchesSearch;
  }),
);

const hasActiveProjectFilters = computed(
  () =>
    projectFilter.value !== 'all' ||
    normalizedProjectSearch.value.length > 0,
);

function clearProjectFilters(): void {
  projectSearch.value = '';
  projectFilter.value = 'all';
}
</script>

<template>
  <section id="overview" class="content">
    <div v-if="errorMessage" class="alert alert-error" role="alert">
      <div class="alert-body">
        <strong>Não foi possível concluir a ação.</strong>
        <span>{{ errorMessage }}</span>
      </div>
      <button
        type="button"
        class="alert-dismiss"
        aria-label="Fechar aviso"
        @click="errorMessage = ''"
      >
        ×
      </button>
    </div>

    <div v-if="successMessage" class="alert alert-success" role="status">
      <div class="alert-body">
        <strong>Ação concluída.</strong>
        <span>{{ successMessage }}</span>
      </div>
      <button
        type="button"
        class="alert-dismiss"
        aria-label="Fechar aviso"
        @click="successMessage = ''"
      >
        ×
      </button>
    </div>

    <div v-if="warningCount > 0" class="alert alert-warning">
      <div class="alert-body">
        <strong>Scan concluído com avisos.</strong>
        <span>
          {{ warningCount }} diretório(s) não puderam ser analisados.
        </span>
      </div>
      <button
        type="button"
        class="alert-dismiss"
        aria-label="Fechar aviso"
        @click="warningCount = 0"
      >
        ×
      </button>
    </div>

    <div v-if="lastScannedPath" class="scan-result">
      <span>
        Workspace carregado:
        <code>{{ lastScannedPath }}</code>
      </span>

      <div class="workspace-actions">
        <button
          class="secondary-button"
          type="button"
          :disabled="scanningWorkspace"
          @click="scanSelectedWorkspace"
        >
          {{ scanningWorkspace ? 'Escaneando...' : 'Escanear novamente' }}
        </button>

        <button
          class="danger-button"
          type="button"
          :disabled="deletingWorkspace"
          @click="handleDeleteWorkspace"
        >
          {{ deletingWorkspace ? 'Removendo...' : 'Remover' }}
        </button>
      </div>
    </div>

    <Card id="repositories" class="repositories-section">
      <template #header>
        <div>
          <span class="section-kicker">Repositórios</span>
          <h2>Projetos detectados</h2>
        </div>
      </template>
      <template #actions>
        <span class="section-count">
          {{ projects.length }}
          {{ projects.length === 1 ? 'projeto' : 'projetos' }}
        </span>
      </template>

      <div
        v-if="!loadingProjects && sortedProjects.length > 0"
        class="projects-toolbar"
      >
        <div class="project-search">
          <label class="sr-only" for="project-search-input">
            Buscar projetos
          </label>
          <MagnifyingGlassIcon aria-hidden="true" />
          <input
            id="project-search-input"
            v-model="projectSearch"
            type="search"
            placeholder="Buscar por nome ou caminho"
          />
          <button
            v-if="projectSearch"
            type="button"
            aria-label="Limpar busca"
            @click="projectSearch = ''"
          >
              <XMarkIcon aria-hidden="true" />
          </button>
        </div>

        <div class="project-type-filters" aria-label="Filtrar por tecnologia">
          <button
            v-for="filter in projectTypeFilters"
            :key="filter.value"
            type="button"
            :class="{ active: projectFilter === filter.value }"
            :aria-pressed="projectFilter === filter.value"
            @click="projectFilter = filter.value"
          >
            {{ filter.label }}
          </button>
        </div>
      </div>

      <div v-if="loadingProjects" class="empty-state">
        <div class="empty-icon">•••</div>
        <h3>Carregando projetos</h3>
        <p>Consultando a API local.</p>
      </div>

      <div
        v-else-if="sortedProjects.length === 0"
        class="empty-state"
      >
        <div class="empty-icon">◇</div>
        <h3>Nenhum projeto carregado</h3>
        <p>
          Cadastre ou selecione um workspace na barra lateral para
          detectar aplicações Rails e Node.
        </p>
      </div>

      <div
        v-else-if="filteredProjects.length === 0"
        class="empty-state empty-state-filtered"
      >
        <MagnifyingGlassIcon class="empty-state-icon" aria-hidden="true" />
        <h3>Nenhum projeto encontrado</h3>
        <p>Tente outro nome ou remova os filtros aplicados.</p>
        <button
          v-if="hasActiveProjectFilters"
          type="button"
          class="secondary-button"
          @click="clearProjectFilters"
        >
          Limpar filtros
        </button>
      </div>

      <ul v-else class="projects-list">
        <ProjectCard
          v-for="project in filteredProjects"
          :key="project.id"
          :project="project"
        />
      </ul>
    </Card>
  </section>
</template>
