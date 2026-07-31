import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import type {
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

const api = vi.hoisted(() => ({
  composeProjectGitPullRequest: vi.fn(),
  getProjectGitPullRequestStatus: vi.fn(),
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

let popup: {
  opener: Window | null;
  closed: boolean;
  location: { href: string };
  close: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.restoreAllMocks();
  api.composeProjectGitPullRequest.mockReset();
  api.getProjectGitPullRequestStatus.mockReset();
  api.getProjectGitPullRequestStatus.mockResolvedValue({ checked: true });
  api.composeProjectGitPullRequest.mockResolvedValue({
    provider: 'github',
    url: 'https://github.com/empresa/dev-dashboard/compare/main...felipe-urgal:feature/pull-request?expand=1',
    branch: 'feature/pull-request',
    defaultBranch: 'main',
  });
  popup = {
    opener: window,
    closed: false,
    location: { href: 'about:blank' },
    close: vi.fn(),
  };
  vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
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
  assert.deepEqual(api.getProjectGitPullRequestStatus.mock.calls.at(-1), [
    'p1',
    { targetRemote: 'upstream', baseBranch: 'main' },
  ]);
});

test('reserva a aba no clique e navega sem falso erro nem botão duplicado', async () => {
  const wrapper = mount(ProjectGitPullRequestPage, {
    props: {
      projectId: 'p1',
      overview,
      workspace,
      busy: false,
    },
  });
  await flushPromises();
  await flushPromises();

  const selects = wrapper.findAll('select');
  await selects[0]!.setValue('origin');
  await flushPromises();
  await selects[1]!.setValue('develop');
  await flushPromises();
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
    ['', '_blank'],
  );
  assert.equal(popup.opener, null);
  assert.equal(
    popup.location.href,
    'https://github.com/empresa/dev-dashboard/compare/main...felipe-urgal:feature/pull-request?expand=1',
  );
  assert.ok(!wrapper.find('.git-pr-fallback-link').exists());
  assert.doesNotMatch(wrapper.text(), /navegador bloqueou/i);
});

test('troca a ação principal pelo link de continuação quando o popup é bloqueado', async () => {
  (window.open as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
  const wrapper = mount(ProjectGitPullRequestPage, {
    props: {
      projectId: 'p1',
      overview,
      workspace,
      busy: false,
    },
  });
  await flushPromises();
  await flushPromises();

  await wrapper.find('form').trigger('submit');
  await flushPromises();

  assert.match(wrapper.text(), /navegador bloqueou a nova aba/i);
  assert.ok(wrapper.find('.git-pr-fallback-link').exists());
  assert.ok(!wrapper.find('.git-pr-footer button').exists());
});

test('detecta PR aberta e substitui a criação por acesso ao PR existente', async () => {
  api.getProjectGitPullRequestStatus.mockResolvedValue({
    checked: true,
    existing: {
      provider: 'github',
      number: 42,
      title: 'feat: PR já existente',
      url: 'https://github.com/empresa/dev-dashboard/pull/42',
      sourceBranch: 'feature/pull-request',
      baseBranch: 'main',
    },
  });

  const wrapper = mount(ProjectGitPullRequestPage, {
    props: {
      projectId: 'p1',
      overview,
      workspace,
      busy: false,
    },
  });
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.text(), /PR #42 já está aberta/);
  assert.match(wrapper.text(), /feat: PR já existente/);
  assert.match(wrapper.text(), /feature\/pull-request → upstream\/main/);
  const existingLink = wrapper.find('.git-pr-existing-action');
  assert.ok(existingLink.exists());
  assert.equal(
    existingLink.attributes('href'),
    'https://github.com/empresa/dev-dashboard/pull/42',
  );
  assert.equal(wrapper.findAll('.git-pr-existing-action').length, 1);

  await wrapper.find('form').trigger('submit');
  await flushPromises();
  assert.equal(api.composeProjectGitPullRequest.mock.calls.length, 0);
});

test('refaz a verificação ao trocar o destino e libera criação quando não há PR', async () => {
  api.getProjectGitPullRequestStatus.mockImplementation(
    async (_projectId: string, input: { targetRemote: string; baseBranch: string }) => {
      if (input.targetRemote === 'upstream') {
        return {
          checked: true,
          existing: {
            provider: 'github',
            number: 42,
            title: 'feat: PR já existente',
            url: 'https://github.com/empresa/dev-dashboard/pull/42',
            sourceBranch: 'feature/pull-request',
            baseBranch: 'main',
          },
        };
      }
      return { checked: true };
    },
  );

  const wrapper = mount(ProjectGitPullRequestPage, {
    props: {
      projectId: 'p1',
      overview,
      workspace,
      busy: false,
    },
  });
  await flushPromises();
  await flushPromises();
  assert.ok(wrapper.find('.git-pr-existing-action').exists());

  const targetSelect = wrapper.findAll('select')[0]!;
  await targetSelect.setValue('origin');
  await flushPromises();
  await flushPromises();

  assert.ok(!wrapper.find('.git-pr-existing-action').exists());
  assert.deepEqual(api.getProjectGitPullRequestStatus.mock.calls.at(-1), [
    'p1',
    { targetRemote: 'origin', baseBranch: 'main' },
  ]);
  assert.equal(
    (wrapper.find('.git-pr-footer button').element as HTMLButtonElement).disabled,
    false,
  );
});
