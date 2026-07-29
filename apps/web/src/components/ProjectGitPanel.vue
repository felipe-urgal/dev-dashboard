<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue';

import type {
  GitBranch,
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
} from '../api/git-workspace';
import { useAutoDismiss } from '../composables/useAutoDismiss';
import { gitFileToneFor } from '../utils/status-tones';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ project: Project }>();

type GitTab = 'summary' | 'branches' | 'sync' | 'commit' | 'stash' | 'diff' | 'history';
type BranchFilter = 'all' | 'local' | 'origin' | 'upstream';

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
const branchSearch = ref('');
const branchFilter = ref<BranchFilter>('all');
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
const originBranches = computed(() =>
  workspace.value?.branches.filter((branch) => branch.remote === 'origin') ?? [],
);
const upstreamBranches = computed(() =>
  workspace.value?.branches.filter((branch) => branch.remote === 'upstream') ?? [],
);
const originRemote = computed(() => remoteByName('origin'));
const upstreamRemote = computed(() => remoteByName('upstream'));
const trackedBranch = computed(() => overview.value?.upstream ?? 'Sem tracking configurado');
const changedFilesPreview = computed(() => overview.value?.files.slice(0, 5) ?? []);
const recentCommitsPreview = computed(() => overview.value?.recentCommits.slice(0, 4) ?? []);
const diffFilesPreview = computed(() => diff.value?.files.slice(0, 4) ?? []);

const filteredBranches = computed(() => {
  const query = branchSearch.value.trim().toLocaleLowerCase();
  return (workspace.value?.branches ?? []).filter((branch) => {
    const matchesFilter = branchFilter.value === 'all'
      || branchFilter.value === 'local' && branch.kind === 'local'
      || branchFilter.value === 'origin' && branch.remote === 'origin'
      || branchFilter.value === 'upstream' && branch.remote === 'upstream';
    const matchesSearch = !query || branch.name.toLocaleLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });
});

const stagedCount = computed(() =>
  overview.value?.files.filter((file) => file.indexStatus !== '.' && file.indexStatus !== '?').length ?? 0,
);
const modifiedCount = computed(() =>
  overview.value?.files.filter((file) => file.worktreeStatus !== '.' && file.worktreeStatus !== '?').length ?? 0,
);
const untrackedCount = computed(() =>
  overview.value?.files.filter((file) => file.status === 'untracked').length ?? 0,
);

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
  if (!comparison) return 'Atualize as referências do remote para habilitar a comparação.';
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

const savePrefixByBranchType: Record<string, string> = {
  feature: 'feat',
  fix: 'fix',
  refactor: 'refactor',
  chore: 'chore',
  docs: 'docs',
  hotfix: 'fix',
};
const savePrefix = computed(() => {
  if (!overview.value || overview.value.detached || !overview.value.branch) return '';
  return savePrefixByBranchType[overview.value.branch.split('/')[0] ?? ''] ?? '';
});

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
    const result = await saveProjectGit(
      props.project.id,
      message,
      confirmation.token,
    );
    mutationMessage.value = `Commit "${result.shortHash}" criado: ${result.subject}`;
    saveMessage.value = '';
    await reloadGitData();
  } catch (error) {
    mutationErrorMessage.value = error instanceof Error
      ? error.message
      : 'Não foi possível salvar todas as alterações.';
  } finally {
    mutationRunning.value = false;
  }
}

