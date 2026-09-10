import assert from 'node:assert/strict';
import { test } from 'vitest';

import { mount } from '@vue/test-utils';

import type {
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

import ProjectGitSyncPage from '../src/components/ProjectGitSyncPage.vue';

const commit = {
  hash: 'abc123456789',
  shortHash: 'abc1234',
  subject: 'Sincronização de teste',
  authorName: 'Dashboard Test',
  authorEmail: 'dashboard@example.test',
  authoredAt: '2026-09-10T12:00:00.000Z',
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

test('renderiza a sincronização terminal-first sem expor o remote principal', async () => {
  const wrapper = mount(ProjectGitSyncPage, {
    props: {
      overview,
      workspace,
      busy: false,
      checking: false,
    },
  });

  assert.equal(wrapper.findAll('.git-sync-summary-card').length, 3);
  assert.ok(wrapper.find('.git-sync-main-card').exists());
  assert.match(wrapper.text(), /Branch atual/);
  assert.match(wrapper.text(), /Última sincronização/);
  assert.match(wrapper.text(), /main\s*→\s*origin\/main/);
  assert.match(wrapper.text(), /Tudo sincronizado/);
  assert.match(wrapper.text(), /Console de sincronização/);
  assert.match(wrapper.text(), /Verificar referências remotas/);
  assert.match(wrapper.text(), /Preparar a branch main/);
  assert.match(wrapper.text(), /Publicar main em origin\/main/);
  assert.doesNotMatch(wrapper.text(), /upstream\//);
  assert.match(wrapper.text(), /Próximos passos/);
  assert.match(wrapper.text(), /Dicas/);

  const primaryButton = wrapper.find('.git-sync-main-card .git-sync-button');
  assert.ok(primaryButton.attributes('disabled') !== undefined);

  const settings = wrapper.find('.git-sync-settings-button');
  await settings.trigger('click');
  assert.match(
    wrapper.find('.git-sync-settings').text(),
    /Detectada automaticamente/,
  );
  assert.match(wrapper.find('.git-sync-settings').text(), /origin\/main/);
  assert.match(wrapper.find('.git-sync-settings').text(), /merge/);
  assert.doesNotMatch(wrapper.find('.git-sync-settings').text(), /upstream\//);
});

test('mostra conclusão da sincronização sem inventar horário ou saída de terminal', () => {
  const wrapper = mount(ProjectGitSyncPage, {
    props: {
      overview,
      workspace,
      busy: false,
      checking: false,
      lastSynchronizationAt: '2026-09-10T12:34:00.000Z',
      synchronizationMessage: 'Main e origin/main já estavam sincronizadas.',
    },
  });

  assert.match(wrapper.find('.git-sync-console-state').text(), /Concluída/);
  assert.match(
    wrapper.find('.git-sync-terminal-result').text(),
    /Main e origin\/main já estavam sincronizadas/,
  );
  assert.equal(
    wrapper.findAll('.git-sync-terminal-steps .is-complete').length,
    4,
  );
});

test('mantém a mesma linguagem de UI quando existe apenas origin', () => {
  const originOnlyWorkspace: ProjectGitWorkspace = {
    branches: workspace.branches.filter(
      (branch) => branch.remote !== 'upstream',
    ),
    remotes: workspace.remotes.filter((remote) => remote.name !== 'upstream'),
  };

  const wrapper = mount(ProjectGitSyncPage, {
    props: {
      overview,
      workspace: originOnlyWorkspace,
      busy: false,
      checking: false,
    },
  });

  assert.match(wrapper.text(), /main\s*→\s*origin\/main/);
  assert.match(wrapper.text(), /Tudo sincronizado/);
  assert.doesNotMatch(wrapper.text(), /upstream\//);
});
