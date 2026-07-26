import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'vitest';

import { mount, flushPromises } from '@vue/test-utils';

import type { GitDiffSnapshot, GitFileDiff, ProjectGitOverview } from '@dev-dashboard/contracts';

import ProjectGitPanel from '../src/components/ProjectGitPanel.vue';
import { ApiRequestError } from '../src/api';
import { makeProject } from './support/activity-fixtures.js';

interface MountArgs {
  overview: () => Promise<ProjectGitOverview>;
  diff: () => Promise<GitDiffSnapshot>;
  fileDiff?: (filePath: string) => Promise<GitFileDiff>;
}

async function mountPanel(args: MountArgs) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/git')) {
      const git = await args.overview();
      return new Response(JSON.stringify({ git }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/git/diff')) {
      const diff = await args.diff();
      return new Response(JSON.stringify({ diff }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/git/diff/file')) {
      const filePath = url.searchParams.get('path') ?? '';
      const file = await args.fileDiff!(filePath);
      return new Response(JSON.stringify({ file }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectGitPanel, { props: { project: makeProject() } });
  return {
    wrapper,
    restore: () => {
      wrapper.unmount();
      globalThis.fetch = originalFetch;
    },
  };
}

const baseOverview: ProjectGitOverview = {
  repository: true, branch: 'main', detached: false, ahead: 0, behind: 0, clean: false,
  files: [
    { path: 'src/app.ts', indexStatus: 'M', worktreeStatus: '.', status: 'modified' },
  ],
  recentCommits: [],
};

const baseDiff: GitDiffSnapshot = {
  repository: true, scope: 'combined',
  files: [
    { path: 'src/app.ts', status: 'modified', additions: 3, deletions: 1, binary: false },
    { path: 'README.md', status: 'modified', additions: 1, deletions: 0, binary: false },
  ],
};

let cleanup: (() => void) | undefined;
beforeEach(() => { cleanup = undefined; });
afterEach(() => { cleanup?.(); });

test('lista arquivos com additions/deletions vindos do snapshot', async () => {
  const { wrapper, restore } = await mountPanel({
    overview: async () => baseOverview,
    diff: async () => baseDiff,
  });
  cleanup = restore;
  await flushPromises();
  await flushPromises();

  const buttons = wrapper.findAll('.git-diff-file-button');
  assert.equal(buttons.length, 2);
  assert.match(buttons[0]!.text(), /src\/app\.ts/);
  assert.match(buttons[0]!.text(), /\+3 \/ −1/);
});

test('mostra mensagem quando o snapshot de diff está vazio', async () => {
  const { wrapper, restore } = await mountPanel({
    overview: async () => ({ ...baseOverview, clean: true, files: [] }),
    diff: async () => ({ repository: true, scope: 'combined', files: [] }),
  });
  cleanup = restore;
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.text(), /Nenhum arquivo alterado desde HEAD/);
});

test('carrega o diff do arquivo selecionado e sinaliza mascaramento', async () => {
  const { wrapper, restore } = await mountPanel({
    overview: async () => baseOverview,
    diff: async () => baseDiff,
    fileDiff: async (filePath) => ({
      path: filePath, scope: 'combined', status: 'modified', binary: false,
      content: '-const value = 1;\n+const value = 42;\n', truncated: false, masked: true, redactionCount: 1,
    }),
  });
  cleanup = restore;
  await flushPromises();
  await flushPromises();

  await wrapper.findAll('.git-diff-file-button')[0]!.trigger('click');
  await flushPromises();
  await flushPromises();

  const text = wrapper.text();
  assert.match(text, /Segredos detectados foram mascarados/);
  assert.match(wrapper.find('.git-diff-content').text(), /const value = 42/);
});

test('mostra erro quando a chamada de diff falha', async () => {
  const { wrapper, restore } = await mountPanel({
    overview: async () => baseOverview,
    diff: async () => { throw new ApiRequestError({ status: 500, message: 'API indisponível.' }); },
  });
  cleanup = restore;
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.text(), /API indisponível/);
  assert.equal(wrapper.findAll('.git-diff-file-button').length, 0);
});
