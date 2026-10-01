import type {
  GitCommit,
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, expect, it } from 'vitest';

import ProjectGitBranchesPage from '../src/components/ProjectGitBranchesPage.vue';

const wrappers: VueWrapper[] = [];

const latestCommit: GitCommit = {
  hash: 'abc123456789',
  shortHash: 'abc1234',
  subject: 'fix: estabiliza branches',
  authorName: 'Dashboard Test',
  authorEmail: 'dashboard@example.test',
  authoredAt: '2026-08-26T10:00:00.000Z',
};

const overview: ProjectGitOverview = {
  repository: true,
  branch: 'bugfix/ajustar-layout',
  detached: false,
  upstream: 'origin/bugfix/ajustar-layout',
  ahead: 0,
  behind: 0,
  clean: true,
  files: [],
  latestCommit,
  recentCommits: [latestCommit],
};

function mountBranches(
  workspace: ProjectGitWorkspace,
  extraProps: Record<string, unknown> = {},
): VueWrapper {
  const wrapper = mount(ProjectGitBranchesPage, {
    attachTo: document.body,
    props: {
      overview,
      workspace,
      loading: false,
      busy: false,
      remoteRefreshing: false,
      ...extraProps,
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}

function rowByName(wrapper: VueWrapper, name: string) {
  const row = wrapper
    .findAll('.branch-table-row')
    .find((candidate) => candidate.text().includes(name));
  if (!row) throw new Error(`Branch não encontrada: ${name}`);
  return row;
}

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.innerHTML = '';
});

it('mantém Branches focado em CRUD e publicação inicial', async () => {
  const workspace: ProjectGitWorkspace = {
    branches: [
      {
        kind: 'local',
        name: 'bugfix/ajustar-layout',
        shortName: 'bugfix/ajustar-layout',
        current: true,
        upstream: 'origin/bugfix/ajustar-layout',
        ahead: 2,
        behind: 0,
        latestCommit,
      },
      {
        kind: 'remote',
        name: 'origin/bugfix/ajustar-layout',
        shortName: 'bugfix/ajustar-layout',
        current: false,
        remote: 'origin',
        ahead: 0,
        behind: 0,
        latestCommit,
      },
      {
        kind: 'local',
        name: 'feature/local-only',
        shortName: 'feature/local-only',
        current: false,
        ahead: 0,
        behind: 0,
        latestCommit,
      },
    ],
    remotes: [
      {
        name: 'origin',
        fetchUrl: 'git@example.com:fork/repo.git',
        pushUrl: 'git@example.com:fork/repo.git',
        role: 'origin',
        defaultBranch: 'main',
      },
    ],
  };

  const wrapper = mountBranches(workspace);
  const published = rowByName(wrapper, 'bugfix/ajustar-layout');
  await published.find('.branch-menu-trigger').trigger('click');
  expect(published.text()).not.toContain('Squash');
  expect(published.text()).not.toContain('Reenviar');
  expect(published.text()).not.toMatch(/\bEnviar\b/);

  const localOnly = rowByName(wrapper, 'feature/local-only');
  await localOnly.find('.branch-menu-trigger').trigger('click');
  expect(localOnly.text()).toContain('Publicar');
  expect(wrapper.find('button[aria-label="Atualizar remotas"]').exists()).toBe(
    false,
  );
});

it('pareia branch local renomeada com o origin que ela continua acompanhando', () => {
  const workspace: ProjectGitWorkspace = {
    branches: [
      {
        kind: 'local',
        name: 'feature/new-name',
        shortName: 'feature/new-name',
        current: true,
        upstream: 'origin/feature/old-name',
        ahead: 0,
        behind: 0,
        latestCommit,
      },
      {
        kind: 'remote',
        name: 'origin/feature/old-name',
        shortName: 'feature/old-name',
        current: false,
        remote: 'origin',
        ahead: 0,
        behind: 0,
        latestCommit,
      },
    ],
    remotes: [],
  };

  const wrapper = mountBranches(workspace);

  expect(wrapper.findAll('.branch-table-row')).toHaveLength(1);
  expect(wrapper.text()).toContain('feature/new-name');
  expect(wrapper.text()).toContain('acompanha origin/feature/old-name');
  expect(wrapper.text()).toContain('Em dia');
});

it('protege a default branch real do origin mesmo quando se chama develop', () => {
  const workspace: ProjectGitWorkspace = {
    branches: [
      {
        kind: 'local',
        name: 'develop',
        shortName: 'develop',
        current: true,
        upstream: 'origin/develop',
        ahead: 0,
        behind: 0,
        latestCommit,
      },
      {
        kind: 'remote',
        name: 'origin/develop',
        shortName: 'develop',
        current: false,
        remote: 'origin',
        ahead: 0,
        behind: 0,
        latestCommit,
      },
    ],
    remotes: [
      {
        name: 'origin',
        fetchUrl: 'git@example.com:fork/repo.git',
        pushUrl: 'git@example.com:fork/repo.git',
        role: 'origin',
        defaultBranch: 'develop',
      },
    ],
  };

  const wrapper = mountBranches(workspace);
  const row = rowByName(wrapper, 'develop');

  expect(row.find('.branch-protected-icon').exists()).toBe(true);
  expect(row.find('.branch-menu-trigger').exists()).toBe(false);
});

it('mostra o estado de operação apenas na branch envolvida', () => {
  const workspace: ProjectGitWorkspace = {
    branches: [
      {
        kind: 'local',
        name: 'main',
        shortName: 'main',
        current: true,
        ahead: 0,
        behind: 0,
        latestCommit,
      },
      {
        kind: 'local',
        name: 'feature/target',
        shortName: 'feature/target',
        current: false,
        ahead: 0,
        behind: 0,
        latestCommit,
      },
      {
        kind: 'local',
        name: 'feature/other',
        shortName: 'feature/other',
        current: false,
        ahead: 0,
        behind: 0,
        latestCommit,
      },
    ],
    remotes: [],
  };

  const wrapper = mountBranches(workspace, {
    busy: true,
    operation: { kind: 'switch', branch: 'feature/target' },
  });

  expect(rowByName(wrapper, 'feature/target').text()).toContain('Trocando…');
  expect(rowByName(wrapper, 'feature/other').text()).toContain('Trocar');
  expect(rowByName(wrapper, 'feature/other').text()).not.toContain('Trocando…');
});

it('continua criando branch pelo modal com prefixo', async () => {
  const workspace: ProjectGitWorkspace = {
    branches: [],
    remotes: [],
  };
  const wrapper = mountBranches(workspace);

  await wrapper.get('.branch-create-button').trigger('click');
  await flushPromises();

  const input = document.querySelector<HTMLInputElement>(
    'input[aria-label="Nome"]',
  );
  expect(input).not.toBeNull();
  input!.value = 'novo-login';
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  await flushPromises();

  const submit = [
    ...document.querySelectorAll<HTMLButtonElement>('button'),
  ].find((button) => button.textContent?.trim() === 'Criar e trocar');
  expect(submit).toBeDefined();
  submit!.click();
  await flushPromises();

  expect(wrapper.emitted('create')).toEqual([['feature/novo-login']]);
});

it('confirma pelo nome remoto real depois de renomear a branch local', async () => {
  const workspace: ProjectGitWorkspace = {
    branches: [
      {
        kind: 'local',
        name: 'feature/new-name',
        shortName: 'feature/new-name',
        current: false,
        upstream: 'origin/feature/old-name',
        ahead: 0,
        behind: 0,
        latestCommit,
      },
      {
        kind: 'remote',
        name: 'origin/feature/old-name',
        shortName: 'feature/old-name',
        current: false,
        remote: 'origin',
        ahead: 0,
        behind: 0,
        latestCommit,
      },
    ],
    remotes: [],
  };

  const wrapper = mountBranches(workspace);
  const row = rowByName(wrapper, 'feature/new-name');

  await row.find('.branch-menu-trigger').trigger('click');
  const removeRemote = row
    .findAll('button')
    .find((button) => button.text().includes('Remover do origin'));
  expect(removeRemote).toBeDefined();
  await removeRemote!.trigger('click');
  await flushPromises();

  expect(document.body.textContent).toContain('feature/old-name');

  const input = document.querySelector<HTMLInputElement>(
    'input[aria-label="Nome da branch"]',
  );
  expect(input).not.toBeNull();

  input!.value = 'feature/new-name';
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  await flushPromises();
  const submit = document.querySelector<HTMLButtonElement>(
    '.branch-modal .danger-button',
  );
  expect(submit).not.toBeNull();
  expect(submit?.disabled).toBe(true);

  input!.value = 'feature/old-name';
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  await flushPromises();
  expect(submit?.disabled).toBe(false);

  submit!.click();
  await flushPromises();
  expect(wrapper.emitted('delete-remote')).toEqual([
    ['origin/feature/old-name'],
  ]);
});
