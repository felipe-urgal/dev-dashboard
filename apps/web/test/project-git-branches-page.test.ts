import { mount } from '@vue/test-utils';
import { NDropdown } from 'naive-ui';
import { describe, expect, it } from 'vitest';

import type {
  GitBranch,
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

import ProjectGitBranchesPage from '../src/components/ProjectGitBranchesPage.vue';

const commit = {
  hash: 'abc123456789',
  shortHash: 'abc1234',
  subject: 'commit de teste',
  authorName: 'Dev',
  authorEmail: 'dev@example.test',
  authoredAt: '2026-07-31T10:00:00.000Z',
};

const branch = (overrides: Partial<GitBranch>): GitBranch => ({
  name: 'main',
  shortName: 'main',
  kind: 'local',
  current: false,
  ahead: 0,
  behind: 0,
  latestCommit: commit,
  ...overrides,
});

const remote = (name: string): GitBranch =>
  branch({
    name: `origin/${name}`,
    shortName: name,
    kind: 'remote',
    remote: 'origin',
  });

const overview = {
  repository: true,
  branch: 'main',
  detached: false,
  upstream: 'origin/main',
  ahead: 0,
  behind: 0,
  clean: true,
  files: [],
  recentCommits: [],
} as ProjectGitOverview;

const workspace: ProjectGitWorkspace = {
  branches: [
    branch({ current: true, upstream: 'origin/main' }),
    remote('main'),
    remote('feature/remota'),
    branch({ name: 'bugfix/local', shortName: 'bugfix/local' }),
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

function mountPage(overrides: Record<string, unknown> = {}) {
  return mount(ProjectGitBranchesPage, {
    props: {
      overview,
      workspace,
      loading: false,
      busy: false,
      remoteRefreshing: false,
      ...overrides,
    },
    global: { stubs: { Teleport: true } },
  });
}

const rowOf = (wrapper: ReturnType<typeof mountPage>, name: string) =>
  wrapper.find(`[data-branch="${name}"]`);

describe('ProjectGitBranchesPage', () => {
  it('traz uma branch só remota para local pela ação da linha', async () => {
    const wrapper = mountPage();

    await rowOf(wrapper, 'feature/remota')
      .findAll('button')
      .find((button) => button.text() === 'Trazer para local')!
      .trigger('click');

    expect(wrapper.emitted('track')).toEqual([['origin/feature/remota']]);
  });

  it('publica uma branch local e troca para outra pela ação da linha', async () => {
    const wrapper = mountPage({
      workspace: {
        ...workspace,
        branches: [
          ...workspace.branches,
          remote('outra'),
          branch({
            name: 'outra',
            shortName: 'outra',
            upstream: 'origin/outra',
          }),
        ],
      },
    });

    await rowOf(wrapper, 'bugfix/local')
      .findAll('button')
      .find((button) => button.text() === 'Publicar')!
      .trigger('click');
    await rowOf(wrapper, 'outra')
      .findAll('button')
      .find((button) => button.text() === 'Trocar')!
      .trigger('click');

    expect(wrapper.emitted('publish')).toEqual([['bugfix/local']]);
    expect(wrapper.emitted('switch')).toEqual([['outra']]);
  });

  it('remover do origin exige digitar o nome e emite o remoto', async () => {
    const wrapper = mountPage();

    rowOf(wrapper, 'feature/remota')
      .findComponent(NDropdown)
      .vm.$emit('select', 'delete-remote');
    await wrapper.vm.$nextTick();

    const dialog = wrapper.find('.git-branch-dialog');
    expect(dialog.text()).toContain('Remover branch remota');

    const submit = dialog.find('button[type="submit"]');
    expect(submit.attributes('disabled')).toBeDefined();

    await dialog.find('input').setValue('feature/remota');
    await dialog.trigger('submit');

    expect(wrapper.emitted('delete-remote')).toEqual([
      ['origin/feature/remota'],
    ]);
  });

  it('a branch protegida e a atual não oferecem remoção', () => {
    const wrapper = mountPage();

    // main: atual e protegida → sem menu; só-local comum ainda tem menu.
    expect(rowOf(wrapper, 'main').findComponent(NDropdown).exists()).toBe(
      false,
    );
    expect(
      rowOf(wrapper, 'bugfix/local').findComponent(NDropdown).exists(),
    ).toBe(true);
  });

  it('busca e filtros reduzem a lista e a branch atual abre o Pull Request', async () => {
    const wrapper = mountPage();

    await wrapper.find('input[type="search"]').setValue('remota');
    expect(
      wrapper
        .findAll('[data-branch]')
        .map((row) => row.attributes('data-branch')),
    ).toEqual(['feature/remota']);

    await wrapper.find('input[type="search"]').setValue('');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Abrir Pull Request')!
      .trigger('click');
    expect(wrapper.emitted('open-pull-request')).toHaveLength(1);
  });

  it('o botão Nova branch fica bloqueado enquanto outra operação roda', () => {
    const wrapper = mountPage({ busy: true });

    expect(
      wrapper
        .findAll('button')
        .find((button) => button.text() === 'Nova branch')!
        .attributes('disabled'),
    ).toBeDefined();
  });

  describe('regras de pareamento, proteção e confirmação', () => {
    const renamed: ProjectGitWorkspace = {
      branches: [
        branch({
          name: 'feature/new-name',
          shortName: 'feature/new-name',
          upstream: 'origin/feature/old-name',
        }),
        remote('feature/old-name'),
      ],
      remotes: [],
    };

    it('pareia a branch local renomeada com o origin que ela acompanha', () => {
      const wrapper = mountPage({ workspace: renamed });

      expect(wrapper.findAll('[data-branch]')).toHaveLength(1);
      expect(wrapper.text()).toContain('feature/new-name');
      expect(wrapper.text()).toContain('acompanha origin/feature/old-name');
    });

    it('confirma a remoção pelo nome remoto real, não pelo nome local', async () => {
      const wrapper = mountPage({ workspace: renamed });

      rowOf(wrapper, 'feature/new-name')
        .findComponent(NDropdown)
        .vm.$emit('select', 'delete-remote');
      await wrapper.vm.$nextTick();

      const dialog = wrapper.find('.git-branch-dialog');
      expect(dialog.text()).toContain('feature/old-name');
      const submit = dialog.find('button[type="submit"]');

      await dialog.find('input').setValue('feature/new-name');
      expect(submit.attributes('disabled')).toBeDefined();

      await dialog.find('input').setValue('feature/old-name');
      expect(submit.attributes('disabled')).toBeUndefined();

      await dialog.trigger('submit');
      expect(wrapper.emitted('delete-remote')).toEqual([
        ['origin/feature/old-name'],
      ]);
    });

    it('protege a branch padrão real do origin mesmo se não for main', () => {
      const wrapper = mountPage({
        overview: { ...overview, branch: 'develop' },
        workspace: {
          branches: [
            branch({
              name: 'develop',
              shortName: 'develop',
              current: true,
              upstream: 'origin/develop',
            }),
            remote('develop'),
          ],
          remotes: [
            {
              name: 'origin',
              fetchUrl: 'a',
              pushUrl: 'a',
              role: 'origin',
              defaultBranch: 'develop',
            },
          ],
        },
      });

      expect(rowOf(wrapper, 'develop').text()).toContain('protegida');
      expect(rowOf(wrapper, 'develop').findComponent(NDropdown).exists()).toBe(
        false,
      );
    });
  });

  it('mostra o estado de operação só na branch envolvida', () => {
    const local = (name: string) =>
      branch({ name, shortName: name, upstream: `origin/${name}` });
    const wrapper = mountPage({
      workspace: {
        branches: [
          branch({ current: true }),
          local('feature/target'),
          remote('feature/target'),
          local('feature/other'),
          remote('feature/other'),
        ],
        remotes: [],
      },
      busy: true,
      operation: { kind: 'switch', branch: 'feature/target' },
    });

    expect(rowOf(wrapper, 'feature/target').text()).toContain('Trocando…');
    expect(rowOf(wrapper, 'feature/other').text()).not.toContain('Trocando…');
  });

  it('cria a branch com o prefixo escolhido', async () => {
    const wrapper = mountPage({ workspace: { branches: [], remotes: [] } });

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Nova branch')!
      .trigger('click');

    const dialog = wrapper.find('.git-branch-dialog');
    await dialog
      .findAll('.git-branch-chips button')
      .find((button) => button.text() === 'bugfix/')!
      .trigger('click');
    await dialog.find('input[aria-label="Nome"]').setValue('novo-login');
    await dialog.trigger('submit');

    expect(wrapper.emitted('create')).toEqual([['bugfix/novo-login']]);
  });
});
