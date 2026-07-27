<script setup lang="ts">
import { ref } from 'vue';

import Card from '../components/Card.vue';
import ProjectCard from '../components/ProjectCard.vue';
import StatusBadge from '../components/StatusBadge.vue';
import WorkspaceDirectoryPicker from '../components/WorkspaceDirectoryPicker.vue';
import { dashboardStore } from '../stores/dashboard';

const directoryPickerOpen = ref(false);
const activePrototype = ref<'orbital' | 'terminal' | 'aurora'>('orbital');

const prototypes = [
  {
    id: 'orbital' as const,
    number: '01',
    name: 'Órbita',
    description: 'Central espacial e panorâmica',
  },
  {
    id: 'terminal' as const,
    number: '02',
    name: 'Terminal',
    description: 'Denso, técnico e operacional',
  },
  {
    id: 'aurora' as const,
    number: '03',
    name: 'Aurora',
    description: 'Calmo, fluido e ambiental',
  },
];

const {
  projects,
  workspaces,
  selectedWorkspaceId,
  newWorkspaceName,
  newWorkspacePath,
  loadingProjects,
  scanningWorkspace,
  creatingWorkspace,
  deletingWorkspace,
  errorMessage,
  successMessage,
  warningCount,
  lastScannedPath,
  selectedWorkspace,
  railsProjects,
  nodeProjects,
  gitProjects,
  sortedProjects,
  scanSelectedWorkspace,
  handleWorkspaceSelection,
  handleCreateWorkspace,
  handleDeleteWorkspace,
} = dashboardStore;
</script>

