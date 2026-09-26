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

test('renderiza Pull Request minimalista e leva à criação sem informações duplicadas', async () => {
  api.getProjectGitPullRequestStatus.mockResolvedValue({ checked: true });

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

  assert.equal(wrapper.findAll('.git-pr-summary-card').length, 0);
  assert.equal(wrapper.findAll('[role="tab"]').length, 0);
  assert.equal(wrapper.find('#git-pr-overview-panel h2').exists(), false);
  assert.match(wrapper.find('#git-pr-overview-panel').text(), /Branch atual/);
  assert.match(
    wrapper.find('#git-pr-overview-panel').text(),
    /Nenhuma Pull Request aberta/,
  );
  assert.match(
    wrapper.find('#git-pr-overview-panel').text(),
    /feature\/pull-request/,
  );
  assert.match(wrapper.find('#git-pr-overview-panel').text(), /upstream\/main/);
  assert.doesNotMatch(
    wrapper.find('#git-pr-overview-panel').text(),
    /Arquivos alterados|Commits carregados/,
  );

  await wrapper.find('.git-pr-primary-action').trigger('click');

  assert.match(
    wrapper.find('#git-pr-overview-panel').attributes('style') ?? '',
    /display:\s*none/,
  );
  assert.doesNotMatch(
    wrapper.find('#git-pr-create-panel').attributes('style') ?? '',
    /display:\s*none/,
  );
  assert.match(
    wrapper.find('#git-pr-create-panel').text(),
    /Criar Pull Request/,
  );
  assert.equal(wrapper.findAll('.git-pr-grid label').length, 2);
  assert.equal(wrapper.findAll('.git-pr-change-summary').length, 0);
  assert.doesNotMatch(
    wrapper.find('#git-pr-create-panel').text(),
    /Branch de origem/,
  );
  assert.ok(wrapper.find('.git-pr-primary').exists());
  assert.ok(wrapper.find('.git-pr-gh-action').exists());
});
