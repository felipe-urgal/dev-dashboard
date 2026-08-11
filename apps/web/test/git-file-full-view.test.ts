import assert from 'node:assert/strict';
import { test } from 'vitest';

import { mount } from '@vue/test-utils';

import type { GitPullRequestReviewFinding } from '@dev-dashboard/contracts';

import GitFileFullView from '../src/components/GitFileFullView.vue';

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

const fullContent = [
  'line 1',
  'line 2',
  'line 3',
  'line 4',
  'line 5',
  'line 6',
  'line 7',
  'line 8',
  'line 9',
  'const current = true;',
  'const nextValue = compute();',
  'return nextValue;',
  '}',
].join('\n');

function finding(
  overrides: Partial<GitPullRequestReviewFinding> = {},
): GitPullRequestReviewFinding {
  return {
    severity: 'warning',
    path: 'src/app.ts',
    line: 11,
    title: 'Variável redundante',
    explanation: 'O valor não é reutilizado.',
    recommendation: 'Remova a variável.',
    ...overrides,
  };
}

test('mostra o arquivo completo e destaca somente as linhas adicionadas', () => {
  const wrapper = mount(GitFileFullView, {
    props: {
      content: fullContent,
      diff,
      path: 'src/app.ts',
    },
  });

  const rows = wrapper.findAll('.git-full-file-row');
  assert.equal(rows.length, 13);

  const changedRows = rows.filter((row) => row.classes('is-changed'));
  assert.equal(changedRows.length, 2);
  assert.match(changedRows[0]?.text() ?? '', /const nextValue = compute\(\);/);
  assert.match(changedRows[1]?.text() ?? '', /return nextValue;/);

  const contextRow = rows.find((row) =>
    row.text().includes('const current = true;'),
  );
  assert.equal(contextRow?.classes('is-changed'), false);

  wrapper.unmount();
});

test('mostra o comentário inline na linha correspondente do arquivo completo', () => {
  const wrapper = mount(GitFileFullView, {
    props: {
      content: fullContent,
      diff,
      path: 'src/app.ts',
      findings: [finding()],
      resolvedKeys: [],
      selectedKeys: [],
    },
  });

  const comments = wrapper.findAll('.git-diff-inline-comments');
  assert.equal(comments.length, 1);
  assert.match(comments[0]?.text() ?? '', /Variável redundante/);

  wrapper.unmount();
});

test('emite eventos ao selecionar, resolver e ignorar um apontamento inline', async () => {
  const wrapper = mount(GitFileFullView, {
    props: {
      content: fullContent,
      diff,
      path: 'src/app.ts',
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
