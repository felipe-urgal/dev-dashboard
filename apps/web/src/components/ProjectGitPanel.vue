<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { GitDiffSnapshot, GitFileDiff, GitFileStatus, Project, ProjectGitOverview } from '@dev-dashboard/contracts';
import { fetchProjectGit, fetchProjectGitDiff, fetchProjectGitFileDiff } from '../api';

const props = defineProps<{ project: Project }>();
const overview = ref<ProjectGitOverview | null>(null);
const diff = ref<GitDiffSnapshot | null>(null);
const selectedFile = ref<string>('');
const fileDiff = ref<GitFileDiff | null>(null);
const loading = ref(false);
const loadingDiff = ref(false);
const loadingFile = ref(false);
const errorMessage = ref('');
const diffErrorMessage = ref('');
const fileErrorMessage = ref('');
let generation = 0;
let diffController: AbortController | undefined;
let fileController: AbortController | undefined;

const statusLabels: Record<GitFileStatus, string> = {
  added: 'Adicionado', modified: 'Modificado', deleted: 'Removido', renamed: 'Renomeado', copied: 'Copiado', untracked: 'Não rastreado', conflicted: 'Conflito', 'type-changed': 'Tipo alterado',
};

const summary = computed(() => {
  const value = overview.value;
  if (!value?.repository) return 'Sem repositório Git';
  if (value.clean) return 'Árvore de trabalho limpa';
  return `${value.files.length} alteração${value.files.length === 1 ? '' : 'ões'}`;
});

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

async function loadGit(): Promise<void> {
  const requestGeneration = ++generation;
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await fetchProjectGit(props.project.id);
    if (requestGeneration === generation) overview.value = result;
  } catch (error) {
    if (requestGeneration === generation) errorMessage.value = error instanceof Error ? error.message : 'Não foi possível consultar o Git.';
  } finally {
    if (requestGeneration === generation) loading.value = false;
  }
}

async function loadDiff(): Promise<void> {
  diffController?.abort();
  const local = new AbortController();
  diffController = local;
  loadingDiff.value = true;
  diffErrorMessage.value = '';
  try {
    const result = await fetchProjectGitDiff(props.project.id, 'combined', local.signal);
    if (local.signal.aborted) return;
    diff.value = result;
  } catch (error) {
    if (local.signal.aborted) return;
    diffErrorMessage.value = error instanceof Error ? error.message : 'Não foi possível consultar o diff.';
    diff.value = null;
  } finally {
    if (!local.signal.aborted) loadingDiff.value = false;
  }
}

async function loadFileDiff(filePath: string): Promise<void> {
  fileController?.abort();
  const local = new AbortController();
  fileController = local;
  selectedFile.value = filePath;
  loadingFile.value = true;
  fileErrorMessage.value = '';
  try {
    const result = await fetchProjectGitFileDiff(props.project.id, filePath, 'combined', local.signal);
    if (local.signal.aborted) return;
    fileDiff.value = result;
  } catch (error) {
    if (local.signal.aborted) return;
    fileErrorMessage.value = error instanceof Error ? error.message : 'Não foi possível carregar o diff do arquivo.';
    fileDiff.value = null;
  } finally {
    if (!local.signal.aborted) loadingFile.value = false;
  }
}

watch(() => props.project.id, () => {
  overview.value = null;
  diff.value = null;
  fileDiff.value = null;
  selectedFile.value = '';
  void loadGit();
  void loadDiff();
}, { immediate: true });

onBeforeUnmount(() => {
  diffController?.abort();
  fileController?.abort();
});
</script>

