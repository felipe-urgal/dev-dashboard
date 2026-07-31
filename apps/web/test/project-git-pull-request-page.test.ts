import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import type {
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

const api = vi.hoisted(() => ({
  composeProjectGitPullRequest: vi.fn(),
}));

vi.mock('../src/api', () => api);

import ProjectGitPullRequestPage from '../src/components/ProjectGitPullRequestPage.vue';

const latestCommit = {
  hash: 'a'.repeat(40),
  shortHash: 'aaaaaaa',
  subject: 'feat: abre Pull Request pelo painel',
  authorName: 'Dashboard Test',
  authorEmail: 'dashboard@example.test',
  authoredAt: '2026-07-31T10:00:00.000Z',
};

const overview: ProjectGitOverview = {
  repository: true,
  branch: 'feature/pull-request',
  detached: false,
  upstream: 'origin/feature/pull-request',
  ahead: 0,
  behind: 0,
  clean: true,
  files: [],
  latestCommit,
  recentCommits: [latestCommit],
  stashes: [],
};

const workspace: ProjectGitWorkspace = {
  remotes: [
    {
      name: 'origin',
      fetchUrl: 'git@github.com:felipe-urgal/dev-dashboard.git',
      pushUrl: 'git@github.com:felipe-urgal/dev-dashboard.git',
      role: 'origin',
    },
    {
      name: 'upstream',
      fetchUrl: 'git@github.com:empresa/dev-dashboard.git',
      pushUrl: 'git@github.com:empresa/dev-dashboard.git',
      role: 'upstream',
    },
  ],
  branches: [
    {
      name: 'feature/pull-request',
      shortName: 'feature/pull-request',
      kind: 'local',
      current: true,
      upstream: 'origin/feature/pull-request',
      ahead: 0,
      behind: 0,
      latestCommit,
    },
    {
      name: 'origin/main',
      shortName: 'main',
      kind: 'remote',
      current: false,
      remote: 'origin',
      ahead: 0,
      behind: 0,
    },
    {
      name: 'origin/develop',
      shortName: 'develop',
      kind: 'remote',
      current: false,
      remote: 'origin',
      ahead: 0,
      behind: 0,
    },
    {
      name: 'upstream/main',
      shortName: 'main',
      kind: 'remote',
      current: false,
      remote: 'upstream',
      ahead: 0,
      behind: 0,
    },
  ],
};

beforeEach(() => {
  vi.restoreAllMocks();
  api.composeProjectGitPullRequest.mockReset();
  api.composeProjectGitPullRequest.mockResolvedValue({
    provider: 'github',
    url: 'https://github.com/empresa/dev-dashboard/compare/main...felipe-urgal:feature/pull-request?expand=1',
    branch: 'feature/pull-request',
    defaultBranch: 'main',
  });
  vi.spyOn(window, 'open').mockReturnValue(window);
});

test('prefere upstream e preenche título e descrição a partir do commit', async () => {
  const wrapper = mount(ProjectGitPullRequestPage, {
    props: {
      projectId: 'p1',
      overview,
      workspace,
      busy: false,
    },
  });
  await flushPromises();

  const selects = wrapper.findAll('select');
  assert.equal((selects[0]!.element as HTMLSelectElement).value, 'upstream');
  assert.equal((selects[1]!.element as HTMLSelectElement).value, 'main');
  assert.equal(
    (wrapper.find('input:not([readonly])').element as HTMLInputElement).value,
    latestCommit.subject,
  );
  assert.match(
    (wrapper.find('textarea').element as HTMLTextAreaElement).value,
    /## Resumo/,
  );
});

test('abre a tela oficial com destino, base, título e descrição escolhidos', async () => {
  const wrapper = mount(ProjectGitPullRequestPage, {
    props: {
      projectId: 'p1',
      overview,
      workspace,
      busy: false,
    },
  });
  await flushPromises();

  const selects = wrapper.findAll('select');
  await selects[0]!.setValue('origin');
  await flushPromises();
  await selects[1]!.setValue('develop');
  await wrapper.find('input:not([readonly])').setValue('fix: título customizado');
  await wrapper.find('textarea').setValue('## Mudanças\n\nDescrição customizada.');
  await wrapper.find('form').trigger('submit');
  await flushPromises();

  assert.deepEqual(api.composeProjectGitPullRequest.mock.calls[0], [
    'p1',
    {
      targetRemote: 'origin',
      baseBranch: 'develop',
      title: 'fix: título customizado',
      description: '## Mudanças\n\nDescrição customizada.',
    },
  ]);
  assert.deepEqual(
    (window.open as ReturnType<typeof vi.fn>).mock.calls[0],
    [
      'https://github.com/empresa/dev-dashboard/compare/main...felipe-urgal:feature/pull-request?expand=1',
      '_blank',
      'noopener,noreferrer',
    ],
  );
});
