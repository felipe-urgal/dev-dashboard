import assert from 'node:assert/strict';
import { mount } from '@vue/test-utils';
import { test } from 'vitest';

import type { ProjectGitOverview } from '@dev-dashboard/contracts';

import ProjectGitCommitPage from '../src/components/ProjectGitCommitPage.vue';

const latestCommit = {
  hash: 'abcdef1234567890',
  shortHash: 'abcdef1',
  subject: 'feat: melhora commit',
  authorName: 'Felipe',
  authorEmail: 'felipe@example.com',
  authoredAt: '2026-09-10T10:00:00.000Z',
};

const commits = [
  latestCommit,
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
  latestCommit,
  recentCommits: commits,
};

test('renderiza tela de commit minimalista sem resumo, abas ou histórico', async () => {
  const wrapper = mount(ProjectGitCommitPage, {
    props: {
      overview,
      busy: false,
      message: '',
      mode: 'create',
      pushBranch: null,
    },
  });

  assert.ok(wrapper.find('.git-commit-card').exists());
  assert.equal(wrapper.findAll('.git-commit-summary-card').length, 0);
  assert.equal(wrapper.findAll('.git-commit-history-row').length, 0);
  assert.equal(wrapper.find('.git-commit-tracked input').exists(), false);
  assert.equal(wrapper.find('.git-commit-mode').exists(), false);
  assert.equal(wrapper.text().includes('Criar novo commit'), false);
  assert.equal(wrapper.text().includes('Últimos commits'), false);
  assert.equal(wrapper.text().includes('Ver histórico completo'), false);
  assert.equal(wrapper.text().includes('git commit -a'), false);
  assert.equal(wrapper.text().includes('git commit --amend'), false);

  const textarea = wrapper.find('.git-commit-message textarea');
  assert.equal(textarea.attributes('aria-label'), 'Mensagem do commit');
  assert.equal(textarea.attributes('placeholder'), 'Descreva as alterações');
  assert.match(wrapper.text(), /0\/500/);
  assert.match(
    wrapper.text(),
    /2 alterações rastreadas incluídas automaticamente/,
  );
  assert.match(wrapper.text(), /Amend último commit/);
  assert.match(wrapper.text(), /Criar commit/);

  const create = wrapper.find('.git-commit-submit');
  assert.equal((create.element as HTMLButtonElement).disabled, true);

  await textarea.setValue('novo commit');
  assert.deepEqual(wrapper.emitted('update:message'), [['novo commit']]);

  await wrapper.setProps({ message: 'novo commit' });
  assert.equal((create.element as HTMLButtonElement).disabled, false);

  await create.trigger('click');
  assert.deepEqual(wrapper.emitted('update:mode'), [['create']]);
  assert.deepEqual(wrapper.emitted('submit'), [[]]);
});

test('mantém commit normal desabilitado quando só há arquivo não rastreado', () => {
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

  assert.equal(
    (wrapper.find('.git-commit-submit').element as HTMLButtonElement).disabled,
    true,
  );
});

test('amend usa a mensagem atual ou reaproveita a do último commit', async () => {
  const wrapper = mount(ProjectGitCommitPage, {
    props: {
      overview,
      busy: false,
      message: '',
      mode: 'create',
      pushBranch: null,
    },
  });

  const amend = wrapper.find('.git-commit-amend');
  assert.equal((amend.element as HTMLButtonElement).disabled, false);

  await amend.trigger('click');

  assert.deepEqual(wrapper.emitted('update:mode'), [['amend']]);
  assert.deepEqual(wrapper.emitted('update:message'), [[latestCommit.subject]]);
  assert.deepEqual(wrapper.emitted('submit'), [[]]);
});
