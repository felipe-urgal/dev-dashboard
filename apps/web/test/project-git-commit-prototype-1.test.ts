import assert from 'node:assert/strict';
import { mount } from '@vue/test-utils';
import { test } from 'vitest';

import type { ProjectGitOverview } from '@dev-dashboard/contracts';

import ProjectGitCommitPage from '../src/components/ProjectGitCommitPage.vue';

const commits = [
  {
    hash: 'abcdef1234567890',
    shortHash: 'abcdef1',
    subject: 'feat: melhora commit',
    authorName: 'Felipe',
    authorEmail: 'felipe@example.com',
    authoredAt: '2026-09-10T10:00:00.000Z',
  },
  {
    hash: '1234567890abcdef',
    shortHash: '1234567',
    subject: 'chore: ajusta testes',
    authorName: 'Felipe',
    authorEmail: 'felipe@example.com',
    authoredAt: '2026-09-09T10:00:00.000Z',
  },
];

const overview: ProjectGitOverview = {
  repository: true,
  branch: 'main',
  detached: false,
  upstream: 'origin/main',
  ahead: 0,
  behind: 0,
  clean: false,
  files: [
    {
      path: 'src/app.ts',
      indexStatus: 'M',
      worktreeStatus: '.',
      status: 'modified',
    },
    {
      path: 'src/styles.css',
      indexStatus: '.',
      worktreeStatus: 'M',
      status: 'modified',
    },
    {
      path: 'src/new-file.ts',
      indexStatus: '?',
      worktreeStatus: '?',
      status: 'untracked',
    },
  ],
  latestCommit: commits[0],
  recentCommits: commits,
};

test('renderiza o protótipo 1 de commit com resumo, formulário e histórico real', async () => {
  const wrapper = mount(ProjectGitCommitPage, {
    props: {
      overview,
      busy: false,
      message: '',
      mode: 'create',
      pushBranch: null,
    },
  });

  assert.equal(wrapper.findAll('.git-commit-summary-card').length, 3);
  assert.match(wrapper.text(), /Branch atual/);
  assert.match(wrapper.text(), /main/);
  assert.match(wrapper.text(), /Em dia com o origin/);
  assert.match(wrapper.text(), /Alterações rastreadas/);
  assert.match(wrapper.text(), /2 alterações rastreadas · 1 não rastreada/);
  assert.match(wrapper.text(), /Último commit/);
  assert.match(wrapper.text(), /abcdef1/);
  assert.match(wrapper.text(), /feat: melhora commit/);

  assert.ok(wrapper.find('.git-commit-card').exists());
  assert.match(wrapper.text(), /Novo commit/);
  assert.match(wrapper.text(), /Alterar último commit/);
  assert.match(wrapper.text(), /git commit -a/);
  assert.match(wrapper.text(), /git commit --amend/);
  assert.match(wrapper.text(), /0\/500/);
  assert.match(
    wrapper.text(),
    /Arquivos não rastreados não entram neste commit automaticamente/,
  );

  assert.equal(wrapper.findAll('.git-commit-history-row').length, 2);
  assert.match(wrapper.text(), /chore: ajusta testes/);
  assert.match(wrapper.text(), /Felipe/);

  const submit = wrapper.find('.git-commit-submit');
  assert.equal((submit.element as HTMLButtonElement).disabled, true);
  await wrapper.find('.git-commit-message textarea').setValue('novo commit');
  assert.deepEqual(wrapper.emitted('update:message'), [['novo commit']]);

  await wrapper.find('.git-commit-history-button').trigger('click');
  assert.deepEqual(wrapper.emitted('open-history'), [[]]);
});

test('mantém untracked fora da regra do commit normal', () => {
  const untrackedOnly: ProjectGitOverview = {
    ...overview,
    files: [
      {
        path: 'src/novo.ts',
        indexStatus: '?',
        worktreeStatus: '?',
        status: 'untracked',
      },
    ],
  };

  const wrapper = mount(ProjectGitCommitPage, {
    props: {
      overview: untrackedOnly,
      busy: false,
      message: 'não deve habilitar',
      mode: 'create',
      pushBranch: null,
    },
  });

  assert.match(wrapper.text(), /0 alterações rastreadas · 1 não rastreada/);
  assert.equal(
    (wrapper.find('.git-commit-submit').element as HTMLButtonElement).disabled,
    true,
  );
});
