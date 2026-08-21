import type {
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

export interface ProjectGitUpdateIndicator {
  label: string;
  title: string;
}

export function getProjectGitUpdateIndicator(
  overview: ProjectGitOverview | null | undefined,
  workspace: ProjectGitWorkspace | null | undefined,
): ProjectGitUpdateIndicator | null {
  if (!overview?.repository) return null;

  const currentLocalBranch = workspace?.branches.find(
    (branch) => branch.kind === 'local' && branch.current,
  );
  const currentBranchName = currentLocalBranch?.name ?? overview.branch;
  const currentUpstream = currentLocalBranch?.upstream ?? overview.upstream;
  const currentBehind = Math.max(
    0,
    currentLocalBranch?.behind ?? overview.behind ?? 0,
  );
  const currentBranchNeedsUpdate = Boolean(
    currentBranchName &&
      currentBranchName !== 'main' &&
      currentUpstream &&
      currentBehind > 0,
  );

  const remotes = workspace?.remotes ?? [];
  const hasOrigin = remotes.some((remote) => remote.name === 'origin');
  const hasUpstream = remotes.some((remote) => remote.name === 'upstream');
  const localMain = workspace?.branches.find(
    (branch) => branch.kind === 'local' && branch.name === 'main',
  );
  const originMain = workspace?.branches.find(
    (branch) =>
      branch.kind === 'remote' &&
      branch.remote === 'origin' &&
      branch.shortName === 'main',
  );
  const upstreamMain = workspace?.branches.find(
    (branch) =>
      branch.kind === 'remote' &&
      branch.remote === 'upstream' &&
      branch.shortName === 'main',
  );

  const localMainHash = localMain?.latestCommit?.hash;
  const originMainHash = originMain?.latestCommit?.hash;
  const upstreamMainHash = upstreamMain?.latestCommit?.hash;
  const mainSyncAvailable = Boolean(localMain && hasOrigin && hasUpstream);
  const mainSynchronized = Boolean(
    localMainHash &&
      originMainHash &&
      upstreamMainHash &&
      localMainHash === originMainHash &&
      localMainHash === upstreamMainHash,
  );
  const mainNeedsSync = mainSyncAvailable && !mainSynchronized;

  if (currentBranchNeedsUpdate) {
    const commitLabel =
      currentBehind === 1 ? '1 commit novo' : `${currentBehind} commits novos`;
    const mainSuffix =
      mainNeedsSync && currentBranchName !== 'main'
        ? ' A main também possui sincronização pendente.'
        : '';

    return {
      label: `Atualizar · ${currentBehind}`,
      title: `${currentBranchName} tem ${commitLabel} no remoto.${mainSuffix}`,
    };
  }

  if (mainNeedsSync) {
    return {
      label: 'Sincronizar',
      title: 'A main possui sincronização pendente.',
    };
  }

  return null;
}
