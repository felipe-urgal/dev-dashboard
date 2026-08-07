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
  files: [],
  latestCommit: {
    hash: 'abcdef1234567890',
    shortHash: 'abcdef1',
    subject: 'novo commit',
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
      forcePushBranch: null,
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

test('mantém force push separado para alteração do último commit', () => {
  const wrapper = mount(ProjectGitCommitPage, {
    props: {
      overview,
      busy: false,
      message: 'novo commit',
      mode: 'amend',
      pushBranch: null,
      forcePushBranch: 'feature/minha-branch',
    },
  });

  assert.match(wrapper.text(), /O último commit foi reescrito/);
  assert.match(wrapper.text(), /Reenviar com lease/);
  assert.equal(wrapper.text().includes('Novo commit pronto para enviar'), false);
});
