import assert from 'node:assert/strict';

import type {
  GitBranch,
  GitCommit,
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';
import { test } from 'vitest';

import { getProjectGitUpdateIndicator } from '../src/utils/project-git-update-indicator';

const commits: Record<string, GitCommit> = {
  local: {
    hash: '1111111111111111111111111111111111111111',
    shortHash: '1111111',
    subject: 'local',
    authorName: 'Dev',
    authorEmail: 'dev@example.com',
    authoredAt: '2026-08-21T12:00:00.000Z',
  },
  origin: {
    hash: '2222222222222222222222222222222222222222',
    shortHash: '2222222',
    subject: 'origin',
    authorName: 'Dev',
    authorEmail: 'dev@example.com',
    authoredAt: '2026-08-21T12:01:00.000Z',
  },
  upstream: {
    hash: '3333333333333333333333333333333333333333',
    shortHash: '3333333',
    subject: 'upstream',
    authorName: 'Dev',
    authorEmail: 'dev@example.com',
    authoredAt: '2026-08-21T12:02:00.000Z',
  },
};

function overview(
  overrides: Partial<ProjectGitOverview> = {},
): ProjectGitOverview {
  return {
    repository: true,
    branch: 'feature/header-update',
    detached: false,
    upstream: 'origin/feature/header-update',
    ahead: 0,
    behind: 0,
    clean: true,
    files: [],
    recentCommits: [],
    ...overrides,
  };
}

function branch(overrides: Partial<GitBranch>): GitBranch {
  return {
    name: 'feature/header-update',
    shortName: 'feature/header-update',
    kind: 'local',
    current: false,
    ahead: 0,
    behind: 0,
    ...overrides,
  };
}

function workspace(
  branches: GitBranch[],
  remotes: ProjectGitWorkspace['remotes'] = [
    {
      name: 'origin',
      fetchUrl: 'git@example.com:fork/repo.git',
      pushUrl: 'git@example.com:fork/repo.git',
      role: 'origin',
    },
    {
      name: 'upstream',
      fetchUrl: 'git@example.com:source/repo.git',
      pushUrl: 'git@example.com:source/repo.git',
      role: 'upstream',
    },
  ],
): ProjectGitWorkspace {
  return { branches, remotes };
}

const synchronizedMainBranches = [
  branch({
    name: 'main',
    shortName: 'main',
    latestCommit: commits.local,
  }),
  branch({
    name: 'origin/main',
    shortName: 'main',
    kind: 'remote',
    remote: 'origin',
    latestCommit: commits.local,
  }),
  branch({
    name: 'upstream/main',
    shortName: 'main',
    kind: 'remote',
    remote: 'upstream',
    latestCommit: commits.local,
  }),
];

test('mostra a quantidade de commits remotos quando a branch atual pode ser atualizada', () => {
  const result = getProjectGitUpdateIndicator(
    overview({ behind: 2 }),
    workspace([
      branch({
        current: true,
        upstream: 'origin/feature/header-update',
        behind: 2,
      }),
      ...synchronizedMainBranches,
    ]),
  );

  assert.deepEqual(result, {
    label: 'Atualizar · 2',
    title: 'feature/header-update tem 2 commits novos no remoto.',
  });
});

test('mostra sincronização pendente quando main, origin e upstream divergem', () => {
  const result = getProjectGitUpdateIndicator(
    overview({ branch: 'main', upstream: 'origin/main' }),
    workspace([
      branch({
        name: 'main',
        shortName: 'main',
        current: true,
        upstream: 'origin/main',
        latestCommit: commits.local,
      }),
      branch({
        name: 'origin/main',
        shortName: 'main',
        kind: 'remote',
        remote: 'origin',
        latestCommit: commits.origin,
      }),
      branch({
        name: 'upstream/main',
        shortName: 'main',
        kind: 'remote',
        remote: 'upstream',
        latestCommit: commits.upstream,
      }),
    ]),
  );

  assert.deepEqual(result, {
    label: 'Sincronizar',
    title: 'A main possui sincronização pendente.',
  });
});

test('mantém o header limpo quando branch e main já estão atualizadas', () => {
  const result = getProjectGitUpdateIndicator(
    overview(),
    workspace([
      branch({
        current: true,
        upstream: 'origin/feature/header-update',
      }),
      ...synchronizedMainBranches,
    ]),
  );

  assert.equal(result, null);
});

test('não anuncia sincronização de main quando os remotes necessários não existem', () => {
  const result = getProjectGitUpdateIndicator(
    overview({ branch: 'main', upstream: 'origin/main' }),
    workspace(
      [
        branch({
          name: 'main',
          shortName: 'main',
          current: true,
          upstream: 'origin/main',
          latestCommit: commits.local,
        }),
        branch({
          name: 'origin/main',
          shortName: 'main',
          kind: 'remote',
          remote: 'origin',
          latestCommit: commits.origin,
        }),
      ],
      [
        {
          name: 'origin',
          fetchUrl: 'git@example.com:fork/repo.git',
          pushUrl: 'git@example.com:fork/repo.git',
          role: 'origin',
        },
      ],
    ),
  );

  assert.equal(result, null);
});
