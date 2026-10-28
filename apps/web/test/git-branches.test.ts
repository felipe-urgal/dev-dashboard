import { describe, expect, it } from 'vitest';

import type { GitBranch, ProjectGitWorkspace } from '@dev-dashboard/contracts';

import {
  buildBranchRows,
  canCreateBranch,
  canRenameBranch,
  filterBranchRows,
  groupBranchRows,
  isProtectedBranch,
  menuActionsOf,
  primaryActionOf,
  publicationOf,
  trackingBadge,
} from '../src/utils/git-branches';

function branch(overrides: Partial<GitBranch>): GitBranch {
  return {
    name: 'main',
    shortName: 'main',
    kind: 'local',
    current: false,
    ahead: 0,
    behind: 0,
    ...overrides,
  };
}

const local = (name: string, extra: Partial<GitBranch> = {}) =>
  branch({ name, shortName: name, ...extra });
const origin = (name: string) =>
  branch({
    name: `origin/${name}`,
    shortName: name,
    kind: 'remote',
    remote: 'origin',
  });

const workspace: ProjectGitWorkspace = {
  branches: [
    local('main', { upstream: 'origin/main' }),
    local('feature/atual', {
      current: true,
      upstream: 'origin/feature/atual',
      behind: 2,
    }),
    local('bugfix/local'),
    origin('main'),
    origin('feature/atual'),
    origin('feature/remota'),
  ],
  remotes: [
    {
      name: 'origin',
      fetchUrl: 'a',
      pushUrl: 'a',
      role: 'origin',
      defaultBranch: 'main',
    },
  ],
};

describe('buildBranchRows', () => {
  it('junta local e origin, ordena a atual primeiro e inclui as só-remotas', () => {
    const rows = buildBranchRows(workspace);

    expect(rows.map((row) => row.name)).toEqual([
      'feature/atual',
      'bugfix/local',
      'feature/remota',
      'main',
    ]);
    expect(publicationOf(rows[0]!)).toBe('published');
    expect(publicationOf(rows[1]!)).toBe('unpublished');
    expect(publicationOf(rows[2]!)).toBe('remote-only');
  });
});

describe('regras da linha', () => {
  const rows = buildBranchRows(workspace);
  const byName = (name: string) => rows.find((row) => row.name === name)!;

  it('protege a main e a branch padrão do origin', () => {
    expect(isProtectedBranch(byName('main'), workspace)).toBe(true);
    expect(isProtectedBranch(byName('bugfix/local'), workspace)).toBe(false);
  });

  it('escolhe a ação principal por contexto', () => {
    expect(primaryActionOf(byName('feature/atual'))).toBeNull();
    expect(primaryActionOf(byName('main'))).toBe('switch');
    expect(primaryActionOf(byName('bugfix/local'))).toBe('publish');
    expect(primaryActionOf(byName('feature/remota'))).toBe('track');
  });

  it('o menu não oferece remover a atual nem mexer em branch protegida', () => {
    expect(
      menuActionsOf(byName('feature/atual'), false).map((item) => item.key),
    ).toEqual(['rename', 'delete-remote']);
    expect(menuActionsOf(byName('main'), true)).toEqual([]);
    expect(
      menuActionsOf(byName('feature/remota'), false).map((item) => item.key),
    ).toEqual(['delete-remote']);
  });

  it('descreve atraso, adiantamento e divergência em relação ao remoto', () => {
    expect(trackingBadge(byName('feature/atual'))).toEqual({
      label: '2 commits atrás',
      tone: 'warning',
    });
    expect(trackingBadge(byName('main'))).toBeNull();
  });
});

describe('filtros e grupos', () => {
  const rows = buildBranchRows(workspace);

  it('filtra por busca e por tipo', () => {
    const names = (
      query: string,
      filter: 'all' | 'local' | 'remote' | 'unpublished',
    ) => filterBranchRows(rows, { query, filter }).map((row) => row.name);

    expect(names('FEATURE', 'all')).toEqual([
      'feature/atual',
      'feature/remota',
    ]);
    expect(names('', 'local')).toEqual([
      'feature/atual',
      'bugfix/local',
      'main',
    ]);
    expect(names('', 'remote')).toEqual(['feature/remota']);
    expect(names('', 'unpublished')).toEqual(['bugfix/local']);
  });

  it('separa atual, locais e somente no origin', () => {
    const groups = groupBranchRows(rows);

    expect(groups.current.map((row) => row.name)).toEqual(['feature/atual']);
    expect(groups.local.map((row) => row.name)).toEqual([
      'bugfix/local',
      'main',
    ]);
    expect(groups.remoteOnly.map((row) => row.name)).toEqual([
      'feature/remota',
    ]);
  });
});

describe('validação de nomes', () => {
  it('exige sufixo ao criar e nome novo e diferente ao renomear', () => {
    expect(canCreateBranch('feature/', '  ')).toBe(false);
    expect(canCreateBranch('feature/', 'novo-login')).toBe(true);
    expect(canRenameBranch('a', 'a')).toBe(false);
    expect(canRenameBranch('a', ' b ')).toBe(true);
  });
});
