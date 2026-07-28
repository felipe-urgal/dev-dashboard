<script setup lang="ts">
import Card from '../components/Card.vue';
import ProjectCard from '../components/ProjectCard.vue';
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

      <ul v-else class="projects-list">
        <ProjectCard
          v-for="project in sortedProjects"
          :key="project.id"
          :project="project"
        />
      </ul>
    </Card>
  </section>
</template>
