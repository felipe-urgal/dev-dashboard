import { ref, watch } from 'vue';

import type {
  Project,
  ProjectChangeImpact,
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
  pullProjectGitBranch,
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
import type { CommitMode } from '../components/ProjectGitCommitPage.vue';
import { confirmDialog } from '../stores/app-dialog';
import { useAutoDismiss } from './useAutoDismiss';

export function useProjectGitPanel(
  props: Readonly<{ project: Project }>,
  route: { query: Record<string, unknown> } | undefined,
  emit: (event: 'git-updated', overview: ProjectGitOverview) => void,
) {
  type GitTab =
    | 'branches'
    | 'sync'
    | 'diff'
    | 'commit'
    | 'undo'
    | 'pull-request'
    | 'history'
    | 'mutation-history';

  const tabs: Array<{ id: GitTab; label: string; icon: string }> = [
    { id: 'sync', label: 'Sincronização', icon: '↕' },
    { id: 'branches', label: 'Branches', icon: '⑂' },
    { id: 'diff', label: 'Diff', icon: '±' },
    { id: 'commit', label: 'Commit', icon: '●' },
    { id: 'undo', label: 'Desfazer', icon: '↶' },
    { id: 'pull-request', label: 'Pull Request', icon: '↗' },
    { id: 'history', label: 'Histórico', icon: '◷' },
    { id: 'mutation-history', label: 'Mutações', icon: '☰' },
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
  const amendedBranch = ref<string | null>(null);
  const changeImpact = ref<ProjectChangeImpact | null>(null);
  let generation = 0;

  /** Só vale a pena mostrar o banner quando há alguma recomendação real. */
  function applyChangeImpact(impact: ProjectChangeImpact | undefined): void {
    changeImpact.value = impact && impact.actions.length > 0 ? impact : null;
  }

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
    const value = Array.isArray(route?.query.tab)
      ? route.query.tab[0]
      : route?.query.tab;
    return tabs.some((tab) => tab.id === value) ? (value as GitTab) : 'sync';
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
      workspace.value = await fetchProjectGitWorkspace(props.project.id);
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
      .filter(
        (remote) => remote.name === 'origin' || remote.name === 'upstream',
      )
      .map((remote) => remote.name);
  }

  async function refreshRemotesSilently(): Promise<void> {
    if (remoteRefreshRunning.value || mutationRunning.value) return;
    const remotes = configuredRemoteNames();
    if (remotes.length === 0) return;

    remoteRefreshRunning.value = true;
    try {
      const results = await Promise.allSettled(
        remotes.map((remote) =>
          fetchProjectGitRemote(props.project.id, remote),
        ),
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
    await Promise.all([loadWorkspace()]);
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

    const creatingBranch = operation === 'create-branch';
    const confirmed = await confirmDialog({
      title: creatingBranch ? 'Criar branch?' : 'Trocar de branch?',
      message: creatingBranch
        ? `A branch "${trimmed}" será criada a partir do HEAD atual. A árvore de trabalho deve estar limpa.`
        : `O projeto trocará para a branch "${trimmed}". A árvore de trabalho deve estar limpa.`,
      confirmLabel: creatingBranch ? 'Criar branch' : 'Trocar de branch',
      tone: 'warning',
    });
    if (!confirmed) return;

    mutationRunning.value = true;
    mutationMessage.value = '';
    mutationErrorMessage.value = '';
    changeImpact.value = null;

    try {
      const confirmation = await prepareProjectGitMutation(
        props.project.id,
        operation,
        trimmed,
      );
      if (operation === 'create-branch') {
        const branch = await createProjectGitBranch(
          props.project.id,
          trimmed,
          confirmation.token,
        );
        mutationMessage.value = `Branch "${branch}" criada e selecionada.`;
      } else {
        const result = await switchProjectGitBranch(
          props.project.id,
          trimmed,
          confirmation.token,
        );
        mutationMessage.value = `Agora na branch "${result.branch}".`;
        applyChangeImpact(result.impact);
      }
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
      mutationMessage.value = `Branch "${currentName}" renomeada para "${branch}".`;
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
        remotes.map((remote) =>
          fetchProjectGitRemote(props.project.id, remote),
        ),
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
    const confirmed = await confirmDialog({
      title: 'Criar branch local?',
      message:
        `A branch remota "${remoteBranch}" será trazida para uma branch ` +
        'local e selecionada. A árvore de trabalho deve estar limpa.',
      confirmLabel: 'Criar e trocar',
      tone: 'warning',
    });
    if (!confirmed) return;

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
      mutationMessage.value = `Branch remota "${remoteBranch}" criada localmente como "${branch}" e selecionada.`;
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

  async function runUpdateCurrentBranch(): Promise<void> {
    if (mutationRunning.value || remoteRefreshRunning.value) return;

    const branch = overview.value?.branch;
    const upstream = overview.value?.upstream;
    if (!branch || overview.value?.detached) {
      mutationErrorMessage.value =
        'Selecione uma branch local antes de atualizar.';
      return;
    }
    if (!upstream) {
      mutationErrorMessage.value = `A branch "${branch}" não possui upstream configurado.`;
      return;
    }
    if (!overview.value?.clean) {
      mutationErrorMessage.value =
        'Guarde ou confirme as alterações locais antes de atualizar a branch.';
      return;
    }

    const confirmed = await confirmDialog({
      title: 'Atualizar branch local?',
      message:
        `Os commits de "${upstream}" serão trazidos para "${branch}" ` +
        'somente por fast-forward. Nenhum merge ou rebase será criado automaticamente.',
      confirmLabel: 'Atualizar local',
      tone: 'warning',
    });
    if (!confirmed) return;

    mutationRunning.value = true;
    mutationMessage.value = '';
    mutationErrorMessage.value = '';
    changeImpact.value = null;

    try {
      const confirmation = await prepareProjectGitMutation(
        props.project.id,
        'pull',
        branch,
      );
      const result = await pullProjectGitBranch(
        props.project.id,
        confirmation.token,
      );
      mutationMessage.value = `Branch "${result.branch}" atualizada a partir de ${upstream}.`;
      applyChangeImpact(result.impact);
      await reloadGitData();
    } catch (error) {
      mutationErrorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar a branch local.';
    } finally {
      mutationRunning.value = false;
    }
  }

  async function runMainSynchronization(): Promise<void> {
    if (mutationRunning.value || remoteRefreshRunning.value) return;
    const confirmed = await confirmDialog({
      title: 'Sincronizar main?',
      message:
        'A main será atualizada a partir do repositório principal e ' +
        'publicada em origin/main. A árvore de trabalho deve estar limpa.',
      confirmLabel: 'Sincronizar main',
      tone: 'warning',
    });
    if (!confirmed) return;

    mutationRunning.value = true;
    mutationMessage.value = '';
    mutationErrorMessage.value = '';
    changeImpact.value = null;

    try {
      const confirmation = await prepareProjectGitMainSync(props.project.id);
      const result = await synchronizeProjectGitMain(
        props.project.id,
        confirmation.token,
      );
      mutationMessage.value = result.changed
        ? 'Main atualizada e publicada em origin/main.'
        : 'Main e origin/main já estavam sincronizadas.';
      applyChangeImpact(result.impact);
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
    const branchBeforeCommit = overview.value?.branch;
    const upstreamBeforeCommit = overview.value?.upstream;
    const confirmed = await confirmDialog({
      title: amend ? 'Alterar último commit?' : 'Criar commit?',
      message: amend
        ? `O último commit será alterado para "${message}" e incluirá as alterações atuais.`
        : `O commit "${message}" incluirá todas as alterações rastreadas.`,
      confirmLabel: amend ? 'Alterar commit' : 'Criar commit',
      tone: 'warning',
    });
    if (!confirmed) return;

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
        ? await amendProjectGit(props.project.id, message, confirmation.token)
        : await commitProjectGit(
            props.project.id,
            message,
            true,
            confirmation.token,
          );
      mutationMessage.value = amend
        ? `Commit "${commit.shortHash}" alterado: ${commit.subject}`
        : `Commit "${commit.shortHash}" criado: ${commit.subject}`;
      if (
        amend &&
        branchBeforeCommit &&
        branchBeforeCommit !== 'main' &&
        branchBeforeCommit !== 'master' &&
        upstreamBeforeCommit === `origin/${branchBeforeCommit}`
      ) {
        amendedBranch.value = branchBeforeCommit;
      }
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
      amendedBranch.value = null;
      changeImpact.value = null;
      activeTab.value = tabFromQuery();
      await Promise.all([loadGit(), loadWorkspace()]);
      void refreshRemotesSilently();
    },
    { immediate: true },
  );

  watch(
    () => route?.query.tab,
    () => openTab(tabFromQuery()),
  );

  return {
    tabs,
    activeTab,
    overview,
    workspace,
    loading,
    loadingWorkspace,
    remoteRefreshRunning,
    errorMessage,
    workspaceErrorMessage,
    mutationRunning,
    mutationMessage,
    mutationErrorMessage,
    createBranchName,
    commitMessage,
    commitMode,
    amendedBranch,
    changeImpact,
    generation,
    formatDate,
    openTab,
    tabFromQuery,
    loadGit,
    loadWorkspace,
    configuredRemoteNames,
    refreshRemotesSilently,
    reloadGitData,
    runMutation,
    runRenameBranch,
    runDeleteBranch,
    runRefreshRemotes,
    runTrackRemoteBranch,
    runDeleteRemoteBranch,
    runUpdateCurrentBranch,
    runMainSynchronization,
    currentBranchOrHead,
    runCommit,
  };
}
