import assert from 'node:assert/strict';
import { test } from 'vitest';

import { mount } from '@vue/test-utils';

import type { GitFileStatus } from '@dev-dashboard/contracts';

import ProjectGitDiffFileCard from '../src/components/ProjectGitDiffFileCard.vue';
import type { GitDiffFileEntry } from '../src/composables/useProjectGitDiffPage';

const statusLabels: Record<GitFileStatus, string> = {
  added: 'Adicionado',
  modified: 'Modificado',
  deleted: 'Removido',
  renamed: 'Renomeado',
  copied: 'Copiado',
  untracked: 'Não rastreado',
  conflicted: 'Conflito',
  'type-changed': 'Tipo alterado',
};

function entryFor(
  path: string,
  mimeType: string,
  binary: boolean,
): GitDiffFileEntry {
  return {
    file: {
      path,
      status: 'modified',
      additions: binary ? 0 : 1,
      deletions: binary ? 0 : 1,
      binary,
    },
    language: null,
    loading: false,
    loaded: true,
    error: '',
    diff: {
      path,
      scope: 'combined',
      status: 'modified',
      binary,
      content: binary ? '' : '@@ -1 +1 @@\n-<svg />\n+<svg><circle /></svg>',
      truncated: false,
      masked: false,
      redactionCount: 0,
      imagePreview: {
        before: { mimeType, base64: 'YW50ZXM=' },
        after: { mimeType, base64: 'ZGVwb2lz' },
      },
    },
    leading: [],
    hunks: [],
    totalLines: null,
    collapsed: false,
    viewed: false,
  };
}

function mountCard(entry: GitDiffFileEntry) {
  return mount(ProjectGitDiffFileCard, {
    props: {
      entry,
      viewMode: 'unified',
      copiedPath: '',
      contextExpansionStep: 20,
      statusLabels,
      fileName: (value: string) => value.split('/').at(-1) ?? value,
      directoryName: () => '',
      statBlocks: () => ['empty', 'empty', 'empty', 'empty', 'empty'],
      linePrefix: () => '',
      highlighted: (line) => line.text,
      hunkLines: () => [],
      splitRowsFor: () => [],
      canExpandAbove: () => false,
      canExpandBelow: () => false,
    },
  });
}

test('mostra imagem anterior e atual lado a lado para binários suportados', () => {
  const wrapper = mountCard(entryFor('public/hero.png', 'image/png', true));

  const images = wrapper.findAll('.git-diff-image-stage img');
  assert.equal(images.length, 2);
  assert.ok(wrapper.text().includes('Antes'));
  assert.ok(wrapper.text().includes('Depois'));
  assert.equal(images[0]?.attributes('src'), 'data:image/png;base64,YW50ZXM=');
  assert.equal(images[1]?.attributes('src'), 'data:image/png;base64,ZGVwb2lz');
  assert.ok(!wrapper.text().includes('Diff binário não disponível'));
});

test('permite alternar SVG entre visual e código', async () => {
  const wrapper = mountCard(
    entryFor('public/icon.svg', 'image/svg+xml', false),
  );

  assert.equal(wrapper.findAll('.git-diff-image-stage img').length, 2);
  const buttons = wrapper.findAll('.git-diff-image-view-switch button');
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0]?.text(), 'Visual');
  assert.equal(buttons[1]?.text(), 'Código');

  await buttons[1]!.trigger('click');

  assert.equal(wrapper.findAll('.git-diff-image-stage img').length, 0);
  assert.ok(wrapper.find('.git-diff-raw-meta').exists());
  assert.ok(wrapper.text().includes('<circle />'));
});
