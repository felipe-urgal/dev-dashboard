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

test('atualiza consecutivas mantêm o resultado da mais recente sem interferência da anterior', async () => {
  let call = 0;
  const originalFetch = globalThis.fetch;
  const firstBlocker: { resolve: (value?: unknown) => void } = { resolve: () => {} };
  const firstReleased = new Promise((resolve) => { firstBlocker.resolve = resolve; });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/git')) {
      return new Response(JSON.stringify({ git: baseOverview }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/git/diff')) {
      call += 1;
      const currentCall = call;
      if (currentCall === 1) {
        await firstReleased;
        if ((init?.signal as AbortSignal | undefined)?.aborted) {
          return new Response(JSON.stringify({ error: 'AbortError', message: 'aborted' }), { status: 499 });
        }
        return new Response(JSON.stringify({ diff: { repository: true, scope: 'combined', files: [] } }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ diff: baseDiff }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectGitPanel, { props: { project: makeProject() } });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
    firstBlocker.resolve();
  };

  await flushPromises();
  await (wrapper.vm as unknown as { loadDiff: () => Promise<void> }).loadDiff();
  await flushPromises();

  firstBlocker.resolve();
  await flushPromises();
  await flushPromises();

  const buttons = wrapper.findAll('.git-diff-file-button');
  assert.equal(buttons.length, baseDiff.files.length);
  assert.equal(wrapper.find('.project-error').exists(), false);
});

test('cria branch enviando confirmação antes da mutação e mostra sucesso', async () => {
  const calls: Array<{ url: string; body?: unknown }> = [];
  const originalFetch = globalThis.fetch;
  const originalConfirm = globalThis.confirm;
  globalThis.confirm = () => true;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: url.pathname, body });
    if (url.pathname.endsWith('/git')) {
      return new Response(JSON.stringify({ git: baseOverview }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/git/diff')) {
      return new Response(JSON.stringify({ diff: { repository: true, scope: 'combined', files: [] } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/git/mutations/confirmations')) {
      return new Response(JSON.stringify({ confirmation: { token: 't'.repeat(64), operation: (body as { operation: string }).operation, target: (body as { target: string }).target, expiresAt: new Date(Date.now() + 60_000).toISOString() } }), { status: 201, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/git/branches')) {
      return new Response(JSON.stringify({ branch: { branch: (body as { name: string }).name } }), { status: 201, headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectGitPanel, { props: { project: makeProject() } });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
    globalThis.confirm = originalConfirm;
  };
  await flushPromises();
  await flushPromises();

  const forms = wrapper.findAll('.git-mutation-forms form');
  await forms[0]!.find('input').setValue('feature/x');
  await forms[0]!.trigger('submit.prevent');
  await flushPromises();
  await flushPromises();
  await flushPromises();

  const paths = calls.map((call) => call.url);
  const confirmationIndex = paths.indexOf('/api/projects/p1/git/mutations/confirmations');
  const mutationIndex = paths.indexOf('/api/projects/p1/git/branches');
  assert.ok(confirmationIndex >= 0, 'esperava chamada de confirmação');
  assert.ok(mutationIndex > confirmationIndex, 'confirmação precisa vir antes da mutação');
  assert.equal((calls[mutationIndex]!.body as { name: string; confirmationToken: string }).confirmationToken, 't'.repeat(64));
  assert.match(wrapper.find('.git-mutation-success').text(), /Branch "feature\/x" criado/);
});

test('mutação Git respeita cancelamento do usuário no confirm do navegador', async () => {
  let mutationCalled = false;
  const originalFetch = globalThis.fetch;
  const originalConfirm = globalThis.confirm;
  globalThis.confirm = () => false;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/git')) {
      return new Response(JSON.stringify({ git: baseOverview }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/git/diff')) {
      return new Response(JSON.stringify({ diff: { repository: true, scope: 'combined', files: [] } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.includes('/git/mutations') || url.pathname.endsWith('/git/branches') || url.pathname.endsWith('/git/switch')) {
      mutationCalled = true;
      return new Response('unexpected', { status: 500 });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectGitPanel, { props: { project: makeProject() } });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
    globalThis.confirm = originalConfirm;
  };
  await flushPromises();
  await flushPromises();

  const forms = wrapper.findAll('.git-mutation-forms form');
  await forms[1]!.find('input').setValue('main');
  await forms[1]!.trigger('submit.prevent');
  await flushPromises();

  assert.equal(mutationCalled, false, 'nenhuma chamada de mutação deveria ter ocorrido quando o confirm é recusado');
});

test('pull envia confirmação com o branch atual e mostra sucesso', async () => {
  const calls: Array<{ url: string; body?: unknown }> = [];
  const originalFetch = globalThis.fetch;
  const originalConfirm = globalThis.confirm;
  globalThis.confirm = () => true;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: url.pathname, body });
    if (url.pathname.endsWith('/git')) {
      return new Response(JSON.stringify({ git: baseOverview }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/git/diff')) {
      return new Response(JSON.stringify({ diff: { repository: true, scope: 'combined', files: [] } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/git/mutations/confirmations')) {
      return new Response(JSON.stringify({ confirmation: { token: 'p'.repeat(64), operation: (body as { operation: string }).operation, target: (body as { target: string }).target, expiresAt: new Date(Date.now() + 60_000).toISOString() } }), { status: 201, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/git/pull')) {
      return new Response(JSON.stringify({ branch: { branch: baseOverview.branch } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectGitPanel, { props: { project: makeProject() } });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
    globalThis.confirm = originalConfirm;
  };
  await flushPromises();
  await flushPromises();

  const buttons = wrapper.findAll('button');
  const pullButton = buttons.find((button) => button.text().includes('Pull'));
  await pullButton!.trigger('click');
  await flushPromises();
  await flushPromises();
  await flushPromises();

  const confirmationCall = calls.find((call) => call.url.endsWith('/git/mutations/confirmations'));
  assert.equal((confirmationCall!.body as { operation: string; target: string }).operation, 'pull');
  assert.equal((confirmationCall!.body as { operation: string; target: string }).target, 'main');
  assert.match(wrapper.find('.git-mutation-success').text(), /Pull concluído no branch "main"/);
});

test('push exibe a mensagem de erro específica quando o remoto rejeita', async () => {
  const originalFetch = globalThis.fetch;
  const originalConfirm = globalThis.confirm;
  globalThis.confirm = () => true;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/git')) {
      return new Response(JSON.stringify({ git: baseOverview }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/git/diff')) {
      return new Response(JSON.stringify({ diff: { repository: true, scope: 'combined', files: [] } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/git/mutations/confirmations')) {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      return new Response(JSON.stringify({ confirmation: { token: 's'.repeat(64), operation: body.operation, target: body.target, expiresAt: new Date(Date.now() + 60_000).toISOString() } }), { status: 201, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/git/push')) {
      return new Response(JSON.stringify({ error: 'GIT_PUSH_REJECTED', message: 'O remoto tem commits que o branch local não possui; faça pull antes de enviar.' }), { status: 409, headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectGitPanel, { props: { project: makeProject() } });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
    globalThis.confirm = originalConfirm;
  };
  await flushPromises();
  await flushPromises();

  const buttons = wrapper.findAll('button');
  const pushButton = buttons.find((button) => button.text().includes('Push'));
  await pushButton!.trigger('click');
  await flushPromises();
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.find('.project-error').text(), /faça pull antes de enviar/);
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
