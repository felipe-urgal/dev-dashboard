import assert from 'node:assert/strict';
import { mount } from '@vue/test-utils';
import { test } from 'vitest';

import type { ProjectGitOverview } from '@dev-dashboard/contracts';

import ProjectGitCommitPage from '../src/components/ProjectGitCommitPage.vue';

const overview = {
  repository: true,
  branch: 'feature/minha-branch',
  detached: false,
  upstream: 'origin/feature/minha-branch',
  ahead: 1,
  behind: 0,
  clean: true,
  files: [],
  recentCommits: [],
  latestCommit: {
    hash: 'abcdef1234567890',
    shortHash: 'abcdef1',
    subject: 'novo commit',
    authorName: 'Felipe',
    authorEmail: 'felipe@example.com',
    authoredAt: '2026-08-07T19:00:00.000Z',
  },
} as ProjectGitOverview;

test('oferece push normal quando um novo commit aguarda envio', async () => {
  const wrapper = mount(ProjectGitCommitPage, {
    props: {
      overview,
      busy: false,
      message: '',
      mode: 'create',
      pushBranch: 'feature/minha-branch',
    },
  });

  assert.match(wrapper.text(), /Novo commit pronto para enviar/);
  assert.match(wrapper.text(), /origin\/feature\/minha-branch/);
  assert.equal(wrapper.text().includes('Reenviar com lease'), false);

  const push = wrapper
    .findAll('button')
    .find((button) => button.text() === 'Push');
  assert.ok(push);
  await push.trigger('click');
  assert.deepEqual(wrapper.emitted('push'), [['feature/minha-branch']]);
});

test('não oferece atualização forçada na aba de commit', () => {
  const wrapper = mount(ProjectGitCommitPage, {
    props: {
      overview,
      busy: false,
      message: 'novo commit',
      mode: 'amend',
      pushBranch: null,
    },
  });

  assert.equal(wrapper.text().includes('Reenviar com lease'), false);
  assert.equal(wrapper.text().includes('Forçar atualização'), false);
});
