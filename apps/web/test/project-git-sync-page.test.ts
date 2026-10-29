import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import type {
  GitBranch,
  GitCommit,
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

import ProjectGitSyncPage from '../src/components/ProjectGitSyncPage.vue';

const commit = (hash: string): GitCommit => ({
  hash,
  shortHash: hash.slice(0, 7),
  subject: `commit ${hash}`,
  authorName: 'Dev',
  authorEmail: 'dev@example.test',
  authoredAt: '2026-09-10T12:00:00.000Z',
});

function branch(overrides: Partial<GitBranch>): GitBranch {
  return {
    name: 'main',
    shortName: 'main',
    kind: 'local',
    current: true,
    ahead: 0,
    behind: 0,
    ...overrides,
  };
}

/** Workspace com main local, origin e (opcionalmente) upstream. */
function workspaceOf(options: {
  localHash?: string;
  originHash?: string;
  upstream?: boolean;
  upstreamHash?: string;
  extra?: GitBranch[];
  localBehind?: number;
}): ProjectGitWorkspace {
  const localHash = options.localHash ?? 'aaaaaaa1';
  const remote = (name: string, hash: string): GitBranch =>
    branch({
      name: `${name}/main`,
      kind: 'remote',
      current: false,
      remote: name,
      latestCommit: commit(hash),
    });

  return {
    branches: [
      branch({
        upstream: 'origin/main',
        behind: options.localBehind ?? 0,
        latestCommit: commit(localHash),
        current: !options.extra?.some((item) => item.current),
      }),
      remote('origin', options.originHash ?? localHash),
      ...(options.upstream
        ? [remote('upstream', options.upstreamHash ?? localHash)]
        : []),
      ...(options.extra ?? []),
    ],
    remotes: [
      { name: 'origin', fetchUrl: 'a', pushUrl: 'a', role: 'origin' },
      ...(options.upstream
        ? [
            {
              name: 'upstream',
              fetchUrl: 'b',
              pushUrl: 'b',
              role: 'upstream' as const,
            },
          ]
        : []),
    ],
  };
}

const overview = (overrides: Partial<ProjectGitOverview> = {}) =>
  ({
    repository: true,
    branch: 'main',
    detached: false,
    upstream: 'origin/main',
    ahead: 0,
    behind: 0,
    clean: true,
    files: [],
    recentCommits: [],
    ...overrides,
  }) as ProjectGitOverview;

function mountPage(props: Record<string, unknown>) {
  return mount(ProjectGitSyncPage, {
    props: { busy: false, checking: false, ...props } as never,
  });
}

const syncButton = (wrapper: ReturnType<typeof mountPage>) =>
  wrapper
    .find('.git-flow-summary')
    .findAll('button')
    .find((button) => button.text().includes('Sincroniz'))!;

describe('ProjectGitSyncPage', () => {
  it('desatualizada: descreve a diferença e sincroniza pelo botão', async () => {
    const wrapper = mountPage({
      overview: overview(),
      workspace: workspaceOf({ originHash: 'bbbbbbb2', localBehind: 3 }),
    });

    expect(wrapper.text()).toContain(
      'main está 3 commits atrás de origin/main',
    );
    expect(syncButton(wrapper).attributes('disabled')).toBeUndefined();

    await syncButton(wrapper).trigger('click');
    expect(wrapper.emitted('synchronize')).toHaveLength(1);
  });

  it('com alterações locais bloqueia a sincronização e leva para o Commit', async () => {
    const wrapper = mountPage({
      overview: overview({
        clean: false,
        files: [
          { path: 'a.rb', status: 'modified' },
          { path: 'b.rb', status: 'modified' },
        ] as never,
      }),
      workspace: workspaceOf({ originHash: 'bbbbbbb2', localBehind: 1 }),
    });

    expect(wrapper.text()).toContain('2 arquivos alterados');
    expect(syncButton(wrapper).attributes('disabled')).toBeDefined();

    const toCommit = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Ir para Commit')!;
    await toCommit.trigger('click');
    expect(wrapper.emitted('open-commit')).toHaveLength(1);
  });

  describe('branch em uso', () => {
    const feature = (behind: number, ahead = 0): GitBranch =>
      branch({
        name: 'feature/x',
        shortName: 'feature/x',
        upstream: 'origin/feature/x',
        behind,
        ahead,
        latestCommit: commit('ccccccc3'),
      });

    const featureOverview = (behind: number, ahead = 0) =>
      overview({
        branch: 'feature/x',
        upstream: 'origin/feature/x',
        behind,
        ahead,
      });

    it('atrasada: oferece atualizar e emite o evento', async () => {
      const wrapper = mountPage({
        overview: featureOverview(2),
        workspace: workspaceOf({ extra: [feature(2)] }),
      });

      const card = wrapper.find('.git-current');
      expect(card.text()).toContain('feature/x');
      expect(card.text()).toContain('origin/feature/x');
      expect(card.text()).toContain('2 commits novos no remoto');

      await card
        .findAll('button')
        .find((button) => button.text() === 'Atualizar local')!
        .trigger('click');
      expect(wrapper.emitted('update-current-branch')).toHaveLength(1);
    });
  });
});