async function runCommit(): Promise<void> {
  if (mutationRunning.value) return;
  const message = commitMessage.value.trim();
  if (!message) {
    mutationErrorMessage.value = 'Informe uma mensagem de commit.';
    return;
  }

  const includeAllChanges = commitIncludeAllChanges.value;
  if (typeof window !== 'undefined' && !window.confirm(
    includeAllChanges
      ? `Commitar todas as alterações rastreadas com a mensagem "${message}"?`
      : `Commitar as alterações staged com a mensagem "${message}"?`,
  )) return;

  mutationRunning.value = true;
  mutationMessage.value = '';
  mutationErrorMessage.value = '';

  try {
    const confirmation = await prepareProjectGitMutation(
      props.project.id,
      'commit',
      currentBranchOrHead(),
    );
    const result = await commitProjectGit(
      props.project.id,
      message,
      includeAllChanges,
      confirmation.token,
    );
    mutationMessage.value = `Commit "${result.shortHash}" criado: ${result.subject}`;
    commitMessage.value = '';
    commitIncludeAllChanges.value = false;
    await reloadGitData();
  } catch (error) {
    mutationErrorMessage.value = error instanceof Error
      ? error.message
      : 'Não foi possível concluir o commit.';
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
      const popped = await stashPopProjectGit(props.project.id, confirmation.token);
      mutationMessage.value = `Stash restaurado: ${popped.message}`;
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

    <div v-if="errorMessage" class="project-error" role="alert">
      {{ errorMessage }}
    </div>
    <div v-if="workspaceErrorMessage" class="project-error" role="alert">
      {{ workspaceErrorMessage }}
    </div>
    <p v-if="mutationMessage" class="git-mutation-success" aria-live="polite">
      {{ mutationMessage }}
    </p>
    <p v-if="mutationErrorMessage" class="project-error" role="alert">
      {{ mutationErrorMessage }}
    </p>

    <div v-if="loading && !overview" class="git-modern-empty">
      Consultando o repositório…
    </div>
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
            Ver todas as branches
          </button>
        </div>

        <div class="git-quick-actions" aria-label="Ações rápidas do Git">
          <button type="button" @click="openTab('branches')">＋ Criar branch</button>
          <button type="button" :disabled="mutationRunning || !overview.upstream" @click="runSyncMutation('pull')">↓ Pull</button>
          <button type="button" :disabled="mutationRunning || !originRemote" @click="runSyncMutation('push')">↑ Push origin</button>
          <button type="button" @click="openTab('commit')">● Commit</button>
          <button type="button" @click="openTab('stash')">□ Stash</button>
          <button type="button" @click="openTab('diff')">⌁ Atualizar diff</button>
        </div>

        <div class="git-command-grid">
          <article class="git-command-card">
            <header>
              <div><span>Branches</span><h3>Criar e trocar</h3></div>
            </header>
            <form @submit.prevent="runMutation('create-branch', createBranchName)">
              <label>
                Nova branch
                <input v-model="createBranchName" maxlength="200" placeholder="feature/nova-funcionalidade" />
              </label>
              <button class="primary-button" :disabled="mutationRunning || !createBranchName.trim()">
                Criar branch
              </button>
            </form>
          </article>

          <article class="git-command-card remote-card origin-card">
            <header>
              <div><span>Publicação</span><h3>Origin</h3></div>
              <strong>{{ workspace?.originComparison?.reference ?? 'Não publicado' }}</strong>
            </header>
            <code>{{ originRemote?.pushUrl || originRemote?.fetchUrl || 'Remote origin não configurado' }}</code>
            <div class="remote-comparison">
              <b>{{ comparisonText(workspace?.originComparison) }}</b>
              <small>{{ comparisonHint(workspace?.originComparison) }}</small>
            </div>
            <div class="git-card-actions">
              <button class="secondary-button" :disabled="mutationRunning || !overview.upstream" @click="runSyncMutation('pull')">Pull tracking</button>
              <button class="primary-button" :disabled="mutationRunning || !originRemote" @click="runSyncMutation('push')">Push origin</button>
            </div>
          </article>

          <article class="git-command-card remote-card upstream-card">
            <header>
              <div><span>Fonte principal</span><h3>Upstream</h3></div>
              <strong>{{ workspace?.upstreamComparison?.reference ?? 'Sem base detectada' }}</strong>
            </header>
            <code>{{ upstreamRemote?.fetchUrl || 'Remote upstream não configurado' }}</code>
            <div class="remote-comparison">
              <b>{{ comparisonText(workspace?.upstreamComparison) }}</b>
              <small>Fetch atualiza referências; merge/rebase continua explícito.</small>
            </div>
            <div class="git-card-actions">
              <button
                class="secondary-button"
                :disabled="!upstreamRemote || remoteRefreshing === 'upstream'"
                @click="refreshRemote('upstream')"
              >
                {{ remoteRefreshing === 'upstream' ? 'Atualizando…' : 'Fetch upstream' }}
              </button>
              <button class="secondary-button" @click="openTab('sync')">Ver sincronização</button>
            </div>
          </article>

          <article class="git-command-card">
            <header><div><span>Commit</span><h3>Commit rápido</h3></div></header>
            <form @submit.prevent="runCommit">
              <label>
                Mensagem
                <textarea v-model="commitMessage" maxlength="500" placeholder="Descreva as alterações" />
              </label>
              <label class="git-check-label">
                <input v-model="commitIncludeAllChanges" type="checkbox" />
                Incluir alterações rastreadas
              </label>
              <button class="primary-button" :disabled="mutationRunning || !commitMessage.trim()">Commitar</button>
            </form>
          </article>

          <article class="git-command-card">
            <header><div><span>Git-save</span><h3>Salvar tudo</h3></div></header>
            <form @submit.prevent="runSave">
              <label>
                Mensagem
                <textarea v-model="saveMessage" maxlength="500" placeholder="Descreva as alterações" />
              </label>
              <small>Inclui arquivos não rastreados e aplica {{ savePrefix ? `o prefixo ${savePrefix}:` : 'a mensagem informada' }}.</small>
              <button class="primary-button" :disabled="mutationRunning || !saveMessage.trim()">Salvar tudo</button>
            </form>
          </article>

          <article class="git-command-card">
            <header><div><span>Stash</span><h3>Guardar alterações</h3></div></header>
            <p>{{ overview.stashes.length }} stash(es) salvo(s).</p>
            <div class="git-card-actions vertical">
              <button class="primary-button" :disabled="mutationRunning" @click="runStash('stash-push')">Guardar alterações</button>
              <button class="secondary-button" :disabled="mutationRunning || overview.stashes.length === 0" @click="runStash('stash-pop')">Restaurar mais recente</button>
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
                <code>{{ file.path }}</code>
                <small>+{{ file.additions }} / −{{ file.deletions }}</small>
              </li>
            </ul>
          </article>
        </div>
      </section>

      <section v-else-if="activeTab === 'branches'" class="git-tab-page">
        <div class="git-page-heading">
          <div><span>Branches</span><h2>Gerenciar branches locais e remotas</h2></div>
          <button class="secondary-button" :disabled="loadingWorkspace" @click="loadWorkspace">{{ loadingWorkspace ? 'Atualizando…' : 'Atualizar lista' }}</button>
        </div>

        <div class="git-branch-filters">
          <select v-model="branchFilter">
            <option value="all">Todas as branches</option>
            <option value="local">Locais</option>
            <option value="origin">Origin</option>
            <option value="upstream">Upstream</option>
          </select>
          <input v-model="branchSearch" type="search" placeholder="Buscar branch…" />
          <span>{{ filteredBranches.length }} resultado(s)</span>
        </div>

        <div class="git-two-column-actions">
          <form class="git-command-card" @submit.prevent="runMutation('switch-branch', switchBranchName)">
            <header><div><span>Checkout</span><h3>Trocar branch</h3></div></header>
            <label>
              Branch local
              <select v-model="switchBranchName">
                <option value="">Selecione</option>
                <option v-for="branch in localBranches" :key="branch.name" :value="branch.name">{{ branch.name }}</option>
              </select>
            </label>
            <button class="primary-button" :disabled="mutationRunning || !switchBranchName || switchBranchName === overview.branch">Trocar branch</button>
          </form>
          <form class="git-command-card" @submit.prevent="runMutation('create-branch', createBranchName)">
            <header><div><span>Nova branch</span><h3>Criar a partir do HEAD</h3></div></header>
            <label>
              Nome
              <input v-model="createBranchName" maxlength="200" placeholder="feature/nova-funcionalidade" />
            </label>
            <button class="primary-button" :disabled="mutationRunning || !createBranchName.trim()">Criar branch</button>
          </form>
        </div>

        <div class="git-table-card">
          <div class="git-table-header branches-table">
            <span>Branch</span><span>Tipo</span><span>Tracking</span><span>Ações</span>
          </div>
          <div v-for="branch in filteredBranches" :key="`${branch.kind}-${branch.name}`" class="git-table-row branches-table">
            <div><strong>{{ branch.name }}</strong><small v-if="branch.current">Branch atual</small></div>
            <span class="git-pill" :class="`git-pill-${branch.kind}`">{{ branch.kind === 'local' ? 'Local' : branch.remote }}</span>
            <code>{{ branch.upstream ?? (branch.kind === 'remote' ? branch.name : 'Sem tracking') }}</code>
            <div class="row-actions">
              <button
                v-if="branch.kind === 'local'"
                type="button"
                :disabled="branch.current || mutationRunning"
                @click="runMutation('switch-branch', branch.name)"
              >
                {{ branch.current ? 'Atual' : 'Trocar' }}
              </button>
              <span v-else>Somente leitura</span>
            </div>
          </div>
          <div v-if="filteredBranches.length === 0" class="git-inline-empty">Nenhuma branch corresponde aos filtros.</div>
        </div>
      </section>

      <section v-else-if="activeTab === 'sync'" class="git-tab-page">
        <div class="git-page-heading">
          <div><span>Sincronização</span><h2>Origin para publicar, upstream para atualizar</h2></div>
        </div>

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
            <div class="git-sync-notice">
              O fetch atualiza as referências locais. Merge ou rebase não são executados automaticamente para evitar deixar o projeto em conflito sem um fluxo de abortar.
            </div>
            <div class="git-card-actions">
              <button class="primary-button" :disabled="remoteRefreshing === 'upstream' || !upstreamRemote" @click="refreshRemote('upstream')">{{ remoteRefreshing === 'upstream' ? 'Atualizando…' : 'Fetch upstream' }}</button>
            </div>
          </article>
        </div>

        <div class="git-table-card">
          <div class="git-table-header remotes-table"><span>Remote</span><span>Papel</span><span>Fetch</span><span>Push</span></div>
          <div v-for="remote in workspace?.remotes ?? []" :key="remote.name" class="git-table-row remotes-table">
            <strong>{{ remote.name }}</strong>
            <span class="git-pill" :class="`git-pill-${remote.role}`">{{ remote.role }}</span>
            <code>{{ remote.fetchUrl || '—' }}</code>
            <code>{{ remote.pushUrl || '—' }}</code>
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
                <code><template v-if="file.previousPath">{{ file.previousPath }} → </template>{{ file.path }}</code>
                <small>{{ file.indexStatus }}/{{ file.worktreeStatus }}</small>
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
            <code>stash@{{ '{' }}{{ entry.index }}{{ '}' }}</code>
            <strong>{{ entry.message }}</strong>
            <span>{{ formatDate(entry.createdAt) }}</span>
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
              <code>{{ file.path }}</code>
              <small v-if="!file.binary">+{{ file.additions }} / −{{ file.deletions }}</small>
              <small v-else>binário</small>
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
            <code>{{ commit.shortHash }}</code>
            <div><strong>{{ commit.subject }}</strong><span>{{ commit.authorName }} · {{ commit.authorEmail }}</span></div>
            <time>{{ formatDate(commit.authoredAt) }}</time>
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
  gap: 14px;
  min-width: 0;
}

.git-subtabs {
  display: flex;
  min-width: 0;
  gap: 4px;
  overflow-x: auto;
  border-bottom: 1px solid var(--border);
}

.git-subtabs button {
  position: relative;
  min-height: 42px;
  flex: 0 0 auto;
  padding: 0 14px;
  border: 0;
  color: var(--text-muted);
  background: transparent;
  font: inherit;
  font-size: 11px;
  font-weight: 650;
}

.git-subtabs button::after {
  position: absolute;
  right: 10px;
  bottom: -1px;
  left: 10px;
  height: 2px;
  border-radius: 999px 999px 0 0;
  background: transparent;
  content: '';
}

.git-subtabs button:hover {
  color: var(--text);
  background: var(--surface-2);
}

.git-subtabs button.active {
  color: var(--accent);
}

.git-subtabs button.active::after {
  background: var(--accent);
}

.git-tab-page {
  display: grid;
  gap: 14px;
}

.git-modern-empty,
.git-inline-empty {
  display: grid;
  place-items: center;
  min-height: 92px;
  padding: 18px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  color: var(--text-dim);
  background: var(--surface-1);
  text-align: center;
}

.git-modern-empty strong {
  color: var(--text);
}

.git-mutation-success {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--success-text) 35%, var(--border));
  border-radius: var(--radius-sm);
  color: var(--success-text);
  background: var(--success-surface);
  font-size: 11px;
}

