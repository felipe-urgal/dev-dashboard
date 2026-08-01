<script setup lang="ts">
import { inject, ref, watch } from 'vue';
import { routeLocationKey } from 'vue-router';

import type {
  Project,
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

import {
  amendProjectGit,
  commitProjectGit,
  createProjectGitBranch,
  deleteProjectGitBranch,
  fetchProjectGit,
  prepareProjectGitBranchDelete,
  prepareProjectGitBranchRename,
  prepareProjectGitMutation,
  renameProjectGitBranch,
  switchProjectGitBranch,
} from '../api';
import {
  deleteProjectGitRemoteBranch,
  fetchProjectGitRemote,
  fetchProjectGitWorkspace,
  prepareProjectGitMainSync,
  prepareProjectGitRemoteBranchDelete,
  prepareProjectGitTrackingBranch,
  synchronizeProjectGitMain,
  trackProjectGitBranch,
} from '../api/git-workspace';
import { useAutoDismiss } from '../composables/useAutoDismiss';
import ProjectGitBranchesPage from './ProjectGitBranchesPage.vue';
import ProjectGitCommitPage, {
  type CommitMode,
} from './ProjectGitCommitPage.vue';
import ProjectGitDiffPage from './ProjectGitDiffPage.vue';
import ProjectGitHistoryPage from './ProjectGitHistoryPage.vue';
import ProjectGitPullRequestPage from './ProjectGitPullRequestPage.vue';
import ProjectGitSyncPage from './ProjectGitSyncPage.vue';
import ProjectGitUndoPage from './ProjectGitUndoPage.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ project: Project }>();
const route = inject(routeLocationKey, undefined);

const emit = defineEmits<{
  'git-updated': [overview: ProjectGitOverview];
}>();

type GitTab =
  | 'branches'
  | 'sync'
  | 'diff'
  | 'commit'
  | 'undo'
  | 'pull-request'
  | 'history';

const tabs: Array<{ id: GitTab; label: string; icon: string }> = [
  { id: 'sync', label: 'Sincronização', icon: '↕' },
  { id: 'branches', label: 'Branches', icon: '⑂' },
  { id: 'diff', label: 'Diff', icon: '±' },
  { id: 'commit', label: 'Commit', icon: '●' },
  { id: 'undo', label: 'Desfazer', icon: '↶' },
  { id: 'pull-request', label: 'Pull Request', icon: '↗' },
  { id: 'history', label: 'Histórico', icon: '◷' },
];

const activeTab = ref<GitTab>('sync');
const overview = ref<ProjectGitOverview | null>(null);
const workspace = ref<ProjectGitWorkspace | null>(null);
const loading = ref(false);
const loadingWorkspace = ref(false);
const remoteRefreshRunning = ref(false);
const errorMessage = ref('');
const workspaceErrorMessage = ref('');
const mutationRunning = ref(false);
const mutationMessage = ref('');
const mutationErrorMessage = ref('');
const createBranchName = ref('');
const commitMessage = ref('');
const commitMode = ref<CommitMode>('create');
let generation = 0;

useAutoDismiss(errorMessage, '');
useAutoDismiss(workspaceErrorMessage, '');
useAutoDismiss(mutationMessage, '');
useAutoDismiss(mutationErrorMessage, '');

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function openTab(tab: GitTab): void {
  activeTab.value = tab;
  if (tab === 'sync') {
    void refreshRemotesSilently();
  }
}

function tabFromQuery(): GitTab {
  const value = Array.isArray(route?.query.tab) ? route.query.tab[0] : route?.query.tab;
  return tabs.some((tab) => tab.id === value) ? value as GitTab : 'sync';
}

async function loadGit(): Promise<void> {
  const requestGeneration = ++generation;
  loading.value = true;
  errorMessage.value = '';

  try {
    const result = await fetchProjectGit(props.project.id);
    if (requestGeneration !== generation) return;
    overview.value = result;
    emit('git-updated', result);
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

function configuredRemoteNames(): string[] {
  return (workspace.value?.remotes ?? [])
    .filter((remote) => remote.name === 'origin' || remote.name === 'upstream')
    .map((remote) => remote.name);
}

async function refreshRemotesSilently(): Promise<void> {
  if (remoteRefreshRunning.value || mutationRunning.value) return;
  const remotes = configuredRemoteNames();
  if (remotes.length === 0) return;

  remoteRefreshRunning.value = true;
  try {
    const results = await Promise.allSettled(
      remotes.map((remote) => fetchProjectGitRemote(props.project.id, remote)),
    );
    if (results.some((result) => result.status === 'fulfilled')) {
      await loadWorkspace();
    }
  } finally {
    remoteRefreshRunning.value = false;
  }
}

async function reloadGitData(): Promise<void> {
  await loadGit();
  await Promise.all([
    loadWorkspace(),
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

async function runRenameBranch(
  currentName: string,
  nextName: string,
): Promise<void> {
  if (mutationRunning.value) return;
  mutationRunning.value = true;
  mutationMessage.value = '';
  mutationErrorMessage.value = '';

  try {
    const confirmationToken = await prepareProjectGitBranchRename(
      props.project.id,
      currentName,
      nextName,
    );
    const branch = await renameProjectGitBranch(
      props.project.id,
      currentName,
      nextName,
      confirmationToken,
    );
    mutationMessage.value =
      `Branch "${currentName}" renomeada para "${branch}".`;
    await reloadGitData();
  } catch (error) {
    mutationErrorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível renomear a branch.';
  } finally {
    mutationRunning.value = false;
  }
}

async function runDeleteBranch(branch: string): Promise<void> {
  if (mutationRunning.value) return;
  mutationRunning.value = true;
  mutationMessage.value = '';
  mutationErrorMessage.value = '';

  try {
    const confirmationToken = await prepareProjectGitBranchDelete(
      props.project.id,
      branch,
    );
    const removedBranch = await deleteProjectGitBranch(
      props.project.id,
      branch,
      confirmationToken,
    );
    mutationMessage.value = `Branch "${removedBranch}" removida.`;
    await reloadGitData();
  } catch (error) {
    mutationErrorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível remover a branch.';
  } finally {
    mutationRunning.value = false;
  }
}

async function runRefreshRemotes(): Promise<void> {
  if (mutationRunning.value || remoteRefreshRunning.value) return;
  const remotes = configuredRemoteNames();
  if (remotes.length === 0) {
    mutationErrorMessage.value = 'Nenhum remote configurado para atualizar.';
    return;
  }

  mutationRunning.value = true;
  mutationMessage.value = '';
  mutationErrorMessage.value = '';

  try {
    await Promise.all(
      remotes.map((remote) => fetchProjectGitRemote(props.project.id, remote)),
    );
    mutationMessage.value = 'Branches remotas atualizadas.';
    await reloadGitData();
  } catch (error) {
    mutationErrorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível atualizar as branches remotas.';
  } finally {
    mutationRunning.value = false;
  }
}

async function runTrackRemoteBranch(remoteBranch: string): Promise<void> {
  if (mutationRunning.value || remoteRefreshRunning.value) return;
  const message =
    `Trazer "${remoteBranch}" para uma branch local e trocar para ela? A árvore de trabalho deve estar limpa.`;
  if (
    typeof window !== 'undefined'
    && !window.confirm(message)
  ) {
    return;
  }

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
    mutationMessage.value =
      `Branch remota "${remoteBranch}" criada localmente como "${branch}" e selecionada.`;
    await reloadGitData();
  } catch (error) {
    mutationErrorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível trazer a branch remota para local.';
  } finally {
    mutationRunning.value = false;
  }
}

async function runDeleteRemoteBranch(remoteBranch: string): Promise<void> {
  if (mutationRunning.value || remoteRefreshRunning.value) return;
  mutationRunning.value = true;
  mutationMessage.value = '';
  mutationErrorMessage.value = '';

  try {
    const confirmation = await prepareProjectGitRemoteBranchDelete(
      props.project.id,
      remoteBranch,
    );
    const branch = await deleteProjectGitRemoteBranch(
      props.project.id,
      remoteBranch,
      confirmation.token,
    );
    mutationMessage.value = `Branch remota "origin/${branch}" removida.`;
    await reloadGitData();
  } catch (error) {
    mutationErrorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível remover a branch remota.';
  } finally {
    mutationRunning.value = false;
  }
}

async function runMainSynchronization(): Promise<void> {
  if (mutationRunning.value || remoteRefreshRunning.value) return;
  const message =
    'Sincronizar a main com o repositório principal e publicar em origin/main? A árvore de trabalho deve estar limpa.';
  if (
    typeof window !== 'undefined'
    && !window.confirm(message)
  ) {
    return;
  }

  mutationRunning.value = true;
  mutationMessage.value = '';
  mutationErrorMessage.value = '';

  try {
    const confirmation = await prepareProjectGitMainSync(
      props.project.id,
    );
    const result = await synchronizeProjectGitMain(
      props.project.id,
      confirmation.token,
    );
    mutationMessage.value = result.changed
      ? 'Main atualizada e publicada em origin/main.'
      : 'Main e origin/main já estavam sincronizadas.';
    await reloadGitData();
  } catch (error) {
    mutationErrorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível sincronizar a main.';
  } finally {
    mutationRunning.value = false;
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

  const amend = commitMode.value === 'amend';
  const confirmationText = amend
    ? `Alterar o último commit para "${message}"?`
    : `Criar o commit "${message}" com todas as alterações rastreadas?`;
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
    const operation = amend ? 'amend' : 'commit';
    const confirmation = await prepareProjectGitMutation(
      props.project.id,
      operation,
      currentBranchOrHead(),
    );
    const commit = amend
      ? await amendProjectGit(
          props.project.id,
          message,
          confirmation.token,
        )
      : await commitProjectGit(
          props.project.id,
          message,
          true,
          confirmation.token,
        );
    mutationMessage.value = amend
      ? `Commit "${commit.shortHash}" alterado: ${commit.subject}`
      : `Commit "${commit.shortHash}" criado: ${commit.subject}`;
    commitMessage.value = '';
    commitMode.value = 'create';
    await reloadGitData();
  } catch (error) {
    mutationErrorMessage.value =
      error instanceof Error
        ? error.message
        : amend
          ? 'Não foi possível alterar o último commit.'
          : 'Não foi possível criar o commit.';
  } finally {
    mutationRunning.value = false;
  }
}

watch(
  () => props.project.id,
  async () => {
    overview.value = null;
    workspace.value = null;
    commitMessage.value = '';
    commitMode.value = 'create';
    activeTab.value = tabFromQuery();
    await Promise.all([
      loadGit(),
      loadWorkspace(),
    ]);
    void refreshRemotesSilently();
  },
  { immediate: true },
);

watch(() => route?.query.tab, () => openTab(tabFromQuery()));
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
      <ProjectGitSyncPage
        v-if="activeTab === 'sync'"
        :overview="overview"
        :workspace="workspace"
        :busy="mutationRunning"
        :checking="remoteRefreshRunning"
        @synchronize="runMainSynchronization"
      />

      <ProjectGitBranchesPage
        v-else-if="activeTab === 'branches'"
        :overview="overview"
        :workspace="workspace"
        :loading="loadingWorkspace"
        :busy="mutationRunning || remoteRefreshRunning"
        @create="(name) => runMutation('create-branch', name)"
        @switch="(name) => runMutation('switch-branch', name)"
        @rename="runRenameBranch"
        @delete="runDeleteBranch"
        @refresh-remotes="runRefreshRemotes"
        @track="runTrackRemoteBranch"
        @delete-remote="runDeleteRemoteBranch"
      />

      <ProjectGitDiffPage
        v-else-if="activeTab === 'diff'"
        :project-id="project.id"
      />

      <ProjectGitCommitPage
        v-else-if="activeTab === 'commit'"
        v-model:message="commitMessage"
        v-model:mode="commitMode"
        :overview="overview"
        :busy="mutationRunning"
        @submit="runCommit"
      />

      <ProjectGitUndoPage
        v-else-if="activeTab === 'undo'"
        :project-id="project.id"
        :overview="overview"
        :busy="mutationRunning"
        @changed="reloadGitData"
      />

      <ProjectGitPullRequestPage
        v-else-if="activeTab === 'pull-request'"
        :project-id="project.id"
        :overview="overview"
        :workspace="workspace"
        :busy="mutationRunning"
      />

      <ProjectGitHistoryPage v-else :project-id="project.id" />
    </template>
  </section>
</template>

<style scoped src="./ProjectGitPanel.css"></style>
