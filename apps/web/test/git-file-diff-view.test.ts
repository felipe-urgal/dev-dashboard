import assert from 'node:assert/strict';
import { test } from 'vitest';

import { mount } from '@vue/test-utils';

import type { GitPullRequestReviewFinding } from '@dev-dashboard/contracts';

import GitFileDiffView from '../src/components/GitFileDiffView.vue';

const diff = [
  'diff --git a/src/app.ts b/src/app.ts',
  'index 1111111..2222222 100644',
  '--- a/src/app.ts',
  '+++ b/src/app.ts',
  '@@ -10,3 +10,4 @@ export function run() {',
  ' const current = true;',
  '-return oldValue;',
  '+const nextValue = compute();',
  '+return nextValue;',
  ' }',
].join('\n');

function finding(
  overrides: Partial<Omit<GitPullRequestReviewFinding, 'line'>> & {
    line?: number;
  } = {},
): GitPullRequestReviewFinding {
  return {
    severity: 'warning',
    path: 'src/app.ts',
    line: 12,
    title: 'Variável redundante',
    explanation: 'O valor não é reutilizado.',
    recommendation: 'Remova a variável.',
    ...overrides,
  };
}

function findingWithoutLine(): GitPullRequestReviewFinding {
  const { line: _line, ...rest } = finding();
  return rest;
}

test('mostra o comentário inline na linha correspondente do diff', () => {
  const wrapper = mount(GitFileDiffView, {
    props: {
      content: diff,
      path: 'src/app.ts',
      viewMode: 'unified',
      findings: [finding()],
      resolvedKeys: [],
      selectedKeys: [],
    },
  });

  const comments = wrapper.findAll('.git-diff-inline-comments');
  assert.equal(comments.length, 1);
  const [comment] = comments;
  assert.ok(comment);
  assert.match(comment.text(), /Variável redundante/);

  const rows = wrapper.findAll('.git-diff-unified-row');
  const targetRowIndex = rows.findIndex((row) =>
    row.text().includes('const nextValue = compute();'),
  );
  assert.ok(targetRowIndex >= 0);

  wrapper.unmount();
});

test('emite eventos ao selecionar, resolver e ignorar um apontamento inline', async () => {
  const wrapper = mount(GitFileDiffView, {
    props: {
      content: diff,
      path: 'src/app.ts',
      viewMode: 'unified',
      findings: [finding()],
    },
  });

  await wrapper
    .get('.git-diff-inline-comments input[type=checkbox]')
    .trigger('change');
  assert.equal(wrapper.emitted('toggle-finding-selection')?.length, 1);

  await wrapper.get('.git-diff-inline-comments button').trigger('click');
  assert.equal(wrapper.emitted('resolve-finding')?.length, 1);

  wrapper.unmount();
});

test('apontamentos sem linha identificada não aparecem inline', () => {
  const wrapper = mount(GitFileDiffView, {
    props: {
      content: diff,
      path: 'src/app.ts',
      viewMode: 'unified',
      findings: [findingWithoutLine()],
    },
  });

  assert.equal(wrapper.find('.git-diff-inline-comments').exists(), false);

  wrapper.unmount();
});
