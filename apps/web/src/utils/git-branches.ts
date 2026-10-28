import type { GitBranch, ProjectGitWorkspace } from '@dev-dashboard/contracts';

export interface BranchRow {
  name: string;
  local?: GitBranch | undefined;
  origin?: GitBranch | undefined;
}

export type BranchFilter = 'all' | 'local' | 'remote' | 'unpublished';
export type BranchPrimaryAction = 'switch' | 'publish' | 'track';
export type BranchMenuAction = 'rename' | 'delete' | 'delete-remote';

export const BRANCH_PREFIXES = [
  'feature/',
  'bugfix/',
  'hotfix/',
  'docs/',
  'refactor/',
  'test/',
] as const;

export const BRANCH_NAME_MAX = 200;

/** Junta a branch local com o seu remoto (origin) em uma linha só. */
export function buildBranchRows(
  workspace: ProjectGitWorkspace | null,
): BranchRow[] {
  const branches = workspace?.branches ?? [];
  const originBranches = branches.filter(
    (branch) => branch.kind === 'remote' && branch.remote === 'origin',
  );
  const claimed = new Set<string>();
  const byName = new Map<string, BranchRow>();

  for (const local of branches.filter((branch) => branch.kind === 'local')) {
    const trackedOrigin = local.upstream?.startsWith('origin/')
      ? originBranches.find((remote) => remote.name === local.upstream)
      : originBranches.find((remote) => remote.shortName === local.name);
    if (trackedOrigin) claimed.add(trackedOrigin.name);
    byName.set(local.name, { name: local.name, local, origin: trackedOrigin });
  }

  for (const origin of originBranches) {
    if (claimed.has(origin.name)) continue;
    byName.set(origin.shortName, { name: origin.shortName, origin });
  }

  return [...byName.values()].sort((left, right) => {
    const leftCurrent = Boolean(left.local?.current);
    if (leftCurrent !== Boolean(right.local?.current)) {
      return leftCurrent ? -1 : 1;
    }
    return left.name.localeCompare(right.name, 'pt-BR');
  });
}

export function isProtectedBranch(
  row: BranchRow,
  workspace: ProjectGitWorkspace | null,
): boolean {
  const originDefault = workspace?.remotes.find(
    (remote) => remote.name === 'origin',
  )?.defaultBranch;
  return (
    row.name === 'main' ||
    row.name === 'master' ||
    Boolean(originDefault && row.name === originDefault)
  );
}

export type Publication = 'published' | 'unpublished' | 'remote-only';

export function publicationOf(row: BranchRow): Publication {
  if (row.local && row.origin) return 'published';
  return row.local ? 'unpublished' : 'remote-only';
}

function commits(count: number): string {
  return `${count} ${count === 1 ? 'commit' : 'commits'}`;
}

/** Relação da branch local com o seu remoto; vazio quando iguais. */
export function trackingBadge(
  row: BranchRow,
): { label: string; tone: 'warning' | 'accent' } | null {
  const local = row.local;
  if (!local || !row.origin) return null;
  if (local.ahead > 0 && local.behind > 0) {
    return { label: 'Divergente', tone: 'warning' };
  }
  if (local.behind > 0) {
    return { label: `${commits(local.behind)} atrás`, tone: 'warning' };
  }
  if (local.ahead > 0) {
    return { label: `${commits(local.ahead)} à frente`, tone: 'accent' };
  }
  return null;
}

export function primaryActionOf(row: BranchRow): BranchPrimaryAction | null {
  if (row.local?.current) return null;
  if (row.local) return row.origin ? 'switch' : 'publish';
  return row.origin ? 'track' : null;
}

export function menuActionsOf(
  row: BranchRow,
  isProtected: boolean,
): { key: BranchMenuAction; label: string; danger: boolean }[] {
  const actions: { key: BranchMenuAction; label: string; danger: boolean }[] =
    [];
  if (row.local && !isProtected) {
    actions.push({ key: 'rename', label: 'Renomear', danger: false });
  }
  if (row.local && !row.local.current && !isProtected) {
    actions.push({
      key: 'delete',
      label: 'Remover branch local',
      danger: true,
    });
  }
  if (row.origin && !isProtected) {
    actions.push({
      key: 'delete-remote',
      label: 'Remover do origin',
      danger: true,
    });
  }
  return actions;
}

export function filterBranchRows(
  rows: BranchRow[],
  options: { query: string; filter: BranchFilter },
): BranchRow[] {
  const query = options.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (query && !row.name.toLowerCase().includes(query)) return false;
    switch (options.filter) {
      case 'local':
        return Boolean(row.local);
      case 'remote':
        return !row.local;
      case 'unpublished':
        return Boolean(row.local) && !row.origin;
      default:
        return true;
    }
  });
}

export function groupBranchRows(rows: BranchRow[]): {
  current: BranchRow[];
  local: BranchRow[];
  remoteOnly: BranchRow[];
} {
  return {
    current: rows.filter((row) => row.local?.current),
    local: rows.filter((row) => row.local && !row.local.current),
    remoteOnly: rows.filter((row) => !row.local),
  };
}

export function countBranches(rows: BranchRow[]): {
  local: number;
  remoteOnly: number;
} {
  return {
    local: rows.filter((row) => row.local).length,
    remoteOnly: rows.filter((row) => !row.local).length,
  };
}

export function newBranchName(prefix: string, suffix: string): string {
  return `${prefix}${suffix.trim().replace(/^\/+/, '')}`;
}

export function canCreateBranch(prefix: string, suffix: string): boolean {
  const clean = suffix.trim().replace(/^\/+/, '');
  return (
    Boolean(clean) && newBranchName(prefix, suffix).length <= BRANCH_NAME_MAX
  );
}

export function canRenameBranch(current: string, next: string): boolean {
  const name = next.trim();
  return Boolean(name) && name !== current && name.length <= BRANCH_NAME_MAX;
}