<template>
  <section id="overview" class="content">
    <header class="prototype-heading">
      <div>
        <span class="section-kicker">Laboratório de interface / 2026</span>
        <h2>Escolha sua central de comando.</h2>
        <p>Três direções para a nova home, conectadas aos seus dados locais.</p>
      </div>

      <div class="prototype-switcher" role="tablist" aria-label="Protótipos da home">
        <button
          v-for="prototype in prototypes"
          :key="prototype.id"
          type="button"
          role="tab"
          :aria-selected="activePrototype === prototype.id"
          :class="{ 'prototype-option-active': activePrototype === prototype.id }"
          @click="activePrototype = prototype.id"
        >
          <span>{{ prototype.number }}</span>
          <strong>{{ prototype.name }}</strong>
          <small>{{ prototype.description }}</small>
        </button>
      </div>
    </header>

    <div class="prototype-stage" :class="`prototype-${activePrototype}`">
      <section v-if="activePrototype === 'orbital'" class="orbital-hero">
        <div class="orbital-copy">
          <span class="prototype-signal"><i /> SISTEMA LOCAL OPERANTE</span>
          <h2>Todo o seu universo de código, <em>em órbita.</em></h2>
          <p>Observe projetos, processos e sinais do seu ambiente em uma única estação.</p>
          <a class="prototype-cta" href="#repositories">Explorar repositórios <span>↗</span></a>
        </div>
        <div class="orbit-map" aria-hidden="true">
          <span class="orbit-ring orbit-ring-one" />
          <span class="orbit-ring orbit-ring-two" />
          <span class="orbit-ring orbit-ring-three" />
          <span class="orbit-core">DD<small>núcleo</small></span>
          <span class="orbit-node orbit-node-rails">Rb</span>
          <span class="orbit-node orbit-node-node">Js</span>
          <span class="orbit-node orbit-node-git">Git</span>
        </div>
        <div class="orbital-metrics">
          <div><span>Projetos</span><strong>{{ projects.length.toString().padStart(2, '0') }}</strong></div>
          <div><span>Rails</span><strong>{{ railsProjects.toString().padStart(2, '0') }}</strong></div>
          <div><span>Node</span><strong>{{ nodeProjects.toString().padStart(2, '0') }}</strong></div>
          <div><span>Git</span><strong>{{ gitProjects.toString().padStart(2, '0') }}</strong></div>
        </div>
      </section>

      <section v-else-if="activePrototype === 'terminal'" class="terminal-hero">
        <div class="terminal-bar">
          <span><i /> dev-dashboard://overview</span>
          <span>27 JUL 2026&nbsp;&nbsp;·&nbsp;&nbsp;UTC</span>
        </div>
        <div class="terminal-body">
          <div class="terminal-copy">
            <span class="terminal-command">$ dashboard status --all</span>
            <h2>CONTROLE TOTAL.<br><b>ZERO RUÍDO.</b></h2>
            <p>// telemetria local para quem prefere informação em alta densidade.</p>
          </div>
          <div class="terminal-data" aria-label="Telemetria de projetos">
            <div><span>REPOSITÓRIOS</span><strong>{{ projects.length }}</strong><small>INDEXADOS</small></div>
            <div><span>RAILS_APPS</span><strong>{{ railsProjects }}</strong><small>DETECTADAS</small></div>
            <div><span>NODE_APPS</span><strong>{{ nodeProjects }}</strong><small>DETECTADAS</small></div>
            <div><span>GIT_READY</span><strong>{{ gitProjects }}</strong><small>REPOSITÓRIOS</small></div>
          </div>
        </div>
        <div class="terminal-ticker"><span>● API LOCAL</span><span>WORKSPACE: {{ selectedWorkspace?.name ?? 'NÃO DEFINIDO' }}</span><span>LATÊNCIA: &lt;1MS</span><span>CRIPTOGRAFIA: ATIVA</span></div>
      </section>

      <section v-else class="aurora-hero">
        <div class="aurora-glow" aria-hidden="true" />
        <div class="aurora-copy">
          <span class="aurora-pill">✦ AMBIENTE SINCRONIZADO</span>
          <h2>Seu espaço para<br><em>criar sem atrito.</em></h2>
          <p>Uma visão tranquila do que está vivo no seu ecossistema local.</p>
          <a class="aurora-action" href="#repositories">Ver projetos <span>→</span></a>
        </div>
        <div class="aurora-dashboard">
          <div class="aurora-status-card">
            <span>Visão do ambiente</span><strong>{{ projects.length }} projetos</strong>
            <div class="aurora-bars"><i /><i /><i /><i /><i /></div>
          </div>
          <div class="aurora-chips">
            <span>Ruby <b>{{ railsProjects }}</b></span>
            <span>Node <b>{{ nodeProjects }}</b></span>
            <span>Git <b>{{ gitProjects }}</b></span>
          </div>
        </div>
      </section>
    </div>

    <div class="home-control-grid">

      <Card class="workspace-panel">
        <template #header>
          <div>
            <span class="section-kicker">Workspaces</span>
            <h3>Gerenciar projetos locais</h3>
          </div>
        </template>
        <template #actions>
          <StatusBadge tone="neutral">Somente local</StatusBadge>
        </template>

        <template v-if="workspaces.length > 0">
          <label class="workspace-field">
            <span>Workspace ativo</span>
            <select
              :value="selectedWorkspaceId"
              :disabled="scanningWorkspace"
              @change="handleWorkspaceSelection"
            >
              <option
                v-for="workspace in workspaces"
                :key="workspace.id"
                :value="workspace.id"
              >
                {{ workspace.name }}
              </option>
            </select>
          </label>

          <code v-if="selectedWorkspace" class="workspace-path">
            {{ selectedWorkspace.path }}
          </code>

          <div class="workspace-actions">
            <button
              class="primary-button"
              type="button"
              :disabled="scanningWorkspace"
              @click="scanSelectedWorkspace"
            >
              {{
                scanningWorkspace
                  ? 'Escaneando...'
                  : 'Escanear novamente'
              }}
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

          <div class="workspace-divider">
            Adicionar outro workspace
          </div>
        </template>

        <div v-else class="workspace-empty">
          Nenhum workspace foi cadastrado.
        </div>

        <form
          class="workspace-create-form"
          @submit.prevent="handleCreateWorkspace"
        >
          <label class="workspace-field">
            <span>Nome</span>
            <input
              v-model="newWorkspaceName"
              autocomplete="off"
              placeholder="Projetos pessoais"
            />
          </label>

          <label class="workspace-field">
            <span>Caminho local</span>
            <div class="workspace-path-picker-field">
              <input
                v-model="newWorkspacePath"
                autocomplete="off"
                placeholder="/home/usuario/projetos"
              />

              <button
                type="button"
                class="secondary-button"
                @click="directoryPickerOpen = true"
              >
                Escolher pasta
              </button>
            </div>
          </label>

          <button
            class="secondary-primary-button"
            type="submit"
            :disabled="creatingWorkspace"
          >
            {{
              creatingWorkspace
                ? 'Cadastrando...'
                : 'Adicionar workspace'
            }}
          </button>
        </form>
      </Card>

      <Card class="home-note-card">
        <span class="section-kicker">Princípio do protótipo</span>
        <h3>Futurista, sem perder o foco.</h3>
        <p>As três propostas preservam as ações reais do produto e variam apenas a hierarquia, o ritmo e a atmosfera visual.</p>
        <dl>
          <div><dt>Dados</dt><dd>100% locais</dd></div>
          <div><dt>Interface</dt><dd>3 direções</dd></div>
          <div><dt>Estado</dt><dd>Em exploração</dd></div>
        </dl>
      </Card>
    </div>

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

    <section class="metrics-grid home-metrics-grid" aria-label="Resumo dos projetos">
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
          Cadastre ou selecione um workspace para detectar
          aplicações Rails e Node.
        </p>
      </div>

      <div v-else class="projects-grid">
        <ProjectCard
          v-for="project in sortedProjects"
          :key="project.id"
          :project="project"
        />
      </div>
    </Card>
    <WorkspaceDirectoryPicker
      v-model="newWorkspacePath"
      :open="directoryPickerOpen"
      @close="directoryPickerOpen = false"
    />
  </section>
</template>
