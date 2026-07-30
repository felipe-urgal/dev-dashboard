<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';

import type {
  GitDiffSnapshot,
  GitFileDiff,
  GitFileStatus,
  GitRemote,
  GitSyncStrategy,
  GitTrackingComparison,
  ManagedProcess,
  Project,
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

import {
  commitProjectGit,
  createProjectGitBranch,
  discardProjectGitFile,
  fetchProjectGit,
  fetchProjectGitDiff,
  fetchProjectGitFileDiff,
  fetchProjectProcess,
  prepareProjectGitMutation,
  pullProjectGitBranch,
  pushProjectGitBranch,
  removeProjectGitUntrackedFile,
  saveProjectGit,
  stageProjectGitFile,
  stashPopProjectGit,
  stashPushProjectGit,
  switchProjectGitBranch,
  unstageProjectGitFile,
} from '../api';
import {
  fetchProjectGitPullRequestUrl,
  fetchProjectGitRemote,
  fetchProjectGitWorkspace,
  integrateProjectGitReference,
  prepareProjectGitSync,
  prepareProjectGitTrackingBranch,
  trackProjectGitBranch,
} from '../api/git-workspace';
import { useAutoDismiss } from '../composables/useAutoDismiss';
import { gitFileToneFor } from '../utils/status-tones';
import ProjectGitBranchesPage from './ProjectGitBranchesPage.vue';
import ProjectGitCommitPage from './ProjectGitCommitPage.vue';
import ProjectGitSyncPage from './ProjectGitSyncPage.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ project: Project }>();

type GitTab =
  | 'summary'
  | 'branches'
  | 'sync'
  | 'commit'
  | 'stash'
  | 'diff'
  | 'history';

const tabs: Array<{ id: GitTab; label: string; icon: string }> = [
  { id: 'summary', label: 'Resumo', icon: '⌂' },
  { id: 'branches', label: 'Branches', icon: '⑂' },
  { id: 'sync', label: 'Sincronização', icon: '↕' },
  { id: 'commit', label: 'Commit', icon: '●' },
  { id: 'stash', label: 'Stash', icon: '□' },
  { id: 'diff', label: 'Diff', icon: '±' },
  { id: 'history', label: 'Histórico', icon: '◷' },
];

const activeTab = ref<GitTab>('summary');
const overview = ref<ProjectGitOverview | null>(null);
const workspace = ref<ProjectGitWorkspace | null>(null);
const diff = ref<GitDiffSnapshot | null>(null);
const selectedFile = ref('');
const fileDiff = ref<GitFileDiff | null>(null);
const serverProcess = ref<ManagedProcess | null>(null);
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
const commitMessage = ref('');
const commitIncludeAllChanges = ref(false);
const commitScope = ref<'staged' | 'all'>('staged');
let generation = 0;
let diffController: AbortController | undefined;
let fileController: AbortController | undefined;
let serverRefreshTimer: ReturnType<typeof setInterval> | undefined;

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

const originRemote = computed(() => remoteByName('origin'));
const upstreamRemote = computed(() => remoteByName('upstream'));
const trackedBranch = computed(
  () => overview.value?.upstream ?? 'Sem tracking configurado',
);
const recentCommitsPreview = computed(
  () => overview.value?.recentCommits.slice(0, 4) ?? [],
);

const serverStatus = computed(() => {
  const process = serverProcess.value;
  if (!process) {
    return {
      label: 'Servidor parado',
      detail: 'Sem processo ativo',
      tone: 'stopped',
    };
  }
  const detail = process.port
    ? `Porta ${process.port}`
    : process.pid
      ? `PID ${process.pid}`
      : 'Processo local';
  switch (process.status) {
    case 'running':
      return { label: 'Servidor ativo', detail, tone: 'running' };
    case 'starting':
      return {
        label: 'Servidor iniciando',
        detail,
        tone: 'starting',
      };
    case 'stopping':
      return { label: 'Servidor parando', detail, tone: 'stopping' };
    case 'failed':
      return { label: 'Servidor falhou', detail, tone: 'failed' };
    default:
      return { label: 'Servidor parado', detail, tone: 'stopped' };
  }
});

function remoteByName(name: string): GitRemote | undefined {
  return workspace.value?.remotes.find(
    (remote) => remote.name === name,
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function comparisonText(
  comparison: GitTrackingComparison | undefined,
): string {
  if (!comparison) return 'Sem referência local para comparar';
  return `↑ ${comparison.ahead} · ↓ ${comparison.behind}`;
}

function comparisonHint(
  comparison: GitTrackingComparison | undefined,
): string {
  if (!comparison)
    return 'Execute fetch para atualizar as referências.';
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
  } catch (error) {
    if (requestGeneration === generation) {
      errorMessage.value =
        error instanceof Error
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
    workspace.value = await fetchProjectGitWorkspace(
      props.project.id,
    );
  } catch (error) {
    workspaceErrorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível consultar branches e remotos.';
  } finally {
    loadingWorkspace.value = false;
  }
}

async function loadServerStatus(): Promise<void> {
  try {
    serverProcess.value = await fetchProjectProcess(props.project.id);
  } catch {
    serverProcess.value = null;
  }
}

async function loadDiff(): Promise<void> {
  diffController?.abort();
  const local = new AbortController();
  diffController = local;
  loadingDiff.value = true;
  diffErrorMessage.value = '';

  try {
    const result = await fetchProjectGitDiff(
      props.project.id,
      'combined',
      local.signal,
    );
    if (!local.signal.aborted) diff.value = result;
  } catch (error) {
    if (!local.signal.aborted) {
      diffErrorMessage.value =
        error instanceof Error
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
      fileErrorMessage.value =
        error instanceof Error
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
  await Promise.all([
    loadWorkspace(),
    loadDiff(),
    loadServerStatus(),
  ]);
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

  const confirmationText =
    operation === 'create-branch'
      ? `Criar a branch "${trimmed}" a partir do HEAD atual? A árvore de trabalho deve estar limpa.`
      : `Trocar para a branch "${trimmed}"? A árvore de trabalho deve estar limpa.`;
  if (
    typeof window !== 'undefined' &&
    !window.confirm(confirmationText)
  )
    return;

  mutationRunning.value = true;
  mutationMessage.value = '';
  mutationErrorMessage.value = '';

  try {
    const confirmation = await prepareProjectGitMutation(
      props.project.id,
      operation,
      trimmed,
    );
    const branch =
      operation === 'create-branch'
        ? await createProjectGitBranch(
            props.project.id,
            trimmed,
            confirmation.token,
          )
        : await switchProjectGitBranch(
            props.project.id,
            trimmed,
            confirmation.token,
          );

    mutationMessage.value =
      operation === 'create-branch'
        ? `Branch "${branch}" criada e selecionada.`
        : `Agora na branch "${branch}".`;
    createBranchName.value = '';
    await reloadGitData();
  } catch (error) {
    mutationErrorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível concluir a operação.';
  } finally {
    mutationRunning.value = false;
  }
}

async function runTrackRemoteBranch(
  remoteBranch: string,
): Promise<void> {
  if (mutationRunning.value) return;
  const localName = remoteBranch.slice(remoteBranch.indexOf('/') + 1);
  const confirmationText = `Criar a branch local "${localName}" rastreando "${remoteBranch}" e trocar para ela? A árvore de trabalho deve estar limpa.`;
  if (
    typeof window !== 'undefined' &&
    !window.confirm(confirmationText)
  )
    return;

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
    await reloadGitData();
  } catch (error) {
    mutationErrorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível criar a branch local.';
  } finally {
    mutationRunning.value = false;
  }
}

async function runSyncMutation(
  operation: 'pull' | 'push',
): Promise<void> {
  if (mutationRunning.value) return;
  const branch = overview.value?.branch;
  if (!branch) {
    mutationErrorMessage.value =
      'Não é possível determinar a branch atual.';
    return;
  }

  const confirmationText =
    operation === 'pull'
      ? `Fazer pull fast-forward do tracking "${overview.value?.upstream ?? branch}"? A árvore de trabalho deve estar limpa.`
      : `Enviar a branch "${branch}" para o remote "origin"?`;
  if (
    typeof window !== 'undefined' &&
    !window.confirm(confirmationText)
  )
    return;

  mutationRunning.value = true;
  mutationMessage.value = '';
  mutationErrorMessage.value = '';

  try {
    const confirmation = await prepareProjectGitMutation(
      props.project.id,
      operation,
      branch,
    );
    const result =
      operation === 'pull'
        ? await pullProjectGitBranch(
            props.project.id,
            confirmation.token,
          )
        : await pushProjectGitBranch(
            props.project.id,
            confirmation.token,
          );

    mutationMessage.value =
      operation === 'pull'
        ? `Pull concluído na branch "${result}".`
        : `Push para origin concluído na branch "${result}".`;
    await reloadGitData();
  } catch (error) {
    mutationErrorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível sincronizar a branch.';
  } finally {
    mutationRunning.value = false;
  }
}

async function runOpenPullRequest(): Promise<void> {
  if (mutationRunning.value) return;
  const branch = overview.value?.branch;
  if (!branch) {
    mutationErrorMessage.value =
      'Não é possível determinar a branch atual.';
    return;
  }

  if (
    !overview.value?.upstream &&
    (typeof window === 'undefined' ||
      !window.confirm(
        `A branch "${branch}" ainda não foi publicada. Enviar para "origin" antes de abrir a Pull Request?`,
      ))
  ) {
    return;
  }

  mutationRunning.value = true;
  mutationMessage.value = '';
  mutationErrorMessage.value = '';
  try {
    if (!overview.value?.upstream) {
      const confirmation = await prepareProjectGitMutation(
        props.project.id,
        'push',
        branch,
      );
      await pushProjectGitBranch(
        props.project.id,
        confirmation.token,
      );
      await reloadGitData();
    }

    const pullRequest = await fetchProjectGitPullRequestUrl(
      props.project.id,
    );
    mutationMessage.value = `Pull Request preparada: "${pullRequest.branch}" → "${pullRequest.defaultBranch}".`;
    if (typeof window !== 'undefined') {
      window.open(pullRequest.url, '_blank', 'noopener,noreferrer');
    }
  } catch (error) {
    mutationErrorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível abrir a Pull Request.';
  } finally {
    mutationRunning.value = false;
  }
}

async function runSyncIntegration(payload: {
  reference: string;
  strategy: GitSyncStrategy;
}): Promise<void> {
  if (mutationRunning.value) return;
  const labels: Record<GitSyncStrategy, string> = {
    'ff-only': 'fast-forward',
    rebase: 'rebase',
    merge: 'merge',
  };
  const message = `Integrar "${payload.reference}" na branch atual usando ${labels[payload.strategy]}? A árvore de trabalho deve estar limpa. Em caso de conflito, a operação será abortada automaticamente.`;
  if (typeof window !== 'undefined' && !window.confirm(message))
    return;

  mutationRunning.value = true;
  mutationMessage.value = '';
  mutationErrorMessage.value = '';
  try {
    const confirmation = await prepareProjectGitSync(
      props.project.id,
      payload.reference,
      payload.strategy,
    );
    const result = await integrateProjectGitReference(
      props.project.id,
      payload.reference,
      payload.strategy,
      confirmation.token,
    );
    mutationMessage.value = result.changed
      ? `${payload.reference} integrada na branch "${result.branch}" usando ${labels[payload.strategy]}.`
      : `A branch "${result.branch}" já estava atualizada com ${payload.reference}.`;
    await reloadGitData();
  } catch (error) {
    mutationErrorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível integrar a referência remota.';
  } finally {
    mutationRunning.value = false;
  }
}

async function refreshRemote(remote: string): Promise<void> {
  if (remoteRefreshing.value) return;
  if (
    typeof window !== 'undefined' &&
    !window.confirm(
      `Executar fetch --prune no remote "${remote}"? Isso atualiza apenas as referências remotas locais.`,
    )
  )
    return;

  remoteRefreshing.value = remote;
  mutationMessage.value = '';
  mutationErrorMessage.value = '';
  try {
    await fetchProjectGitRemote(props.project.id, remote);
    mutationMessage.value = `Referências de "${remote}" atualizadas.`;
    await loadWorkspace();
  } catch (error) {
    mutationErrorMessage.value =
      error instanceof Error
        ? error.message
        : `Não foi possível atualizar o remote "${remote}".`;
  } finally {
    remoteRefreshing.value = '';
  }
}

function currentBranchOrHead(): string {
  return overview.value?.branch ?? 'HEAD';
}

async function runCommit(): Promise<void> {
  if (mutationRunning.value) return;
  const message = commitMessage.value.trim();
  if (!message) {
    mutationErrorMessage.value = 'Informe uma mensagem de commit.';
    return;
  }

  const saveAll = commitScope.value === 'all';
  const confirmationText = saveAll
    ? `Preparar todas as alterações e criar o commit "${message}"?`
    : `Criar o commit "${message}"?`;
  if (
    typeof window !== 'undefined'
    && !window.confirm(confirmationText)
  ) {
    return;
  }

  mutationRunning.value = true;
  mutationMessage.value = '';
  mutationErrorMessage.value = '';
  try {
    const operation = saveAll ? 'save' : 'commit';
    const confirmation = await prepareProjectGitMutation(
      props.project.id,
      operation,
      currentBranchOrHead(),
    );
    const commit = saveAll
      ? await saveProjectGit(
          props.project.id,
          message,
          confirmation.token,
        )
      : await commitProjectGit(
          props.project.id,
          message,
          commitIncludeAllChanges.value,
          confirmation.token,
        );
    mutationMessage.value = `Commit "${commit.shortHash}" criado: ${commit.subject}`;
    commitMessage.value = '';
    commitIncludeAllChanges.value = false;
    commitScope.value = 'staged';
    await reloadGitData();
  } catch (error) {
    mutationErrorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível criar o commit.';
  } finally {
    mutationRunning.value = false;
  }
}

async function runFileMutation(payload: {
  operation: 'stage' | 'unstage' | 'discard' | 'remove';
  path: string;
}): Promise<void> {
  if (mutationRunning.value) return;

  if (payload.operation === 'discard' || payload.operation === 'remove') {
    const confirmationText = payload.operation === 'discard'
      ? `Desfazer definitivamente as alterações de "${payload.path}"?`
      : `Remover definitivamente o arquivo novo "${payload.path}"?`;
    if (
      typeof window !== 'undefined'
      && !window.confirm(confirmationText)
    ) {
      return;
    }
  }

  mutationRunning.value = true;
  mutationMessage.value = '';
  mutationErrorMessage.value = '';
  try {
    if (payload.operation === 'stage') {
      await stageProjectGitFile(props.project.id, payload.path);
      mutationMessage.value = `Arquivo "${payload.path}" adicionado ao staged.`;
    } else if (payload.operation === 'unstage') {
      await unstageProjectGitFile(props.project.id, payload.path);
      mutationMessage.value = `Arquivo "${payload.path}" removido do staged.`;
    } else {
      const operation = payload.operation === 'discard'
        ? 'discard-file'
        : 'remove-untracked-file';
      const confirmation = await prepareProjectGitMutation(
        props.project.id,
        operation,
        payload.path,
      );
      if (payload.operation === 'discard') {
        await discardProjectGitFile(
          props.project.id,
          payload.path,
          confirmation.token,
        );
        mutationMessage.value = `Alterações de "${payload.path}" desfeitas.`;
      } else {
        await removeProjectGitUntrackedFile(
          props.project.id,
          payload.path,
          confirmation.token,
        );
        mutationMessage.value = `Arquivo novo "${payload.path}" removido.`;
      }
    }
    await reloadGitData();
  } catch (error) {
    mutationErrorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível alterar o arquivo.';
  } finally {
    mutationRunning.value = false;
  }
}

function openFileDiff(filePath: string): void {
  activeTab.value = 'diff';
  void loadFileDiff(filePath);
}

async function runStash(
  operation: 'stash-push' | 'stash-pop',
): Promise<void> {
  if (mutationRunning.value) return;
  const topStash = overview.value?.stashes[0];
  const confirmationText =
    operation === 'stash-push'
      ? 'Guardar as alterações rastreadas no stash?'
      : `Restaurar o stash mais recente ("${topStash?.message ?? ''}")?`;
  if (
    typeof window !== 'undefined' &&
    !window.confirm(confirmationText)
  )
    return;

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
      const stash = await stashPushProjectGit(
        props.project.id,
        confirmation.token,
      );
      mutationMessage.value = `Alterações guardadas: ${stash.message}`;
    } else {
      const stash = await stashPopProjectGit(
        props.project.id,
        confirmation.token,
      );
      mutationMessage.value = `Stash restaurado: ${stash.message}`;
    }
    await reloadGitData();
  } catch (error) {
    mutationErrorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível concluir a operação de stash.';
  } finally {
    mutationRunning.value = false;
  }
}

watch(
  () => props.project.id,
  async () => {
    overview.value = null;
    workspace.value = null;
    diff.value = null;
    fileDiff.value = null;
    selectedFile.value = '';
    serverProcess.value = null;
    activeTab.value = 'summary';
    if (serverRefreshTimer) clearInterval(serverRefreshTimer);
    await Promise.all([
      loadGit(),
      loadWorkspace(),
      loadDiff(),
      loadServerStatus(),
    ]);
    serverRefreshTimer = setInterval(() => {
      void loadServerStatus();
    }, 10_000);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  diffController?.abort();
  fileController?.abort();
  if (serverRefreshTimer) clearInterval(serverRefreshTimer);
});
</script>

<template>
  <section class="git-modern-panel">
    <div class="git-navigation-bar">
      <nav class="git-subtabs" aria-label="Áreas do Git">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          :data-icon="tab.icon"
          :class="{ active: activeTab === tab.id }"
          @click="openTab(tab.id)"
        >
          {{ tab.label }}
        </button>
      </nav>

      <RouterLink
        class="git-server-indicator"
        :class="`is-${serverStatus.tone}`"
        :to="{
          name: 'project-server',
          params: { projectId: project.id },
        }"
        :title="`${serverStatus.label} · ${serverStatus.detail}`"
      >
        <span aria-hidden="true" />
        <div>
          <strong>{{ serverStatus.label }}</strong>
          <small>{{ serverStatus.detail }}</small>
        </div>
      </RouterLink>
    </div>

    <div v-if="errorMessage" class="project-error" role="alert">
      {{ errorMessage }}
    </div>
    <div
      v-if="workspaceErrorMessage"
      class="project-error"
      role="alert"
    >
      {{ workspaceErrorMessage }}
    </div>
    <p
      v-if="mutationMessage"
      class="git-mutation-success"
      aria-live="polite"
    >
      {{ mutationMessage }}
    </p>
    <p v-if="mutationErrorMessage" class="project-error" role="alert">
      {{ mutationErrorMessage }}
    </p>

    <div v-if="loading && !overview" class="git-modern-empty">
      Consultando o repositório…
    </div>
    <div
      v-else-if="overview && !overview.repository"
      class="git-modern-empty"
    >
      <strong>Este projeto não é um repositório Git.</strong>
      <span>Nenhum diretório <code>.git</code> foi encontrado.</span>
    </div>

    <template v-else-if="overview">
      <section
        v-if="activeTab === 'summary'"
        class="git-tab-page git-summary-page"
      >
        <div class="git-status-grid">
          <article>
            <span>Branch atual</span>
            <strong>{{
              overview.detached
                ? 'HEAD destacado'
                : (overview.branch ?? 'Sem commits')
            }}</strong>
            <small>{{ trackedBranch }}</small>
          </article>
          <article>
            <span>Working tree</span>
            <strong
              :class="
                overview.clean ? 'status-good' : 'status-warning'
              "
            >
              {{ overview.clean ? 'Limpo' : 'Alterado' }}
            </strong>
            <small>{{ overview.files.length }} arquivo(s)</small>
          </article>
          <article>
            <span>Origin · publicação</span>
            <strong>{{
              comparisonText(workspace?.originComparison)
            }}</strong>
            <small>{{
              comparisonHint(workspace?.originComparison)
            }}</small>
          </article>
          <article>
            <span>Upstream · base principal</span>
            <strong>{{
              comparisonText(workspace?.upstreamComparison)
            }}</strong>
            <small>{{
              comparisonHint(workspace?.upstreamComparison)
            }}</small>
          </article>
        </div>

        <div class="git-preview-grid git-recent-history-preview">
          <article>
            <header>
              <h3>Histórico recente</h3>
              <button type="button" @click="openTab('history')">
                Ver tudo
              </button>
            </header>
            <div
              v-if="recentCommitsPreview.length === 0"
              class="git-inline-empty"
            >
              Nenhum commit encontrado.
            </div>
            <ol v-else>
              <li
                v-for="commit in recentCommitsPreview"
                :key="commit.hash"
              >
                <code>{{ commit.shortHash }}</code>
                <div>
                  <strong>{{ commit.subject }}</strong>
                  <small>
                    {{ commit.authorName }} ·
                    {{ formatDate(commit.authoredAt) }}
                  </small>
                </div>
              </li>
            </ol>
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

      <ProjectGitSyncPage
        v-else-if="activeTab === 'sync'"
        :project-id="project.id"
        :overview="overview"
        :workspace="workspace"
        :busy="mutationRunning"
        :remote-refreshing="remoteRefreshing"
        @fetch-remote="refreshRemote"
        @integrate="runSyncIntegration"
        @pull="runSyncMutation('pull')"
        @push="runSyncMutation('push')"
        @open-pull-request="runOpenPullRequest"
      />

      <ProjectGitCommitPage
        v-else-if="activeTab === 'commit'"
        v-model:message="commitMessage"
        v-model:include-tracked="commitIncludeAllChanges"
        v-model:scope="commitScope"
        :overview="overview"
        :busy="mutationRunning"
        @submit="runCommit"
        @file-mutation="runFileMutation"
        @view-diff="openFileDiff"
      />

      <section v-else-if="activeTab === 'stash'" class="git-tab-page">
        <div class="git-page-heading">
          <div>
            <span>Stash</span>
            <h2>Guardar e restaurar trabalho temporário</h2>
          </div>
        </div>
        <div class="git-two-column-actions stash-actions">
          <article class="git-command-card">
            <header>
              <div>
                <span>Novo stash</span>
                <h3>Guardar alterações rastreadas</h3>
              </div>
            </header>
            <p>
              O working tree possui
              {{ overview.files.length }} alteração(ões).
            </p>
            <button
              class="primary-button"
              :disabled="mutationRunning"
              @click="runStash('stash-push')"
            >
              Guardar alterações
            </button>
          </article>
          <article class="git-command-card">
            <header>
              <div>
                <span>Mais recente</span>
                <h3>Restaurar stash</h3>
              </div>
            </header>
            <p>
              {{
                overview.stashes[0]?.message ??
                'Nenhum stash disponível.'
              }}
            </p>
            <button
              class="secondary-button"
              :disabled="
                mutationRunning || overview.stashes.length === 0
              "
              @click="runStash('stash-pop')"
            >
              Restaurar mais recente
            </button>
          </article>
        </div>
        <div class="git-table-card">
          <div class="git-table-header stash-table">
            <span>Stash</span><span>Mensagem</span><span>Data</span>
          </div>
          <div
            v-for="entry in overview.stashes"
            :key="entry.index"
            class="git-table-row stash-table"
          >
            <code>stash@{{ '{' }}{{ entry.index }}{{ '}' }}</code
            ><strong>{{ entry.message }}</strong
            ><span>{{ formatDate(entry.createdAt) }}</span>
          </div>
          <div
            v-if="overview.stashes.length === 0"
            class="git-inline-empty"
          >
            Nenhum stash salvo.
          </div>
        </div>
      </section>

      <section v-else-if="activeTab === 'diff'" class="git-tab-page">
        <div class="git-page-heading">
          <div>
            <span>Diff</span>
            <h2>Diferenças por arquivo</h2>
          </div>
          <button
            class="secondary-button"
            :disabled="loadingDiff"
            @click="loadDiff"
          >
            {{ loadingDiff ? 'Atualizando…' : 'Atualizar diff' }}
          </button>
        </div>
        <div
          v-if="diffErrorMessage"
          class="project-error"
          role="alert"
        >
          {{ diffErrorMessage }}
        </div>
        <div
          v-else-if="loadingDiff && !diff"
          class="git-modern-empty"
        >
          Carregando diff…
        </div>
        <div
          v-else-if="diff && diff.files.length === 0"
          class="git-modern-empty"
        >
          Nenhum arquivo alterado desde HEAD.
        </div>
        <div v-else-if="diff" class="git-diff-layout-modern">
          <aside>
            <button
              v-for="file in diff.files"
              :key="file.path"
              type="button"
              :class="{ active: selectedFile === file.path }"
              @click="loadFileDiff(file.path)"
            >
              <StatusBadge :tone="gitFileToneFor(file.status)">{{
                statusLabels[file.status]
              }}</StatusBadge>
              <code>{{ file.path }}</code
              ><small v-if="!file.binary"
                >+{{ file.additions }} / −{{ file.deletions }}</small
              ><small v-else>binário</small>
            </button>
          </aside>
          <main>
            <p
              v-if="fileErrorMessage"
              class="project-error"
              role="alert"
            >
              {{ fileErrorMessage }}
            </p>
            <p v-else-if="!selectedFile" class="git-inline-empty">
              Selecione um arquivo para visualizar o diff.
            </p>
            <p v-else-if="loadingFile" class="git-inline-empty">
              Carregando {{ selectedFile }}…
            </p>
            <template v-else-if="fileDiff">
              <p v-if="fileDiff.binary" class="git-inline-empty">
                Diff binário não é exibido inline.
              </p>
              <template v-else>
                <p
                  v-if="fileDiff.masked"
                  class="project-log-redaction-warning"
                >
                  Segredos detectados foram mascarados.
                </p>
                <p
                  v-if="fileDiff.truncated"
                  class="project-log-redaction-warning"
                >
                  Diff maior que o limite de leitura.
                </p>
                <pre>{{ fileDiff.content || 'Diff vazio.' }}</pre>
              </template>
            </template>
          </main>
        </div>
      </section>

      <section v-else class="git-tab-page">
        <div class="git-page-heading">
          <div>
            <span>Histórico</span>
            <h2>Commits recentes</h2>
          </div>
        </div>
        <div class="git-history-list">
          <article
            v-for="commit in overview.recentCommits"
            :key="commit.hash"
          >
            <code>{{ commit.shortHash }}</code>
            <div>
              <strong>{{ commit.subject }}</strong
              ><span
                >{{ commit.authorName }} ·
                {{ commit.authorEmail }}</span
              >
            </div>
            <time>{{ formatDate(commit.authoredAt) }}</time>
          </article>
          <div
            v-if="overview.recentCommits.length === 0"
            class="git-inline-empty"
          >
            O repositório ainda não possui commits.
          </div>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped src="./ProjectGitPanel.css"></style>