<template>
  <section class="project-git-panel">
    <header class="git-panel-header">
      <div>
        <span class="section-kicker">Controle de versão</span>
        <h3>Git</h3>
        <p>{{ summary }}</p>
      </div>
      <button type="button" class="secondary-button" :disabled="loading" @click="loadGit">
        {{ loading ? 'Atualizando...' : 'Atualizar' }}
      </button>
    </header>

    <div v-if="errorMessage" class="project-error" role="alert">{{ errorMessage }}</div>
    <div v-else-if="loading && !overview" class="git-empty-state">Consultando repositório...</div>
    <div v-else-if="overview && !overview.repository" class="git-empty-state">
      <strong>Este projeto não é um repositório Git.</strong>
      <span>Nenhum diretório <code>.git</code> foi encontrado.</span>
    </div>

    <template v-else-if="overview">
      <div class="git-metrics-grid">
        <article><span>Branch</span><strong>{{ overview.detached ? 'HEAD destacado' : (overview.branch ?? 'Sem commits') }}</strong><small>{{ overview.upstream ?? 'Sem upstream' }}</small></article>
        <article><span>Estado</span><strong>{{ overview.clean ? 'Limpo' : 'Alterado' }}</strong><small>{{ overview.files.length }} arquivo(s)</small></article>
        <article><span>Sincronização</span><strong>↑ {{ overview.ahead }} · ↓ {{ overview.behind }}</strong><small>ahead / behind</small></article>
      </div>

      <section class="git-section">
        <div class="details-card-heading"><div><span class="section-kicker">Working tree</span><h3>Alterações</h3></div></div>
        <div v-if="overview.files.length === 0" class="git-empty-inline">Nenhuma alteração local.</div>
        <ul v-else class="git-file-list">
          <li v-for="file in overview.files" :key="`${file.path}-${file.previousPath ?? ''}`">
            <span class="git-status-badge" :class="`git-status-${file.status}`">{{ statusLabels[file.status] }}</span>
            <code><template v-if="file.previousPath">{{ file.previousPath }} → </template>{{ file.path }}</code>
            <small>{{ file.indexStatus }}/{{ file.worktreeStatus }}</small>
          </li>
        </ul>
      </section>

      <section class="git-section">
        <div class="details-card-heading">
          <div>
            <span class="section-kicker">Diff</span>
            <h3>Diferenças por arquivo</h3>
          </div>
          <button type="button" class="secondary-button" :disabled="loadingDiff" @click="loadDiff">
            {{ loadingDiff ? 'Atualizando…' : 'Atualizar diff' }}
          </button>
        </div>
        <div v-if="diffErrorMessage" class="project-error" role="alert">{{ diffErrorMessage }}</div>
        <div v-else-if="loadingDiff && !diff" class="git-empty-inline">Carregando diff…</div>
        <div v-else-if="diff && diff.files.length === 0" class="git-empty-inline">Nenhum arquivo alterado desde HEAD.</div>
        <div v-else-if="diff" class="git-diff-layout">
          <ul class="git-diff-files">
            <li v-for="file in diff.files" :key="file.path">
              <button
                type="button"
                class="git-diff-file-button"
                :class="{ 'git-diff-file-button-active': selectedFile === file.path }"
                @click="loadFileDiff(file.path)"
              >
                <span class="git-status-badge" :class="`git-status-${file.status}`">{{ statusLabels[file.status] }}</span>
                <code>{{ file.path }}</code>
                <small v-if="!file.binary">+{{ file.additions }} / −{{ file.deletions }}</small>
                <small v-else>binário</small>
              </button>
            </li>
          </ul>
          <div class="git-diff-viewer">
            <p v-if="fileErrorMessage" class="project-error" role="alert">{{ fileErrorMessage }}</p>
            <p v-else-if="!selectedFile" class="git-empty-inline">Selecione um arquivo para ver o diff.</p>
            <p v-else-if="loadingFile" class="git-empty-inline">Carregando diff de {{ selectedFile }}…</p>
            <template v-else-if="fileDiff">
              <p v-if="fileDiff.binary" class="git-empty-inline">Diff binário não é exibido inline.</p>
              <template v-else>
                <p v-if="fileDiff.masked" class="project-log-redaction-warning">
                  Segredos detectados foram mascarados no diff exibido.
                </p>
                <p v-if="fileDiff.truncated" class="project-log-redaction-warning">
                  Diff maior que o limite de leitura — mostrando o início.
                </p>
                <pre class="git-diff-content">{{ fileDiff.content || 'Diff vazio.' }}</pre>
              </template>
            </template>
          </div>
        </div>
      </section>

      <section class="git-section">
        <div class="details-card-heading"><div><span class="section-kicker">Histórico</span><h3>Commits recentes</h3></div></div>
        <div v-if="overview.recentCommits.length === 0" class="git-empty-inline">O repositório ainda não possui commits.</div>
        <ol v-else class="git-commit-list">
          <li v-for="commit in overview.recentCommits" :key="commit.hash">
            <code>{{ commit.shortHash }}</code>
            <div><strong>{{ commit.subject }}</strong><span>{{ commit.authorName }} · {{ formatDate(commit.authoredAt) }}</span></div>
          </li>
        </ol>
      </section>
    </template>
  </section>
</template>
