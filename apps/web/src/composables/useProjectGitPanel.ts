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

export type GitTab =
  'branches' | 'sync' | 'diff' | 'commit' | 'undo' | 'pull-request' | 'history';

export interface GitTabOption {
  id: GitTab;
  label: string;
  icon: string;
}

export function useProjectGitPanel(
  props: Readonly<{ project: Project }>,
  route: { query: Record<string, unknown> } | undefined,
  emit: (event: 'git-updated', overview: ProjectGitOverview) => void,
) {
  const tabs: GitTabOption[] = [
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