.git-status-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.git-status-grid article,
.git-command-card,
.git-preview-grid > article,
.git-table-card,
.git-diff-layout-modern,
.git-history-list {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  box-shadow: 0 10px 28px rgb(0 0 0 / 3%);
}

.git-status-grid article {
  display: grid;
  gap: 6px;
  min-height: 92px;
  align-content: center;
  padding: 15px 16px;
}

.git-status-grid span,
.git-command-card header span,
.git-page-heading span {
  color: var(--text-dim);
  font-size: 9px;
  font-weight: 750;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.git-status-grid strong {
  overflow: hidden;
  color: var(--text);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-status-grid small,
.git-command-card small,
.git-command-card p {
  color: var(--text-dim);
  font-size: 10px;
  line-height: 1.5;
}

.status-good { color: var(--success-text) !important; }
.status-warning { color: var(--warning-text) !important; }

.git-branch-toolbar {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto auto;
  align-items: end;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
}

.git-branch-toolbar label,
.git-command-card label {
  display: grid;
  gap: 6px;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 600;
}

.git-branch-toolbar select,
.git-command-card input,
.git-command-card select,
.git-command-card textarea,
.git-branch-filters select,
.git-branch-filters input {
  width: 100%;
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  outline: 0;
  color: var(--text);
  background: var(--surface-2);
  font: inherit;
  font-size: 11px;
}

.git-command-card textarea {
  min-height: 78px;
  padding: 9px 10px;
  resize: vertical;
}

.git-quick-actions {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
}

.git-quick-actions button,
.git-table-row button,
.git-preview-grid header button {
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: var(--surface-2);
  font: inherit;
  font-size: 10px;
  font-weight: 650;
}

.git-command-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.git-command-card {
  display: grid;
  min-width: 0;
  gap: 12px;
  align-content: start;
  padding: 15px;
}

.git-command-card header,
.git-preview-grid header,
.git-table-card > header,
.git-page-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.git-command-card header > div,
.git-page-heading > div {
  display: grid;
  gap: 4px;
}

.git-command-card h3,
.git-preview-grid h3,
.git-table-card h3,
.git-page-heading h2 {
  margin: 0;
  color: var(--text);
}

.git-command-card h3,
.git-preview-grid h3,
.git-table-card h3 { font-size: 13px; }
.git-page-heading h2 { font-size: 18px; }

.git-command-card form {
  display: grid;
  gap: 10px;
}

.git-check-label {
  display: flex !important;
  align-items: center;
  gap: 7px !important;
}

.git-check-label input {
  width: auto;
  min-height: 0;
}

.remote-card code,
.remote-detail-card code,
.git-table-row code {
  overflow: hidden;
  color: var(--text-dim);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remote-comparison {
  display: grid;
  gap: 4px;
  padding: 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.remote-comparison b { color: var(--text); font-size: 13px; }

.git-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: auto;
}

.git-card-actions.vertical { flex-direction: column; }
.git-card-actions > * { flex: 1 1 110px; }

.git-preview-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.git-preview-grid > article {
  min-width: 0;
  padding: 14px;
}

.git-preview-grid header button {
  min-height: 28px;
  border: 0;
  color: var(--accent);
  background: transparent;
}

.git-preview-grid ul,
.git-preview-grid ol,
.git-file-list-modern {
  display: grid;
  gap: 0;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.git-preview-grid li,
.git-file-list-modern li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  border-bottom: 1px solid var(--border);
}

.git-preview-grid li:last-child,
.git-file-list-modern li:last-child { border-bottom: 0; }
.git-preview-grid code,
.git-file-list-modern code { overflow: hidden; color: var(--text-muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.git-preview-grid strong { overflow: hidden; display: block; color: var(--text); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.git-preview-grid small { color: var(--text-dim); font-size: 9px; }

.git-page-heading {
  align-items: center;
  padding: 4px 2px;
}

.git-branch-filters {
  display: grid;
  grid-template-columns: 190px minmax(220px, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
}

.git-branch-filters span { color: var(--text-dim); font-size: 10px; }

.git-two-column-actions,
.git-sync-layout,
.git-commit-layout {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.git-table-card { overflow: hidden; }

.git-table-header,
.git-table-row {
  display: grid;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
}

.git-table-header {
  min-height: 36px;
  color: var(--text-dim);
  background: var(--surface-2);
  font-size: 9px;
  font-weight: 750;
  text-transform: uppercase;
  letter-spacing: .07em;
}

.git-table-row {
  min-height: 48px;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 10px;
}

.branches-table { grid-template-columns: minmax(180px, 1.2fr) 90px minmax(180px, 1fr) 110px; }
.remotes-table { grid-template-columns: 100px 90px minmax(180px, 1fr) minmax(180px, 1fr); }
.stash-table { grid-template-columns: 100px minmax(200px, 1fr) 170px; }

.git-table-row > div:first-child { display: grid; gap: 3px; min-width: 0; }
.git-table-row strong { overflow: hidden; color: var(--text); text-overflow: ellipsis; white-space: nowrap; }
.git-table-row small { color: var(--success-text); }
.row-actions { display: flex; justify-content: flex-end; }

.git-pill {
  display: inline-flex;
  width: max-content;
  align-items: center;
  justify-content: center;
  padding: 3px 7px;
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-3);
  font-size: 9px;
  font-weight: 750;
  text-transform: capitalize;
}

.git-pill-local,
.git-pill-origin { color: var(--info-text); background: var(--info-surface); }
.git-pill-remote,
.git-pill-upstream { color: var(--warning-text); background: var(--warning-surface); }

.remote-detail-card dl {
  display: grid;
  gap: 0;
  margin: 0;
}

.remote-detail-card dl > div {
  display: grid;
  grid-template-columns: 100px minmax(0, 1fr);
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid var(--border);
}

.remote-detail-card dt { color: var(--text-dim); font-size: 10px; }
.remote-detail-card dd { min-width: 0; margin: 0; color: var(--text); font-size: 10px; }

.git-sync-notice {
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--warning-text) 25%, var(--border));
  border-radius: var(--radius-sm);
  color: var(--warning-text);
  background: var(--warning-surface);
  font-size: 10px;
  line-height: 1.5;
}

.files-card { padding: 14px; }
.git-commit-forms { display: grid; gap: 12px; }

.git-diff-layout-modern {
  display: grid;
  grid-template-columns: 310px minmax(0, 1fr);
  min-height: 520px;
  overflow: hidden;
}

.git-diff-layout-modern aside {
  overflow-y: auto;
  border-right: 1px solid var(--border);
  background: var(--surface-1);
}

.git-diff-layout-modern aside button {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  width: 100%;
  min-height: 48px;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 0;
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
  background: transparent;
  text-align: left;
}

.git-diff-layout-modern aside button.active { background: var(--accent-soft); }
.git-diff-layout-modern aside code { overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.git-diff-layout-modern aside small { font-size: 9px; }

.git-diff-layout-modern main {
  min-width: 0;
  overflow: auto;
  background: color-mix(in srgb, var(--surface-0) 65%, var(--surface-1));
}

.git-diff-layout-modern pre {
  min-width: max-content;
  margin: 0;
  padding: 16px;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.65;
  white-space: pre;
}

.git-history-list { overflow: hidden; }
.git-history-list article {
  display: grid;
  grid-template-columns: 90px minmax(0, 1fr) 180px;
  align-items: center;
  gap: 12px;
  min-height: 58px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}
.git-history-list article:last-of-type { border-bottom: 0; }
.git-history-list code { color: var(--accent); font-size: 10px; }
.git-history-list article > div { display: grid; gap: 4px; min-width: 0; }
.git-history-list strong { overflow: hidden; color: var(--text); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.git-history-list span,
.git-history-list time { color: var(--text-dim); font-size: 9px; }
.git-history-list time { text-align: right; }

@media (max-width: 1180px) {
  .git-status-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .git-command-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .git-preview-grid { grid-template-columns: 1fr; }
  .git-quick-actions { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 860px) {
  .git-branch-toolbar,
  .git-branch-filters,
  .git-two-column-actions,
  .git-sync-layout,
  .git-commit-layout,
  .git-command-grid { grid-template-columns: 1fr; }
  .git-diff-layout-modern { grid-template-columns: 1fr; }
  .git-diff-layout-modern aside { max-height: 260px; border-right: 0; border-bottom: 1px solid var(--border); }
  .branches-table,
  .remotes-table,
  .stash-table { grid-template-columns: 1fr; gap: 5px; }
  .git-table-header { display: none; }
  .row-actions { justify-content: flex-start; }
  .git-history-list article { grid-template-columns: 72px minmax(0, 1fr); }
  .git-history-list time { grid-column: 2; text-align: left; }
}

@media (max-width: 620px) {
  .git-status-grid,
  .git-quick-actions { grid-template-columns: 1fr; }
  .git-subtabs button { padding: 0 10px; }
}
</style>
