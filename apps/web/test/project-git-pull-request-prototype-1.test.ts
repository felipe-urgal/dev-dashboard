import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import type {
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
  subject: 'feat: organiza Pull Request',
  authorName: 'Dashboard Test',
  authorEmail: 'dashboard@example.test',
  authoredAt: '2026-09-10T12:00:00.000Z',
};

const overview: ProjectGitOverview = {
  repository: true,
  branch: 'feature/pull-request',
  detached: false,
  upstream: 'origin/feature/pull-request',
  ahead: 1,
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
      ahead: 1,
      behind: 0,
      latestCommit,
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

test('renderiza o protótipo 1 com resumo operacional e criação separada', async () => {
  api.getProjectGitPullRequestStatus.mockResolvedValue({
    checked: true,
    existing: {
      provider: 'github',
      number: 42,
      title: 'feat: PR atual',
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
      forcePushBranch: null,
    },
  });
  await flushPromises();
  await flushPromises();

  assert.equal(wrapper.findAll('.git-pr-summary-card').length, 3);
  assert.match(wrapper.text(), /Branch atual/);
  assert.match(wrapper.text(), /Pull Request atual/);
  assert.match(wrapper.text(), /#42/);
  assert.match(wrapper.text(), /Destino/);
  assert.match(wrapper.text(), /upstream\/main/);

  const tabs = wrapper.findAll('[role="tab"]');
  assert.equal(tabs.length, 2);
  assert.equal(tabs[0]?.attributes('aria-selected'), 'true');
  assert.match(
    wrapper.find('#git-pr-create-panel').attributes('style') ?? '',
    /display:\s*none/,
  );

  await tabs[1]?.trigger('click');

  assert.equal(tabs[1]?.attributes('aria-selected'), 'true');
  assert.match(
    wrapper.find('#git-pr-overview-panel').attributes('style') ?? '',
    /display:\s*none/,
  );
  assert.ok(wrapper.find('.git-pr-form').exists());
  assert.match(wrapper.text(), /Branch de origem/);
});
