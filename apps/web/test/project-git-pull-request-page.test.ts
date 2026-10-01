import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import type {
  GitOpenPullRequest,
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

const api = vi.hoisted(() => ({
  composeProjectGitPullRequest: vi.fn(),
  getProjectGitPullRequestStatus: vi.fn(),
  prepareProjectGitPullRequestAction: vi.fn(),
  runProjectGitPullRequestAction: vi.fn(),
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
};

const workspace: ProjectGitWorkspace = {
  remotes: [
    {
      name: 'origin',
      fetchUrl: 'git@github.com:felipe-urgal/dev-dashboard.git',
      pushUrl: 'git@github.com:felipe-urgal/dev-dashboard.git',
      role: 'origin',
      defaultBranch: 'main',
    },
    {
      name: 'upstream',
      fetchUrl: 'git@github.com:empresa/dev-dashboard.git',
      pushUrl: 'git@github.com:empresa/dev-dashboard.git',
      role: 'upstream',
      defaultBranch: 'develop',
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
      name: 'upstream/main',
      shortName: 'main',
      kind: 'remote',
      current: false,
      remote: 'upstream',
      ahead: 0,
      behind: 0,
    },
    {
      name: 'upstream/develop',
      shortName: 'develop',
      kind: 'remote',
      current: false,
      remote: 'upstream',
      ahead: 0,
      behind: 0,
    },
  ],
};

function githubPullRequest(
  overrides: Partial<GitOpenPullRequest> = {},
): GitOpenPullRequest {
  return {
    provider: 'github',
    number: 42,
    title: 'feat: PR existente',
    description: '## Resumo\n\nCorpo atual.',
    url: 'https://github.com/empresa/dev-dashboard/pull/42',
    sourceBranch: 'feature/pull-request',
    baseBranch: 'develop',
    ciStatus: 'success',
    commentsCount: 3,
    unresolvedConversationsCount: 0,
    cockpit: {
      remoteStatus: 'available',
      draft: false,
      mergeable: true,
      mergeableState: 'clean',
      reviewState: 'approved',
      requestedReviewers: [],
      checks: [{ name: 'Validate', status: 'success' }],
    },
    ...overrides,
  };
}

async function mountPage(
  lookup: { checked: boolean; existing?: GitOpenPullRequest } = {
    checked: true,
  },
  customWorkspace: ProjectGitWorkspace = workspace,
) {
  api.getProjectGitPullRequestStatus.mockResolvedValue(lookup);
  const wrapper = mount(ProjectGitPullRequestPage, {
    props: {
      projectId: 'p1',
      overview,
      workspace: customWorkspace,
      busy: false,
      forcePushBranch: null,
    },
  });
  await flushPromises();
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  vi.restoreAllMocks();
  for (const mock of Object.values(api)) mock.mockReset();
  api.getProjectGitPullRequestStatus.mockResolvedValue({ checked: true });
  api.composeProjectGitPullRequest.mockResolvedValue({
    provider: 'github',
    url: 'https://github.com/empresa/dev-dashboard/compare/develop...felipe-urgal:feature/pull-request?expand=1',
    branch: 'feature/pull-request',
    defaultBranch: 'develop',
  });
  api.prepareProjectGitPullRequestAction.mockResolvedValue({
    token: 't'.repeat(64),
    actionId: 'pull-request-create',
    expiresAt: '2026-10-01T18:00:00.000Z',
  });
  api.runProjectGitPullRequestAction.mockResolvedValue({
    action: 'pull-request-create',
    number: 42,
    url: 'https://github.com/empresa/dev-dashboard/pull/42',
    title: latestCommit.subject,
    state: 'open',
  });
  vi.spyOn(window, 'open').mockReturnValue({
    opener: null,
    closed: false,
    location: { href: 'about:blank' },
    close: vi.fn(),
  } as unknown as Window);
});

test('prefere a default branch real do remote selecionado', async () => {
  const wrapper = await mountPage();
  const selects = wrapper.findAll('select');

  assert.equal((selects[0]!.element as HTMLSelectElement).value, 'upstream');
  assert.equal((selects[1]!.element as HTMLSelectElement).value, 'develop');
  assert.deepEqual(api.getProjectGitPullRequestStatus.mock.calls.at(-1), [
    'p1',
    { targetRemote: 'upstream', baseBranch: 'develop' },
  ]);
});

test('criação mostra origem real, draft e usa gh como ação principal no GitHub', async () => {
  const wrapper = await mountPage();
  await wrapper.get('.git-pr-primary-action').trigger('click');

  assert.match(wrapper.text(), /origin\/feature\/pull-request/);
  assert.ok(wrapper.find('.git-pr-draft input').exists());
  assert.equal(wrapper.find('.git-pr-primary').text(), 'Criar Pull Request');
  assert.match(wrapper.find('.git-pr-external-action').text(), /Abrir comparação/);
});

test('cria draft via gh com repositório upstream explícito', async () => {
  const wrapper = await mountPage();
  await wrapper.get('.git-pr-primary-action').trigger('click');
  await wrapper.get('.git-pr-draft input').setValue(true);
  await wrapper.get('.git-pr-primary').trigger('click');
  await flushPromises();

  assert.match(wrapper.text(), /gh pr create/);
  assert.match(wrapper.text(), /--repo empresa\/dev-dashboard/);
  assert.match(wrapper.text(), /--draft/);

  const confirm = wrapper
    .findAll('.git-pr-confirm button')
    .find((button) => button.text() === 'Confirmar criação')!;
  await confirm.trigger('click');
  await flushPromises();

  assert.deepEqual(api.prepareProjectGitPullRequestAction.mock.calls[0], [
    'p1',
    'pull-request-create',
    {
      targetRemote: 'upstream',
      baseBranch: 'develop',
      title: latestCommit.subject,
      description: `## Resumo\n\n${latestCommit.subject}`,
      draft: true,
    },
  ]);
});

test('bloqueia merge quando existem requisitos conhecidos pendentes', async () => {
  const wrapper = await mountPage({
    checked: true,
    existing: githubPullRequest({
      ciStatus: 'pending',
      unresolvedConversationsCount: 2,
      cockpit: {
        remoteStatus: 'available',
        draft: false,
        mergeable: true,
        mergeableState: 'clean',
        reviewState: 'changes-requested',
        requestedReviewers: [],
        checks: [{ name: 'Validate', status: 'pending' }],
      },
    }),
  });

  assert.match(wrapper.text(), /CI\s*Pendente/);
  assert.match(wrapper.text(), /Conversas pendentes\s*2/);
  assert.match(wrapper.text(), /alterações solicitadas/i);
  const merge = wrapper
    .findAll('.git-pr-gh-actions button')
    .find((button) => button.text().includes('Mesclar com gh'))!;
  assert.equal((merge.element as HTMLButtonElement).disabled, true);
});

test('permite editar PR existente e envia targetRemote junto da mutação', async () => {
  api.prepareProjectGitPullRequestAction.mockResolvedValue({
    token: 'e'.repeat(64),
    actionId: 'pull-request-edit',
    expiresAt: '2026-10-01T18:00:00.000Z',
  });
  api.runProjectGitPullRequestAction.mockResolvedValue({
    action: 'pull-request-edit',
    number: 42,
    url: 'https://github.com/empresa/dev-dashboard/pull/42',
    title: 'feat: título editado',
    state: 'open',
  });
  const wrapper = await mountPage({
    checked: true,
    existing: githubPullRequest(),
  });

  const edit = wrapper
    .findAll('.git-pr-gh-actions button')
    .find((button) => button.text() === 'Editar')!;
  await edit.trigger('click');
  await wrapper.get('.git-pr-edit-form input').setValue('feat: título editado');
  await wrapper
    .get('.git-pr-edit-form textarea')
    .setValue('## Resumo\n\nNovo corpo.');
  await wrapper.get('.git-pr-edit-form').trigger('submit');
  await flushPromises();

  const confirm = wrapper
    .findAll('.git-pr-confirm button')
    .find((button) => button.text() === 'Confirmar edição')!;
  await confirm.trigger('click');
  await flushPromises();

  assert.deepEqual(api.prepareProjectGitPullRequestAction.mock.calls[0], [
    'p1',
    'pull-request-edit',
    {
      targetRemote: 'upstream',
      number: 42,
      title: 'feat: título editado',
      description: '## Resumo\n\nNovo corpo.',
    },
  ]);
});

test('close e merge carregam o remote alvo na confirmação', async () => {
  api.prepareProjectGitPullRequestAction.mockResolvedValue({
    token: 'c'.repeat(64),
    actionId: 'pull-request-close',
    expiresAt: '2026-10-01T18:00:00.000Z',
  });
  api.runProjectGitPullRequestAction.mockResolvedValue({
    action: 'pull-request-close',
    number: 42,
    url: 'https://github.com/empresa/dev-dashboard/pull/42',
    title: 'feat: PR existente',
    state: 'closed',
  });
  const wrapper = await mountPage({
    checked: true,
    existing: githubPullRequest(),
  });

  const close = wrapper
    .findAll('.git-pr-gh-actions button')
    .find((button) => button.text().includes('Fechar com gh'))!;
  await close.trigger('click');
  await wrapper.get('.git-pr-confirm input').setValue('42');
  const confirm = wrapper
    .findAll('.git-pr-confirm button')
    .find((button) => button.text().includes('Confirmar fechamento'))!;
  await confirm.trigger('click');
  await flushPromises();

  assert.deepEqual(api.prepareProjectGitPullRequestAction.mock.calls[0]?.[2], {
    targetRemote: 'upstream',
    number: 42,
  });
});

test('GitLab não mostra ações gh e mantém acesso externo ao MR', async () => {
  const gitlabWorkspace: ProjectGitWorkspace = {
    ...workspace,
    remotes: [
      {
        name: 'origin',
        fetchUrl: 'git@gitlab.com:empresa/projeto.git',
        pushUrl: 'git@gitlab.com:empresa/projeto.git',
        role: 'origin',
        defaultBranch: 'main',
      },
    ],
    branches: workspace.branches.filter(
      (branch) => branch.remote !== 'upstream',
    ),
  };
  const wrapper = await mountPage(
    {
      checked: true,
      existing: {
        provider: 'gitlab',
        number: 9,
        title: 'feat: MR',
        url: 'https://gitlab.com/empresa/projeto/-/merge_requests/9',
        sourceBranch: 'feature/pull-request',
        baseBranch: 'main',
      },
    },
    gitlabWorkspace,
  );

  assert.match(wrapper.text(), /MR #9 aberta/);
  assert.match(wrapper.text(), /Abrir no GitLab/);
  assert.doesNotMatch(wrapper.text(), /Mesclar com gh|Fechar com gh|Editar/);
});
