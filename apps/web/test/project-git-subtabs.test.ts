import assert from 'node:assert/strict';
import { test } from 'vitest';

import { mount } from '@vue/test-utils';

import ProjectGitSubtabs from '../src/components/ProjectGitSubtabs.vue';

const tabs = [
  { id: 'sync', label: 'Sincronização', icon: '↕' },
  { id: 'branches', label: 'Branches', icon: '⑂' },
  { id: 'diff', label: 'Diff', icon: '±' },
  { id: 'commit', label: 'Commit', icon: '●' },
  { id: 'undo', label: 'Desfazer', icon: '↶' },
  { id: 'pull-request', label: 'Pull Request', icon: '↗' },
  { id: 'history', label: 'Histórico', icon: '◷' },
] as const;

test('renderiza Heroicons no Vue e preserva glifos de fallback', () => {
  const wrapper = mount(ProjectGitSubtabs, {
    props: {
      tabs,
      activeTab: 'sync',
    },
  });

  const buttons = wrapper.findAll('.git-subtabs button');
  assert.equal(buttons.length, tabs.length);
  assert.equal(wrapper.findAll('.git-tab-heroicon').length, 5);

  const synchronization = buttons.find(
    (button) => button.text() === 'Sincronização',
  );
  assert.ok(synchronization);
  assert.equal(synchronization.attributes('data-has-heroicon'), 'true');
  assert.ok(synchronization.find('.git-tab-heroicon-svg').exists());

  const undo = buttons.find((button) => button.text() === 'Desfazer');
  assert.ok(undo);
  assert.equal(undo.attributes('data-has-heroicon'), undefined);
  assert.equal(undo.attributes('data-icon'), '↶');
  assert.ok(!undo.find('.git-tab-heroicon').exists());

  const pullRequest = buttons.find(
    (button) => button.text() === 'Pull Request',
  );
  assert.ok(pullRequest);
  assert.equal(pullRequest.attributes('data-has-heroicon'), undefined);
  assert.equal(pullRequest.attributes('data-icon'), '↗');
  assert.ok(!pullRequest.find('.git-tab-heroicon').exists());
});

test('mantém a seleção de abas como evento Vue', async () => {
  const wrapper = mount(ProjectGitSubtabs, {
    props: {
      tabs,
      activeTab: 'sync',
    },
  });

  const branches = wrapper
    .findAll('.git-subtabs button')
    .find((button) => button.text() === 'Branches');
  assert.ok(branches);

  await branches.trigger('click');

  assert.deepEqual(wrapper.emitted('select'), [['branches']]);
});
