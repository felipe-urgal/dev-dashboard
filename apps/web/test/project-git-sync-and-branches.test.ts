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
  stashes: [],
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

test('keeps main synchronization available when cached refs are equal', async () => {
  const wrapper = mount(ProjectGitSyncPage, {
    props: {
      overview,
      workspace,
      busy: false,
    },
  });

  const button = wrapper.find('.git-sync-button');
  assert.equal(button.attributes('disabled'), undefined);
  assert.match(wrapper.text(), /Sincronizado na última verificação/);
  assert.match(button.text(), /Verificar/);

  await button.trigger('click');
  assert.equal(wrapper.emitted('synchronize')?.length, 1);
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
