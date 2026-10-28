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

test('digita a mensagem, habilita e envia o commit normal', async () => {
  const wrapper = mount(ProjectGitCommitPage, {
    props: {
      overview,
      busy: false,
      message: '',
      mode: 'create',
      pushBranch: null,
    },
  });

  const subject = wrapper.find('input[aria-label="Mensagem do commit"]');
  assert.match(wrapper.text(), /Inclui as 2 alterações rastreadas/);
  assert.match(wrapper.text(), /Não rastreadas · ficam de fora/);
  assert.match(wrapper.text(), /staged \(1\)/);
  assert.match(wrapper.text(), /Alterar último commit \(amend\)/);
  assert.match(wrapper.text(), /Criar commit/);

  const create = wrapper.find('.git-commit-submit');
  assert.equal((create.element as HTMLButtonElement).disabled, true);

  await subject.setValue('novo commit');
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

test('amend exige staged ou mudança real na mensagem', async () => {
  const noStage: ProjectGitOverview = {
    ...overview,
    files: overview.files.map((file) => ({
      ...file,
      indexStatus: file.status === 'untracked' ? '?' : '.',
    })),
  };

  const wrapper = mount(ProjectGitCommitPage, {
    props: {
      overview: noStage,
      busy: false,
      message: '',
      mode: 'create',
      pushBranch: null,
    },
  });

  const amend = wrapper.find('.git-commit-amend');
  assert.equal((amend.element as HTMLButtonElement).disabled, true);

  await wrapper.setProps({ message: latestCommit.subject });
  assert.equal((amend.element as HTMLButtonElement).disabled, true);

  await wrapper.setProps({ message: 'feat: nova mensagem' });
  assert.equal((amend.element as HTMLButtonElement).disabled, false);
  await amend.trigger('click');

  assert.deepEqual(wrapper.emitted('update:mode'), [['amend']]);
  assert.deepEqual(wrapper.emitted('submit'), [[]]);
  assert.equal(wrapper.emitted('update:message'), undefined);
});

test('amend com alteração staged pode preservar a mensagem atual', async () => {
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
  assert.deepEqual(wrapper.emitted('submit'), [[]]);
});

test('assunto e corpo viram uma única mensagem e o prefixo troca o anterior', async () => {
  const wrapper = mount(ProjectGitCommitPage, {
    props: {
      overview,
      busy: false,
      message: 'fix: ajusta botão',
      mode: 'create',
      pushBranch: null,
    },
  });

  await wrapper
    .find('textarea[aria-label="Corpo do commit"]')
    .setValue('Porque o clique falhava.');
  assert.deepEqual(wrapper.emitted('update:message')?.at(-1), [
    'fix: ajusta botão\n\nPorque o clique falhava.',
  ]);

  await wrapper
    .findAll('.git-commit-prefixes button')
    .find((button) => button.text() === 'feat:')!
    .trigger('click');
  assert.deepEqual(wrapper.emitted('update:message')?.at(-1), [
    'feat: ajusta botão\n\nPorque o clique falhava.',
  ]);
});

test('Ctrl+Enter cria o commit quando habilitado e "usar a mensagem dele" reaproveita o último assunto', async () => {
  const wrapper = mount(ProjectGitCommitPage, {
    props: {
      overview,
      busy: false,
      message: 'novo commit',
      mode: 'create',
      pushBranch: null,
    },
  });

  await wrapper
    .find('input[aria-label="Mensagem do commit"]')
    .trigger('keydown', { key: 'Enter', ctrlKey: true });
  assert.deepEqual(wrapper.emitted('submit'), [[]]);

  await wrapper
    .findAll('button')
    .find((button) => button.text() === 'Usar a mensagem dele')!
    .trigger('click');
  assert.deepEqual(wrapper.emitted('update:message')?.at(-1), [
    latestCommit.subject,
  ]);
});

test('conflitos bloqueiam criar e alterar e levam a atenção para o aviso', () => {
  const wrapper = mount(ProjectGitCommitPage, {
    props: {
      overview: {
        ...overview,
        files: [
          {
            path: 'src/conflito.ts',
            indexStatus: 'U',
            worktreeStatus: 'U',
            status: 'conflicted',
          },
        ],
      },
      busy: false,
      message: 'tentativa',
      mode: 'create',
      pushBranch: null,
    },
  });

  assert.match(wrapper.find('[role="alert"]').text(), /1 arquivo com conflito/);
  assert.equal(
    (wrapper.find('.git-commit-submit').element as HTMLButtonElement).disabled,
    true,
  );
  assert.equal(
    (wrapper.find('.git-commit-amend').element as HTMLButtonElement).disabled,
    true,
  );
});
