import assert from 'node:assert/strict';
import { test } from 'vitest';

import { mount } from '@vue/test-utils';

import type {
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

import ProjectGitBranchesPage from '../src/components/ProjectGitBranchesPage.vue';
import ProjectGitSyncPage from '../src/components/ProjectGitSyncPage.vue';

const commit = {
  hash: 'abc123456789',
  shortHash: 'abc1234',
  subject: 'test',
  authorName: 'Dashboard Test',
  authorEmail: 'dashboard@example.test',
  authoredAt: '2026-07-31T10:00:00.000Z',
};

const overview: ProjectGitOverview = {
  repository: true,
  branch: 'main',
  detached: false,
  upstream: 'origin/main',
  ahead: 0,
  behind: 0,
  clean: true,
  files: [],
  latestCommit: commit,
  recentCommits: [commit],
};

const workspace: ProjectGitWorkspace = {
  branches: [
    {
      name: 'main',
      shortName: 'main',
      kind: 'local',
      current: true,
      upstream: 'origin/main',
      ahead: 0,
      behind: 0,
      latestCommit: commit,
    },
    {
      name: 'origin/main',
      shortName: 'main',
      kind: 'remote',
      current: false,
      remote: 'origin',
      ahead: 0,
      behind: 0,
      latestCommit: commit,
    },
    {
      name: 'upstream/main',
      shortName: 'main',
      kind: 'remote',
      current: false,
      remote: 'upstream',
      ahead: 0,
      behind: 0,
      latestCommit: commit,
    },
    {
      name: 'origin/feature/remota',
      shortName: 'feature/remota',
      kind: 'remote',
      current: false,
      remote: 'origin',
      ahead: 0,
      behind: 0,
      latestCommit: commit,
    },
  ],
  remotes: [
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
};

test('shows remote verification without spinning a merely disabled sync button', () => {
  const wrapper = mount(ProjectGitSyncPage, {
    props: {
      overview,
      workspace,
      busy: false,
      checking: true,
    },
  });

  const button = wrapper.find('.git-sync-button');
  assert.ok(button.attributes('disabled') !== undefined);
  assert.match(wrapper.text(), /Verificando/);
  assert.equal(button.classes('is-busy'), false);
});

test('remote-only branch can be tracked and removed from origin', async () => {
  const wrapper = mount(ProjectGitBranchesPage, {
    props: {
      overview,
      workspace,
      loading: false,
      busy: false,
    },
    global: {
      stubs: {
        Teleport: true,
      },
    },
  });

  const remoteRow = wrapper
    .findAll('.branch-table-row')
    .find((row) => row.text().includes('feature/remota'));
  assert.ok(remoteRow);
  assert.match(remoteRow.text(), /Somente leitura/);

  const trackButton = remoteRow
    .findAll('button')
    .find((button) => button.text().includes('Trazer para local'));
  assert.ok(trackButton);
  await trackButton.trigger('click');
  assert.deepEqual(wrapper.emitted('track')?.[0], ['origin/feature/remota']);

  await remoteRow.find('.branch-menu-trigger').trigger('click');
  const deleteRemoteButton = remoteRow
    .findAll('.branch-menu-popover button')
    .find((button) => button.text().includes('Remover do origin'));
  assert.ok(deleteRemoteButton);
  await deleteRemoteButton.trigger('click');

  const modal = wrapper.find('.branch-modal');
  assert.match(modal.text(), /Remover branch remota/);
  await modal.find('input').setValue('feature/remota');
  await modal.find('form').trigger('submit');

  assert.deepEqual(
    wrapper.emitted('delete-remote')?.[0],
    ['origin/feature/remota'],
  );
});

test('branches page exposes an explicit remote refresh action', async () => {
  const wrapper = mount(ProjectGitBranchesPage, {
    props: {
      overview,
      workspace,
      loading: false,
      busy: false,
    },
  });

  const refresh = wrapper
    .findAll('button')
    .find((button) => button.text().includes('Atualizar remotas'));
  assert.ok(refresh);
  await refresh.trigger('click');
  assert.equal(wrapper.emitted('refresh-remotes')?.length, 1);
});


test('branch atual atrasada oferece atualização local por fast-forward', async () => {
  const branchName = 'agent/redesign-home-observatorio';
  const branchOverview: ProjectGitOverview = {
    ...overview,
    branch: branchName,
    upstream: `origin/${branchName}`,
    behind: 2,
  };
  const branchWorkspace: ProjectGitWorkspace = {
    ...workspace,
    branches: [
      ...workspace.branches.map((branch) =>
        branch.name === 'main'
          ? { ...branch, current: false }
          : branch,
      ),
      {
        name: branchName,
        shortName: branchName,
        kind: 'local',
        current: true,
        upstream: `origin/${branchName}`,
        ahead: 0,
        behind: 2,
        latestCommit: commit,
      },
      {
        name: `origin/${branchName}`,
        shortName: branchName,
        kind: 'remote',
        current: false,
        remote: 'origin',
        ahead: 0,
        behind: 0,
        latestCommit: commit,
      },
    ],
  };

  const wrapper = mount(ProjectGitSyncPage, {
    props: {
      overview: branchOverview,
      workspace: branchWorkspace,
      busy: false,
      checking: false,
    },
  });

  const card = wrapper.find('.git-sync-current-card');
  assert.ok(card.exists());
  assert.match(
    card.text(),
    /agent\/redesign-home-observatorio\s*←\s*origin\/agent\/redesign-home-observatorio/,
  );
  assert.match(card.text(), /2 commits novos no remoto/);

  const update = card.find('.git-sync-button');
  assert.equal(update.attributes('disabled'), undefined);
  await update.trigger('click');
  assert.equal(wrapper.emitted('update-current-branch')?.length, 1);
});

test('branch divergente não permite atualização automática', () => {
  const branchName = 'feature/colaborativa';
  const branchOverview: ProjectGitOverview = {
    ...overview,
    branch: branchName,
    upstream: `origin/${branchName}`,
    ahead: 1,
    behind: 2,
  };
  const branchWorkspace: ProjectGitWorkspace = {
    ...workspace,
    branches: [
      ...workspace.branches.map((branch) =>
        branch.name === 'main'
          ? { ...branch, current: false }
          : branch,
      ),
      {
        name: branchName,
        shortName: branchName,
        kind: 'local',
        current: true,
        upstream: `origin/${branchName}`,
        ahead: 1,
        behind: 2,
        latestCommit: commit,
      },
    ],
  };

  const wrapper = mount(ProjectGitSyncPage, {
    props: {
      overview: branchOverview,
      workspace: branchWorkspace,
      busy: false,
      checking: false,
    },
  });

  const card = wrapper.find('.git-sync-current-card');
  assert.match(card.text(), /divergiram/);
  assert.ok(card.find('.git-sync-button').attributes('disabled') !== undefined);
});
