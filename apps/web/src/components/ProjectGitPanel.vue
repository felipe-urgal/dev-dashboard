<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue';

import type {
  GitDiffSnapshot,
  GitFileDiff,
  GitFileStatus,
  GitRemote,
  GitTrackingComparison,
  Project,
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

import {
  commitProjectGit,
  createProjectGitBranch,
  fetchProjectGit,
  fetchProjectGitDiff,
  fetchProjectGitFileDiff,
  prepareProjectGitMutation,
  pullProjectGitBranch,
  pushProjectGitBranch,
  saveProjectGit,
  stashPopProjectGit,
  stashPushProjectGit,
  switchProjectGitBranch,
} from '../api';
import {
  fetchProjectGitRemote,
  fetchProjectGitWorkspace,
  prepareProjectGitTrackingBranch,
  trackProjectGitBranch,
} from '../api/git-workspace';
import { useAutoDismiss } from '../composables/useAutoDismiss';
import { gitFileToneFor } from '../utils/status-tones';
import ProjectGitBranchesPage from './ProjectGitBranchesPage.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ project: Project }>();

type GitTab = 'summary' | 'branches' | 'sync' | 'commit' | 'stash' | 'diff' | 'history';

const tabs: Array<{ id: GitTab; label: string }> = [
  { id: 'summary', label: 'Resumo' },
  { id: 'branches', label: 'Branches' },
  { id: 'sync', label: 'Sincronização' },
  { id: 'commit', label: 'Commit' },
  { id: 'stash', label: 'Stash' },
  { id: 'diff', label: 'Diff' },
  { id: 'history', label: 'Histórico' },
];

const activeTab = ref<GitTab>('summary');
const overview = ref<ProjectGitOverview | null>(null);
const workspace = ref<ProjectGitWorkspace | null>(null);
const diff = ref<GitDiffSnapshot | null>(null);
const selectedFile = ref('');
const fileDiff = ref<GitFileDiff | null>(null);
const loading = ref(false);
const loadingWorkspace = ref(false);
const loadingDiff = ref(false);
const loadingFile = ref(false);
const errorMessage = ref('');
const workspaceErrorMessage = ref('');
const diffErrorMessage = ref('');
const fileErrorMessage = ref('');
const mutationRunning = ref(false);
const mutationMessage = ref('');
const mutationErrorMessage = ref('');
const remoteRefreshing = ref('');
const createBranchName = ref('');
const switchBranchName = ref('');
const commitMessage = ref('');
const commitIncludeAllChanges = ref(false);
const saveMessage = ref('');
let generation = 0;
let diffController: AbortController | undefined;
let fileController: AbortController | undefined;

useAutoDismiss(errorMessage, '');
useAutoDismiss(workspaceErrorMessage, '');
useAutoDismiss(diffErrorMessage, '');
useAutoDismiss(fileErrorMessage, '');
useAutoDismiss(mutationMessage, '');
useAutoDismiss(mutationErrorMessage, '');

const statusLabels: Record<GitFileStatus, string> = {
  added: 'Adicionado',
  modified: 'Modificado',
  deleted: 'Removido',
  renamed: 'Renomeado',
  copied: 'Copiado',
  untracked: 'Não rastreado',
  conflicted: 'Conflito',
  'type-changed': 'Tipo alterado',
};

const localBranches = computed(() =>
  workspace.value?.branches.filter((branch) => branch.kind === 'local') ?? [],
);
const originRemote = computed(() => remoteByName('origin'));
const upstreamRemote = computed(() => remoteByName('upstream'));
const trackedBranch = computed(() => overview.value?.upstream ?? 'Sem tracking configurado');
const changedFilesPreview = computed(() => overview.value?.files.slice(0, 5) ?? []);
const recentCommitsPreview = computed(() => overview.value?.recentCommits.slice(0, 4) ?? []);
const diffFilesPreview = computed(() => diff.value?.files.slice(0, 4) ?? []);
const stagedCount = computed(() =>
  overview.value?.files.filter((file) => file.indexStatus !== '.' && file.indexStatus !== '?').length ?? 0,
);
const modifiedCount = computed(() =>
  overview.value?.files.filter((file) => file.worktreeStatus !== '.' && file.worktreeStatus !== '?').length ?? 0,
);
const untrackedCount = computed(() =>
  overview.value?.files.filter((file) => file.status === 'untracked').length ?? 0,
);

const savePrefixByBranchType: Record<string, string> = {
  feature: 'feat',
  fix: 'fix',
  refactor: 'refactor',
  chore: 'chore',
  docs: 'docs',
  hotfix: 'fix',
};

const savePrefix = computed(() => {
  const branch = overview.value?.branch;
  if (!branch || overview.value?.detached) return '';
  return savePrefixByBranchType[branch.split('/')[0] ?? ''] ?? '';
});

function remoteByName(name: string): GitRemote | undefined {
  return workspace.value?.remotes.find((remote) => remote.name === name);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function comparisonText(comparison: GitTrackingComparison | undefined): string {
  if (!comparison) return 'Sem referência local para comparar';
  return `↑ ${comparison.ahead} · ↓ ${comparison.behind}`;
}

function comparisonHint(comparison: GitTrackingComparison | undefined): string {
  if (!comparison) return 'Execute fetch para atualizar as referências.';
  return `em relação a ${comparison.reference}`;
}

function openTab(tab: GitTab): void {
  activeTab.value = tab;
}

async function loadGit(): Promise<void> {
  const requestGeneration = ++generation;
  loading.value = true;
  errorMessage.value = '';

  try {
    const result = await fetchProjectGit(props.project.id);
    if (requestGeneration !== generation) return;
    overview.value = result;
    if (!switchBranchName.value && result.branch) switchBranchName.value = result.branch;
  } catch (error) {
    if (requestGeneration === generation) {
      errorMessage.value = error instanceof Error
        ? error.message
        : 'Não foi possível consultar o Git.';
    }
  } finally {
    if (requestGeneration === generation) loading.value = false;
  }
}

async function loadWorkspace(): Promise<void> {
  loadingWorkspace.value = true;
  workspaceErrorMessage.value = '';

  try {
    workspace.value = await fetchProjectGitWorkspace(props.project.id);
  } catch (error) {
    workspaceErrorMessage.value = error instanceof Error
      ? error.message
      : 'Não foi possível consultar branches e remotos.';
  } finally {
    loadingWorkspace.value = false;
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
    if (!local.signal.aborted) diff.value = result;
  } catch (error) {
    if (!local.signal.aborted) {
      diffErrorMessage.value = error instanceof Error
        ? error.message
        : 'Não foi possível consultar o diff.';
      diff.value = null;
    }
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
    const result = await fetchProjectGitFileDiff(
      props.project.id,
      filePath,
      'combined',
      local.signal,
    );
    if (!local.signal.aborted) fileDiff.value = result;
  } catch (error) {
    if (!local.signal.aborted) {
      fileErrorMessage.value = error instanceof Error
        ? error.message
        : 'Não foi possível carregar o diff do arquivo.';
      fileDiff.value = null;
    }
  } finally {
    if (!local.signal.aborted) loadingFile.value = false;
  }
}

async function reloadGitData(): Promise<void> {
  await loadGit();
  await Promise.all([loadWorkspace(), loadDiff()]);
}

async function runMutation(
  operation: 'create-branch' | 'switch-branch',
  target: string,
): Promise<void> {
  if (mutationRunning.value) return;
  const trimmed = target.trim();
  if (!trimmed) {
    mutationErrorMessage.value = 'Informe o nome da branch.';
    return;
  }

  const confirmationText = operation === 'create-branch'
    ? `Criar a branch "${trimmed}" a partir do HEAD atual? A árvore de trabalho deve estar limpa.`
    : `Trocar para a branch "${trimmed}"? A árvore de trabalho deve estar limpa.`;
  if (typeof window !== 'undefined' && !window.confirm(confirmationText)) return;

  mutationRunning.value = true;
  mutationMessage.value = '';
  mutationErrorMessage.value = '';

  try {
    const confirmation = await prepareProjectGitMutation(
      props.project.id,
      operation,
      trimmed,
    );
    const branch = operation === 'create-branch'
      ? await createProjectGitBranch(props.project.id, trimmed, confirmation.token)
      : await switchProjectGitBranch(props.project.id, trimmed, confirmation.token);

    mutationMessage.value = operation === 'create-branch'
      ? `Branch "${branch}" criada e selecionada.`
      : `Agora na branch "${branch}".`;
    createBranchName.value = '';
    switchBranchName.value = branch;
    await reloadGitData();
  } catch (error) {
    mutationErrorMessage.value = error instanceof Error
      ? error.message
      : 'Não foi possível concluir a operação.';
  } finally {
    mutationRunning.value = false;
  }
}

async function runTrackRemoteBranch(remoteBranch: string): Promise<void> {
  if (mutationRunning.value) return;
  const localName = remoteBranch.slice(remoteBranch.indexOf('/') + 1);
  const confirmationText = `Criar a branch local "${localName}" rastreando "${remoteBranch}" e trocar para ela? A árvore de trabalho deve estar limpa.`;
  if (typeof window !== 'undefined' && !window.confirm(confirmationText)) return;

  mutationRunning.value = true;
  mutationMessage.value = '';
  mutationErrorMessage.value = '';

  try {
    const confirmation = await prepareProjectGitTrackingBranch(
      props.project.id,
      remoteBranch,
    );
    const branch = await trackProjectGitBranch(
      props.project.id,
      remoteBranch,
      confirmation.token,
    );
    mutationMessage.value = `Branch local "${branch}" criada rastreando "${remoteBranch}".`;
    switchBranchName.value = branch;
    await reloadGitData();
  } catch (error) {
    mutationErrorMessage.value = error instanceof Error
      ? error.message
      : 'Não foi possível criar a branch local.';
  } finally {
    mutationRunning.value = false;
  }
}

async function runSyncMutation(operation: 'pull' | 'push'): Promise<void> {
  if (mutationRunning.value) return;
  const branch = overview.value?.branch;
  if (!branch) {
    mutationErrorMessage.value = 'Não é possível determinar a branch atual.';
    return;
  }

  const confirmationText = operation === 'pull'
    ? `Fazer pull fast-forward do tracking "${overview.value?.upstream ?? branch}"? A árvore de trabalho deve estar limpa.`
    : `Enviar a branch "${branch}" para o remote "origin"?`;
  if (typeof window !== 'undefined' && !window.confirm(confirmationText)) return;

  mutationRunning.value = true;
  mutationMessage.value = '';
  mutationErrorMessage.value = '';

  try {
    const confirmation = await prepareProjectGitMutation(
      props.project.id,
      operation,
      branch,
    );
    const result = operation === 'pull'
      ? await pullProjectGitBranch(props.project.id, confirmation.token)
      : await pushProjectGitBranch(props.project.id, confirmation.token);

    mutationMessage.value = operation === 'pull'
      ? `Pull concluído na branch "${result}".`
      : `Push para origin concluído na branch "${result}".`;
    await reloadGitData();
  } catch (error) {
    mutationErrorMessage.value = error instanceof Error
      ? error.message
      : 'Não foi possível sincronizar a branch.';
  } finally {
    mutationRunning.value = false;
  }
}

async function refreshRemote(remote: string): Promise<void> {
  if (remoteRefreshing.value) return;
  if (typeof window !== 'undefined' && !window.confirm(
    `Executar fetch --prune no remote "${remote}"? Isso atualiza apenas as referências remotas locais.`,
  )) return;

  remoteRefreshing.value = remote;
  mutationMessage.value = '';
  mutationErrorMessage.value = '';

  try {
    await fetchProjectGitRemote(props.project.id, remote);
    mutationMessage.value = `Referências de "${remote}" atualizadas.`;
    await Promise.all([loadGit(), loadWorkspace()]);
  } catch (error) {
    mutationErrorMessage.value = error instanceof Error
      ? error.message
      : `Não foi possível atualizar o remote "${remote}".`;
  } finally {
    remoteRefreshing.value = '';
  }
}

function currentBranchOrHead(): string {
  return overview.value?.detached ? 'HEAD' : overview.value?.branch ?? 'HEAD';
}

async function runCommit(): Promise<void> {
  if (mutationRunning.value) return;
  const message = commitMessage.value.trim();
  if (!message) {
    mutationErrorMessage.value = 'Informe uma mensagem de commit.';
    return;
  }

  const confirmationText = commitIncludeAllChanges.value
    ? `Incluir alterações rastreadas e criar o commit "${message}"?`
    : `Criar o commit "${message}" usando somente alterações staged?`;
  if (typeof window !== 'undefined' && !window.confirm(confirmationText)) return;

  mutationRunning.value = true;
  mutationMessage.value = '';
  mutationErrorMessage.value = '';

  try {
    const confirmation = await prepareProjectGitMutation(
      props.project.id,
      'commit',
      currentBranchOrHead(),
    );
    const commit = await commitProjectGit(
      props.project.id,
      message,
      commitIncludeAllChanges.value,
      confirmation.token,
    );
    mutationMessage.value = `Commit "${commit.shortHash}" criado: ${commit.subject}`;
    commitMessage.value = '';
    commitIncludeAllChanges.value = false;
    await reloadGitData();
  } catch (error) {
    mutationErrorMessage.value = error instanceof Error
      ? error.message
      : 'Não foi possível criar o commit.';
  } finally {
    mutationRunning.value = false;
  }
}

async function runSave(): Promise<void> {
  if (mutationRunning.value) return;
  const message = saveMessage.value.trim();
  if (!message) {
    mutationErrorMessage.value = 'Informe uma mensagem de commit.';
    return;
  }

  const finalMessage = savePrefix.value ? `${savePrefix.value}: ${message}` : message;
  if (typeof window !== 'undefined' && !window.confirm(
    `Preparar todas as alterações e criar o commit "${finalMessage}"?`,
  )) return;

  mutationRunning.value = true;
  mutationMessage.value = '';
  mutationErrorMessage.value = '';

  try {
    const confirmation = await prepareProjectGitMutation(
      props.project.id,
      'save',
      currentBranchOrHead(),
    );
    const commit = await saveProjectGit(
      props.project.id,
      message,
      confirmation.token,
    );
    mutationMessage.value = `Commit "${commit.shortHash}" criado: ${commit.subject}`;
    saveMessage.value = '';
    await reloadGitData();
  } catch (error) {
    mutationErrorMessage.value = error instanceof Error
      ? error.message
      : 'Não foi possível salvar as alterações.';
  } finally {
    mutationRunning.value = false;
  }
}

async function runStash(operation: 'stash-push' | 'stash-pop'): Promise<void> {
  if (mutationRunning.value) return;
  const topStash = overview.value?.stashes[0];
  const confirmationText = operation === 'stash-push'
    ? 'Guardar as alterações rastreadas no stash?'
    : `Restaurar o stash mais recente ("${topStash?.message ?? ''}")?`;
  if (typeof window !== 'undefined' && !window.confirm(confirmationText)) return;

  mutationRunning.value = true;
  mutationMessage.value = '';
  mutationErrorMessage.value = '';

  try {
    const confirmation = await prepareProjectGitMutation(
      props.project.id,
      operation,
      currentBranchOrHead(),
    );
    if (operation === 'stash-push') {
      const stash = await stashPushProjectGit(props.project.id, confirmation.token);
      mutationMessage.value = `Alterações guardadas: ${stash.message}`;
    } else {
      const stash = await stashPopProjectGit(props.project.id, confirmation.token);
      mutationMessage.value = `Stash restaurado: ${stash.message}`;
    }
    await reloadGitData();
  } catch (error) {
    mutationErrorMessage.value = error instanceof Error
      ? error.message
      : 'Não foi possível concluir a operação de stash.';
  } finally {
    mutationRunning.value = false;
  }
}

watch(() => props.project.id, async () => {
  overview.value = null;
  workspace.value = null;
  diff.value = null;
  fileDiff.value = null;
  selectedFile.value = '';
  activeTab.value = 'summary';
  await loadGit();
  await Promise.all([loadWorkspace(), loadDiff()]);
}, { immediate: true });

onBeforeUnmount(() => {
  diffController?.abort();
  fileController?.abort();
});
</script>

<template>
  <section class="git-modern-panel">
    <nav class="git-subtabs" aria-label="Áreas do Git">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        :class="{ active: activeTab === tab.id }"
        @click="openTab(tab.id)"
      >
        {{ tab.label }}
      </button>
    </nav>

    <div v-if="errorMessage" class="project-error" role="alert">{{ errorMessage }}</div>
    <div v-if="workspaceErrorMessage" class="project-error" role="alert">{{ workspaceErrorMessage }}</div>
    <p v-if="mutationMessage" class="git-mutation-success" aria-live="polite">{{ mutationMessage }}</p>
    <p v-if="mutationErrorMessage" class="project-error" role="alert">{{ mutationErrorMessage }}</p>

    <div v-if="loading && !overview" class="git-modern-empty">Consultando o repositório…</div>
    <div v-else-if="overview && !overview.repository" class="git-modern-empty">
      <strong>Este projeto não é um repositório Git.</strong>
      <span>Nenhum diretório <code>.git</code> foi encontrado.</span>
    </div>

    <template v-else-if="overview">
      <section v-if="activeTab === 'summary'" class="git-tab-page git-summary-page">
        <div class="git-status-grid">
          <article>
            <span>Branch atual</span>
            <strong>{{ overview.detached ? 'HEAD destacado' : overview.branch ?? 'Sem commits' }}</strong>
            <small>{{ trackedBranch }}</small>
          </article>
          <article>
            <span>Working tree</span>
            <strong :class="overview.clean ? 'status-good' : 'status-warning'">
              {{ overview.clean ? 'Limpo' : 'Alterado' }}
            </strong>
            <small>{{ overview.files.length }} arquivo(s)</small>
          </article>
          <article>
            <span>Origin · publicação</span>
            <strong>{{ comparisonText(workspace?.originComparison) }}</strong>
            <small>{{ comparisonHint(workspace?.originComparison) }}</small>
          </article>
          <article>
            <span>Upstream · base principal</span>
            <strong>{{ comparisonText(workspace?.upstreamComparison) }}</strong>
            <small>{{ comparisonHint(workspace?.upstreamComparison) }}</small>
          </article>
        </div>

        <div class="git-branch-toolbar">
          <label>
            <span>Trocar branch</span>
            <select v-model="switchBranchName" :disabled="mutationRunning || loadingWorkspace">
              <option value="">Selecione uma branch local</option>
              <option
                v-for="branch in localBranches"
                :key="branch.name"
                :value="branch.name"
              >
                {{ branch.current ? '✓ ' : '' }}{{ branch.name }}
              </option>
            </select>
          </label>
          <button
            type="button"
            class="secondary-button"
            :disabled="mutationRunning || !switchBranchName || switchBranchName === overview.branch"
            @click="runMutation('switch-branch', switchBranchName)"
          >
            Trocar para branch
          </button>
          <button type="button" class="secondary-button" @click="openTab('branches')">
            Explorar branches
          </button>
        </div>

        <div class="git-quick-actions" aria-label="Ações rápidas do Git">
          <button type="button" @click="openTab('branches')">＋ Criar branch</button>
          <button type="button" :disabled="mutationRunning || !overview.upstream" @click="runSyncMutation('pull')">↓ Pull</button>
          <button type="button" :disabled="mutationRunning || !originRemote" @click="runSyncMutation('push')">↑ Push origin</button>
          <button type="button" @click="openTab('commit')">● Commit</button>
          <button type="button" @click="openTab('stash')">□ Stash</button>
          <button type="button" @click="openTab('diff')">⌁ Ver diff</button>
        </div>

        <div class="git-command-grid">
          <article class="git-command-card">
            <header><div><span>Branches</span><h3>Criar e trocar</h3></div></header>
            <form @submit.prevent="runMutation('create-branch', createBranchName)">
              <label>Nova branch<input v-model="createBranchName" maxlength="200" placeholder="feature/nova-funcionalidade" /></label>
              <button class="primary-button" :disabled="mutationRunning || !createBranchName.trim()">Criar branch</button>
            </form>
          </article>

          <article class="git-command-card remote-card origin-card">
            <header><div><span>Publicação</span><h3>Origin</h3></div><strong>{{ workspace?.originComparison?.reference ?? 'Não publicado' }}</strong></header>
            <code>{{ originRemote?.pushUrl || originRemote?.fetchUrl || 'Remote origin não configurado' }}</code>
            <div class="remote-comparison"><b>{{ comparisonText(workspace?.originComparison) }}</b><small>{{ comparisonHint(workspace?.originComparison) }}</small></div>
            <div class="git-card-actions">
              <button class="secondary-button" :disabled="remoteRefreshing === 'origin' || !originRemote" @click="refreshRemote('origin')">{{ remoteRefreshing === 'origin' ? 'Atualizando…' : 'Fetch origin' }}</button>
              <button class="primary-button" :disabled="mutationRunning || !originRemote" @click="runSyncMutation('push')">Push origin</button>
            </div>
          </article>

          <article class="git-command-card remote-card upstream-card">
            <header><div><span>Fonte principal</span><h3>Upstream</h3></div><strong>{{ workspace?.upstreamComparison?.reference ?? 'Sem base detectada' }}</strong></header>
            <code>{{ upstreamRemote?.fetchUrl || 'Remote upstream não configurado' }}</code>
            <div class="remote-comparison"><b>{{ comparisonText(workspace?.upstreamComparison) }}</b><small>Fetch atualiza referências; merge/rebase continua explícito.</small></div>
            <div class="git-card-actions">
              <button class="secondary-button" :disabled="!upstreamRemote || remoteRefreshing === 'upstream'" @click="refreshRemote('upstream')">{{ remoteRefreshing === 'upstream' ? 'Atualizando…' : 'Fetch upstream' }}</button>
              <button class="secondary-button" @click="openTab('sync')">Ver sincronização</button>
            </div>
          </article>
        </div>

        <div class="git-preview-grid">
          <article>
            <header><h3>Alterações no working tree</h3><button @click="openTab('commit')">Ver tudo</button></header>
            <div v-if="changedFilesPreview.length === 0" class="git-inline-empty">Nenhuma alteração local.</div>
            <ul v-else>
              <li v-for="file in changedFilesPreview" :key="file.path">
                <StatusBadge :tone="gitFileToneFor(file.status)">{{ statusLabels[file.status] }}</StatusBadge>
                <code>{{ file.path }}</code>
              </li>
            </ul>
          </article>
          <article>
            <header><h3>Histórico recente</h3><button @click="openTab('history')">Ver tudo</button></header>
            <div v-if="recentCommitsPreview.length === 0" class="git-inline-empty">Nenhum commit encontrado.</div>
            <ol v-else>
              <li v-for="commit in recentCommitsPreview" :key="commit.hash">
                <code>{{ commit.shortHash }}</code>
                <div><strong>{{ commit.subject }}</strong><small>{{ commit.authorName }} · {{ formatDate(commit.authoredAt) }}</small></div>
              </li>
            </ol>
          </article>
          <article>
            <header><h3>Diferenças por arquivo</h3><button @click="openTab('diff')">Abrir diff</button></header>
            <div v-if="diffFilesPreview.length === 0" class="git-inline-empty">Nenhuma diferença detectada.</div>
            <ul v-else>
              <li v-for="file in diffFilesPreview" :key="file.path">
                <code>{{ file.path }}</code><small>+{{ file.additions }} / −{{ file.deletions }}</small>
              </li>
            </ul>
          </article>
        </div>
      </section>

      <ProjectGitBranchesPage
        v-else-if="activeTab === 'branches'"
        :overview="overview"
        :workspace="workspace"
        :loading="loadingWorkspace"
        :busy="mutationRunning"
        :remote-refreshing="remoteRefreshing"
        @refresh="loadWorkspace"
        @create="(name) => runMutation('create-branch', name)"
        @switch="(name) => runMutation('switch-branch', name)"
        @track="runTrackRemoteBranch"
        @fetch-remote="refreshRemote"
      />

      <section v-else-if="activeTab === 'sync'" class="git-tab-page">
        <div class="git-page-heading"><div><span>Sincronização</span><h2>Origin para publicar, upstream para atualizar</h2></div></div>
        <div class="git-status-grid sync-grid">
          <article><span>Branch local</span><strong>{{ overview.branch ?? 'HEAD' }}</strong><small>{{ trackedBranch }}</small></article>
          <article><span>Origin</span><strong>{{ comparisonText(workspace?.originComparison) }}</strong><small>{{ comparisonHint(workspace?.originComparison) }}</small></article>
          <article><span>Upstream</span><strong>{{ comparisonText(workspace?.upstreamComparison) }}</strong><small>{{ comparisonHint(workspace?.upstreamComparison) }}</small></article>
          <article><span>Working tree</span><strong :class="overview.clean ? 'status-good' : 'status-warning'">{{ overview.clean ? 'Pronto' : 'Tem alterações' }}</strong><small>{{ overview.files.length }} arquivo(s)</small></article>
        </div>
        <div class="git-sync-layout">
          <article class="git-command-card remote-detail-card">
            <header><div><span>Destino de publicação</span><h3>Origin</h3></div><span class="git-pill git-pill-origin">Push padrão</span></header>
            <dl>
              <div><dt>Fetch URL</dt><dd><code>{{ originRemote?.fetchUrl || 'Não configurado' }}</code></dd></div>
              <div><dt>Push URL</dt><dd><code>{{ originRemote?.pushUrl || 'Não configurado' }}</code></dd></div>
              <div><dt>Tracking</dt><dd><code>{{ workspace?.originComparison?.reference ?? trackedBranch }}</code></dd></div>
            </dl>
            <div class="git-card-actions">
              <button class="secondary-button" :disabled="remoteRefreshing === 'origin' || !originRemote" @click="refreshRemote('origin')">{{ remoteRefreshing === 'origin' ? 'Atualizando…' : 'Fetch origin' }}</button>
              <button class="secondary-button" :disabled="mutationRunning || !overview.upstream" @click="runSyncMutation('pull')">Pull tracking</button>
              <button class="primary-button" :disabled="mutationRunning || !originRemote" @click="runSyncMutation('push')">Push origin</button>
            </div>
          </article>
          <article class="git-command-card remote-detail-card">
            <header><div><span>Fonte principal</span><h3>Upstream</h3></div><span class="git-pill git-pill-upstream">Base</span></header>
            <dl>
              <div><dt>Fetch URL</dt><dd><code>{{ upstreamRemote?.fetchUrl || 'Não configurado' }}</code></dd></div>
              <div><dt>Base detectada</dt><dd><code>{{ workspace?.upstreamComparison?.reference ?? 'Nenhuma' }}</code></dd></div>
              <div><dt>Comparação</dt><dd>{{ comparisonText(workspace?.upstreamComparison) }}</dd></div>
            </dl>
            <div class="git-sync-notice">O fetch atualiza referências locais. Merge ou rebase não são executados automaticamente para evitar conflitos sem um fluxo de abortar.</div>
            <div class="git-card-actions"><button class="primary-button" :disabled="remoteRefreshing === 'upstream' || !upstreamRemote" @click="refreshRemote('upstream')">{{ remoteRefreshing === 'upstream' ? 'Atualizando…' : 'Fetch upstream' }}</button></div>
          </article>
        </div>
        <div class="git-table-card">
          <div class="git-table-header remotes-table"><span>Remote</span><span>Papel</span><span>Fetch</span><span>Push</span></div>
          <div v-for="remote in workspace?.remotes ?? []" :key="remote.name" class="git-table-row remotes-table">
            <strong>{{ remote.name }}</strong><span class="git-pill" :class="`git-pill-${remote.role}`">{{ remote.role }}</span><code>{{ remote.fetchUrl || '—' }}</code><code>{{ remote.pushUrl || '—' }}</code>
          </div>
        </div>
      </section>

      <section v-else-if="activeTab === 'commit'" class="git-tab-page">
        <div class="git-status-grid commit-metrics">
          <article><span>Branch atual</span><strong>{{ overview.branch ?? 'HEAD' }}</strong><small>{{ trackedBranch }}</small></article>
          <article><span>Staged</span><strong>{{ stagedCount }}</strong><small>prontos para commit</small></article>
          <article><span>Modificados</span><strong>{{ modifiedCount }}</strong><small>fora do índice</small></article>
          <article><span>Não rastreados</span><strong>{{ untrackedCount }}</strong><small>novos arquivos</small></article>
        </div>
        <div class="git-commit-layout">
          <article class="git-table-card files-card">
            <header><h3>Arquivos alterados</h3><span>{{ overview.files.length }} arquivo(s)</span></header>
            <div v-if="overview.files.length === 0" class="git-inline-empty">Working tree limpo.</div>
            <ul v-else class="git-file-list-modern">
              <li v-for="file in overview.files" :key="`${file.path}-${file.previousPath ?? ''}`">
                <StatusBadge :tone="gitFileToneFor(file.status)">{{ statusLabels[file.status] }}</StatusBadge>
                <code><template v-if="file.previousPath">{{ file.previousPath }} → </template>{{ file.path }}</code><small>{{ file.indexStatus }}/{{ file.worktreeStatus }}</small>
              </li>
            </ul>
          </article>
          <div class="git-commit-forms">
            <form class="git-command-card" @submit.prevent="runCommit">
              <header><div><span>Commit padrão</span><h3>Registrar staged</h3></div></header>
              <label>Mensagem<textarea v-model="commitMessage" maxlength="500" placeholder="Descreva as alterações" /></label>
              <label class="git-check-label"><input v-model="commitIncludeAllChanges" type="checkbox" /> Incluir alterações rastreadas</label>
              <button class="primary-button" :disabled="mutationRunning || !commitMessage.trim()">Commitar alterações</button>
            </form>
            <form class="git-command-card" @submit.prevent="runSave">
              <header><div><span>Git-save</span><h3>Preparar e commitar tudo</h3></div></header>
              <label>Mensagem<textarea v-model="saveMessage" maxlength="500" placeholder="Descreva as alterações" /></label>
              <small>Inclui arquivos não rastreados{{ savePrefix ? ` e usa ${savePrefix}:` : '' }}.</small>
              <button class="primary-button" :disabled="mutationRunning || !saveMessage.trim()">Salvar tudo</button>
            </form>
          </div>
        </div>
      </section>

      <section v-else-if="activeTab === 'stash'" class="git-tab-page">
        <div class="git-page-heading"><div><span>Stash</span><h2>Guardar e restaurar trabalho temporário</h2></div></div>
        <div class="git-two-column-actions stash-actions">
          <article class="git-command-card">
            <header><div><span>Novo stash</span><h3>Guardar alterações rastreadas</h3></div></header>
            <p>O working tree possui {{ overview.files.length }} alteração(ões).</p>
            <button class="primary-button" :disabled="mutationRunning" @click="runStash('stash-push')">Guardar alterações</button>
          </article>
          <article class="git-command-card">
            <header><div><span>Mais recente</span><h3>Restaurar stash</h3></div></header>
            <p>{{ overview.stashes[0]?.message ?? 'Nenhum stash disponível.' }}</p>
            <button class="secondary-button" :disabled="mutationRunning || overview.stashes.length === 0" @click="runStash('stash-pop')">Restaurar mais recente</button>
          </article>
        </div>
        <div class="git-table-card">
          <div class="git-table-header stash-table"><span>Stash</span><span>Mensagem</span><span>Data</span></div>
          <div v-for="entry in overview.stashes" :key="entry.index" class="git-table-row stash-table">
            <code>stash@{{ '{' }}{{ entry.index }}{{ '}' }}</code><strong>{{ entry.message }}</strong><span>{{ formatDate(entry.createdAt) }}</span>
          </div>
          <div v-if="overview.stashes.length === 0" class="git-inline-empty">Nenhum stash salvo.</div>
        </div>
      </section>

      <section v-else-if="activeTab === 'diff'" class="git-tab-page">
        <div class="git-page-heading">
          <div><span>Diff</span><h2>Diferenças por arquivo</h2></div>
          <button class="secondary-button" :disabled="loadingDiff" @click="loadDiff">{{ loadingDiff ? 'Atualizando…' : 'Atualizar diff' }}</button>
        </div>
        <div v-if="diffErrorMessage" class="project-error" role="alert">{{ diffErrorMessage }}</div>
        <div v-else-if="loadingDiff && !diff" class="git-modern-empty">Carregando diff…</div>
        <div v-else-if="diff && diff.files.length === 0" class="git-modern-empty">Nenhum arquivo alterado desde HEAD.</div>
        <div v-else-if="diff" class="git-diff-layout-modern">
          <aside>
            <button
              v-for="file in diff.files"
              :key="file.path"
              type="button"
              :class="{ active: selectedFile === file.path }"
              @click="loadFileDiff(file.path)"
            >
              <StatusBadge :tone="gitFileToneFor(file.status)">{{ statusLabels[file.status] }}</StatusBadge>
              <code>{{ file.path }}</code><small v-if="!file.binary">+{{ file.additions }} / −{{ file.deletions }}</small><small v-else>binário</small>
            </button>
          </aside>
          <main>
            <p v-if="fileErrorMessage" class="project-error" role="alert">{{ fileErrorMessage }}</p>
            <p v-else-if="!selectedFile" class="git-inline-empty">Selecione um arquivo para visualizar o diff.</p>
            <p v-else-if="loadingFile" class="git-inline-empty">Carregando {{ selectedFile }}…</p>
            <template v-else-if="fileDiff">
              <p v-if="fileDiff.binary" class="git-inline-empty">Diff binário não é exibido inline.</p>
              <template v-else>
                <p v-if="fileDiff.masked" class="project-log-redaction-warning">Segredos detectados foram mascarados.</p>
                <p v-if="fileDiff.truncated" class="project-log-redaction-warning">Diff maior que o limite de leitura.</p>
                <pre>{{ fileDiff.content || 'Diff vazio.' }}</pre>
              </template>
            </template>
          </main>
        </div>
      </section>

      <section v-else class="git-tab-page">
        <div class="git-page-heading"><div><span>Histórico</span><h2>Commits recentes</h2></div></div>
        <div class="git-history-list">
          <article v-for="commit in overview.recentCommits" :key="commit.hash">
            <code>{{ commit.shortHash }}</code><div><strong>{{ commit.subject }}</strong><span>{{ commit.authorName }} · {{ commit.authorEmail }}</span></div><time>{{ formatDate(commit.authoredAt) }}</time>
          </article>
          <div v-if="overview.recentCommits.length === 0" class="git-inline-empty">O repositório ainda não possui commits.</div>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.git-modern-panel {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.git-subtabs {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  border-bottom: 1px solid var(--color-border, #d8deea);
}

.git-subtabs button {
  position: relative;
  border: 0;
  background: transparent;
  color: var(--color-text-muted, #667085);
  padding: 11px 15px;
  font-weight: 700;
  white-space: nowrap;
}

.git-subtabs button::after {
  position: absolute;
  right: 12px;
  bottom: -1px;
  left: 12px;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: transparent;
  content: '';
}

.git-subtabs button.active {
  color: #314bc4;
}

.git-subtabs button.active::after {
  background: #314bc4;
}

.git-tab-page,
.git-summary-page {
  display: grid;
  gap: 18px;
}

.git-status-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.git-status-grid article,
.git-command-card,
.git-preview-grid article,
.git-table-card,
.git-branch-toolbar,
.git-diff-layout-modern,
.git-history-list article {
  border: 1px solid var(--color-border, #d8deea);
  border-radius: 14px;
  background: var(--color-surface, #fff);
  box-shadow: 0 10px 28px rgba(29, 43, 76, 0.04);
}

.git-status-grid article {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 16px;
}

.git-status-grid span,
.git-status-grid small,
.git-command-card span,
.git-command-card small,
.git-page-heading span {
  color: var(--color-text-muted, #667085);
}

.git-status-grid strong {
  overflow: hidden;
  color: var(--color-text-strong, #182033);
  font-size: 1.04rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-good {
  color: #087552 !important;
}

.status-warning {
  color: #9b5e00 !important;
}

.git-branch-toolbar {
  display: flex;
  align-items: end;
  gap: 10px;
  padding: 14px;
}

.git-branch-toolbar label,
.git-command-card label {
  display: grid;
  flex: 1;
  gap: 6px;
  color: var(--color-text-muted, #667085);
  font-size: 0.76rem;
  font-weight: 700;
  text-transform: uppercase;
}

input,
select,
textarea {
  width: 100%;
  border: 1px solid var(--color-border, #d8deea);
  border-radius: 9px;
  background: var(--color-input, #f7f9fc);
  color: var(--color-text-strong, #182033);
  padding: 10px 12px;
  font: inherit;
  text-transform: none;
}

textarea {
  min-height: 88px;
  resize: vertical;
}

.git-quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.git-quick-actions button,
.git-preview-grid header button,
.git-table-row button {
  border: 1px solid var(--color-border, #d8deea);
  border-radius: 9px;
  background: var(--color-surface, #fff);
  color: var(--color-text, #344054);
  padding: 8px 11px;
  font-weight: 700;
}

.git-command-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.git-command-card {
  display: grid;
  align-content: start;
  gap: 14px;
  padding: 17px;
}

.git-command-card header,
.git-preview-grid header,
.git-page-heading,
.git-table-card > header,
.git-history-list article,
.git-card-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.git-command-card h3,
.git-preview-grid h3,
.git-page-heading h2,
.git-table-card h3 {
  margin: 3px 0 0;
  color: var(--color-text-strong, #182033);
}

.git-command-card form,
.git-commit-forms {
  display: grid;
  gap: 12px;
}

.remote-card code,
.remote-detail-card code,
.git-table-row code {
  overflow: hidden;
  color: var(--color-text-muted, #667085);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remote-comparison {
  display: grid;
  gap: 4px;
  border-radius: 10px;
  background: var(--color-surface-subtle, #fbfcfe);
  padding: 12px;
}

.git-card-actions {
  justify-content: flex-start;
  flex-wrap: wrap;
}

.git-preview-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.git-preview-grid article {
  min-width: 0;
  padding: 16px;
}

.git-preview-grid ul,
.git-preview-grid ol,
.git-file-list-modern {
  display: grid;
  gap: 8px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.git-preview-grid li,
.git-file-list-modern li {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 9px;
}

.git-preview-grid li code,
.git-file-list-modern code {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-preview-grid li div {
  display: grid;
  min-width: 0;
}

.git-preview-grid li strong,
.git-preview-grid li small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-page-heading {
  align-items: end;
}

.git-sync-layout,
.git-two-column-actions,
.git-commit-layout {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.remote-detail-card dl {
  display: grid;
  gap: 9px;
  margin: 0;
}

.remote-detail-card dl div {
  display: grid;
  grid-template-columns: 100px minmax(0, 1fr);
  gap: 10px;
  border-bottom: 1px solid var(--color-border, #d8deea);
  padding-bottom: 9px;
}

.remote-detail-card dt {
  color: var(--color-text-muted, #667085);
  font-weight: 700;
}

.remote-detail-card dd {
  min-width: 0;
  margin: 0;
}

.git-sync-notice,
.git-inline-empty,
.git-modern-empty {
  border-radius: 10px;
  background: var(--color-surface-subtle, #fbfcfe);
  color: var(--color-text-muted, #667085);
  padding: 14px;
}

.git-modern-empty {
  display: grid;
  place-items: center;
  min-height: 220px;
  gap: 6px;
  text-align: center;
}

.git-table-card {
  overflow: hidden;
}

.git-table-header,
.git-table-row {
  display: grid;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
}

.git-table-header {
  background: var(--color-surface-subtle, #fbfcfe);
  color: var(--color-text-muted, #667085);
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
}

.git-table-row {
  border-top: 1px solid var(--color-border, #d8deea);
}

.remotes-table {
  grid-template-columns: 120px 110px minmax(0, 1fr) minmax(0, 1fr);
}

.stash-table {
  grid-template-columns: 130px minmax(0, 1fr) 190px;
}

.git-pill {
  width: fit-content;
  border-radius: 999px;
  background: rgba(49, 75, 196, 0.1);
  color: #314bc4;
  padding: 5px 8px;
  font-size: 0.72rem;
  font-weight: 800;
}

.git-pill-upstream {
  background: rgba(120, 72, 190, 0.12);
  color: #6840a6;
}

.git-commit-layout {
  grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
}

.files-card > header {
  padding: 14px;
}

.git-file-list-modern {
  margin: 0;
  padding: 0 14px 14px;
}

.git-file-list-modern li {
  border-top: 1px solid var(--color-border, #d8deea);
  padding-top: 9px;
}

.git-file-list-modern small {
  margin-left: auto;
  color: var(--color-text-muted, #667085);
}

.git-check-label {
  display: flex !important;
  align-items: center;
  gap: 8px !important;
  text-transform: none !important;
}

.git-check-label input {
  width: auto;
}

.git-diff-layout-modern {
  display: grid;
  grid-template-columns: minmax(280px, 0.32fr) minmax(0, 0.68fr);
  min-height: 520px;
  overflow: hidden;
}

.git-diff-layout-modern aside {
  overflow: auto;
  max-height: 680px;
  border-right: 1px solid var(--color-border, #d8deea);
  padding: 9px;
}

.git-diff-layout-modern aside button {
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  padding: 10px;
  text-align: left;
}

.git-diff-layout-modern aside button:hover,
.git-diff-layout-modern aside button.active {
  border-color: rgba(49, 75, 196, 0.28);
  background: rgba(49, 75, 196, 0.06);
}

.git-diff-layout-modern aside code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-diff-layout-modern main {
  min-width: 0;
  overflow: auto;
  max-height: 680px;
  padding: 16px;
}

.git-diff-layout-modern pre {
  min-width: max-content;
  margin: 0;
  color: var(--color-text, #344054);
  font-size: 0.8rem;
  line-height: 1.55;
  white-space: pre;
}

.git-history-list {
  display: grid;
  gap: 8px;
}

.git-history-list article {
  display: grid;
  grid-template-columns: 90px minmax(0, 1fr) 210px;
  padding: 13px;
}

.git-history-list article div {
  display: grid;
  gap: 3px;
}

.git-history-list span,
.git-history-list time {
  color: var(--color-text-muted, #667085);
}

.git-mutation-success {
  margin: 0;
  border: 1px solid rgba(12, 148, 105, 0.28);
  border-radius: 10px;
  background: rgba(12, 148, 105, 0.08);
  color: #087552;
  padding: 11px 13px;
}

@media (max-width: 1100px) {
  .git-status-grid,
  .git-command-grid,
  .git-preview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .git-command-grid article:last-child,
  .git-preview-grid article:last-child {
    grid-column: 1 / -1;
  }

  .git-diff-layout-modern {
    grid-template-columns: 1fr;
  }

  .git-diff-layout-modern aside {
    max-height: 300px;
    border-right: 0;
    border-bottom: 1px solid var(--color-border, #d8deea);
  }
}

@media (max-width: 760px) {
  .git-status-grid,
  .git-command-grid,
  .git-preview-grid,
  .git-sync-layout,
  .git-two-column-actions,
  .git-commit-layout {
    grid-template-columns: 1fr;
  }

  .git-command-grid article:last-child,
  .git-preview-grid article:last-child {
    grid-column: auto;
  }

  .git-branch-toolbar,
  .git-page-heading,
  .git-command-card header,
  .git-card-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .remotes-table,
  .stash-table,
  .git-history-list article {
    grid-template-columns: 1fr;
  }

  .git-table-header {
    display: none;
  }
}
</style>
