<script setup lang="ts">
import Card from '../components/Card.vue';
import ProjectCard from '../components/ProjectCard.vue';
import { dashboardStore } from '../stores/dashboard';

const {
  projects,
  loadingProjects,
  errorMessage,
  successMessage,
  warningCount,
  lastScannedPath,
  railsProjects,
  nodeProjects,
  gitProjects,
  sortedProjects,
} = dashboardStore;
</script>

<template>
  <section id="overview" class="content">
    <div v-if="errorMessage" class="alert alert-error" role="alert">
      <strong>Não foi possível concluir a ação.</strong>
      <span>{{ errorMessage }}</span>
    </div>

    <div v-if="successMessage" class="alert alert-success" role="status">
      <strong>Ação concluída.</strong>
      <span>{{ successMessage }}</span>
    </div>

    <div v-if="warningCount > 0" class="alert alert-warning">
      <strong>Scan concluído com avisos.</strong>
      <span>
        {{ warningCount }} diretório(s) não puderam ser analisados.
      </span>
    </div>

    <div v-if="lastScannedPath" class="scan-result">
      Workspace carregado:
      <code>{{ lastScannedPath }}</code>
    </div>

    <section class="metrics-grid" aria-label="Resumo dos projetos">
      <Card tag="article" class="metric-card">
        <span class="metric-label">Repositórios</span>
        <strong>{{ projects.length }}</strong>
        <span class="metric-detail">projetos detectados</span>
      </Card>

      <Card tag="article" class="metric-card">
        <span class="metric-label">Rails</span>
        <strong>{{ railsProjects }}</strong>
        <span class="metric-detail">aplicações Ruby</span>
      </Card>

      <Card tag="article" class="metric-card">
        <span class="metric-label">Node</span>
        <strong>{{ nodeProjects }}</strong>
        <span class="metric-detail">aplicações JavaScript</span>
      </Card>

      <Card tag="article" class="metric-card">
        <span class="metric-label">Git</span>
        <strong>{{ gitProjects }}</strong>
        <span class="metric-detail">repositórios versionados</span>
      </Card>
    </section>

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
