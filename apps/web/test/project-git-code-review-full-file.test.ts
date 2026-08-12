import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'vitest';

import { flushPromises, mount } from '@vue/test-utils';

import type {
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

import ProjectGitCodeReviewPage from '../src/components/ProjectGitCodeReviewPage.vue';

const jsonHeaders = { 'content-type': 'application/json' };
const originalFetch = globalThis.fetch;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  window.matchMedia = originalMatchMedia;
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: jsonHeaders,
  });
}

const overview: ProjectGitOverview = {
  repository: true,
  branch: 'feature/git-ui',
  detached: false,
  ahead: 1,
  behind: 0,
  clean: false,
  files: [],
  recentCommits: [],
};

const workspace: ProjectGitWorkspace = {
  branches: [
    {
      name: 'origin/main',
      shortName: 'main',
      kind: 'remote',
      current: false,
      remote: 'origin',
      ahead: 0,
      behind: 0,
    },
  ],
  remotes: [
    {
      name: 'origin',
      fetchUrl: 'git@github.com:felipe-urgal/projeto.git',
      pushUrl: 'git@github.com:felipe-urgal/projeto.git',
      role: 'origin',
    },
  ],
};

const diff = [
  'diff --git a/src/app.ts b/src/app.ts',
  'index 1111111..2222222 100644',
  '--- a/src/app.ts',
  '+++ b/src/app.ts',
  '@@ -1,2 +1,2 @@',
  '-const value = 1;',
  '+const value = 42;',
  ' export { value };',
].join('\n');

function mountPage(
  handler: (
    path: string,
    method: string,
  ) => Response | Promise<Response> | undefined,
) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const handled = await handler(url.pathname, init?.method ?? 'GET');
    if (handled) return handled;
    if (url.pathname.endsWith('/pull-request/ai-status')) {
      return jsonResponse({
        available: true,
        message: 'Ollama disponível.',
        models: [{ name: 'qwen2.5-coder:14b', capabilities: ['chat'] }],
      });
    }
    if (url.pathname.endsWith('/ai-review-executions/latest')) {
      return jsonResponse({ execution: null });
    }
    if (url.pathname.endsWith('/pull-request/ai-review-files')) {
      return jsonResponse({
        review: {
          targetRemote: 'origin',
          baseBranch: 'main',
          sourceBranch: 'feature/git-ui',
          files: ['src/app.ts'],
        },
      });
    }
    return jsonResponse({ execution: null });
  }) as typeof fetch;

  return mount(ProjectGitCodeReviewPage, {
    props: { projectId: 'p1', overview, workspace },
  });
}

test('alterna para o arquivo completo e destaca a linha alterada', async () => {
  const wrapper = mountPage((path) => {
    if (path.endsWith('/pull-request/ai-review-executions')) {
      return jsonResponse({
        execution: {
          id: 'review-1',
          targetRemote: 'origin',
          baseBranch: 'main',
          sourceBranch: 'feature/git-ui',
          files: ['src/app.ts'],
          model: 'qwen2.5-coder:14b',
          provider: 'ollama',
          mode: 'fast',
          status: 'completed',
          completedFileCount: 1,
          failedFiles: [],
          startedAt: '2026-08-11T13:00:00.000Z',
          finishedAt: '2026-08-11T13:00:01.000Z',
          review: {
            targetRemote: 'origin',
            baseBranch: 'main',
            sourceBranch: 'feature/git-ui',
            files: ['src/app.ts'],
            model: 'qwen2.5-coder:14b',
            reviewedAt: '2026-08-11T13:00:00.000Z',
            summary: 'Sem problemas relevantes.',
            findings: [
              {
                severity: 'suggestion',
                path: 'src/app.ts',
                line: 1,
                title: 'Nomeie melhor a constante',
                explanation: 'O nome não é descritivo.',
                recommendation: 'Renomeie para algo mais claro.',
              },
            ],
            diffTruncated: false,
            masked: false,
            redactionCount: 0,
          },
        },
      });
    }
    if (path.endsWith('/pull-request/ai-review-file-diff')) {
      return jsonResponse({
        review: {
          targetRemote: 'origin',
          baseBranch: 'main',
          sourceBranch: 'feature/git-ui',
          files: ['src/app.ts'],
          diff,
        },
      });
    }
    if (path.endsWith('/files/content')) {
      return jsonResponse({
        path: 'src/app.ts',
        name: 'app.ts',
        language: 'typescript',
        content: 'const value = 42;\nexport { value };\n',
        version: 'v1',
        size: 40,
        modifiedAt: '2026-08-11T13:00:00.000Z',
        writable: true,
      });
    }
    return undefined;
  });
  await flushPromises();

  await wrapper.find('.git-code-review-controls button').trigger('click');
  await flushPromises();

  assert.match(wrapper.text(), /Sem problemas relevantes/);
  assert.match(wrapper.text(), /Diff/);
  assert.match(wrapper.text(), /Arquivo completo/);

  const fullFileButton = wrapper
    .findAll('.git-code-review-file-mode-toggle button')
    .find((button) => button.text() === 'Arquivo completo');
  assert.ok(fullFileButton);
  await fullFileButton.trigger('click');
  await flushPromises();

  const rows = wrapper.findAll('.git-full-file-row');
  assert.equal(rows.length, 2);
  const changedRow = rows.find((row) => row.classes('is-changed'));
  assert.match(changedRow?.text() ?? '', /const value = 42;/);

  const diffButton = wrapper
    .findAll('.git-code-review-file-mode-toggle button')
    .find((button) => button.text() === 'Diff');
  assert.ok(diffButton);
  await diffButton.trigger('click');
  await flushPromises();

  assert.equal(wrapper.find('.git-full-file-row').exists(), false);
  assert.ok(wrapper.find('.git-diff-unified, .git-diff-split').exists());

  wrapper.unmount();
});

test('mostra erro com opção de voltar ao diff quando o arquivo completo falha', async () => {
  const wrapper = mountPage((path) => {
    if (path.endsWith('/pull-request/ai-review-executions')) {
      return jsonResponse({
        execution: {
          id: 'review-2',
          targetRemote: 'origin',
          baseBranch: 'main',
          sourceBranch: 'feature/git-ui',
          files: ['src/app.ts'],
          model: 'qwen2.5-coder:14b',
          provider: 'ollama',
          mode: 'fast',
          status: 'completed',
          completedFileCount: 1,
          failedFiles: [],
          startedAt: '2026-08-11T13:00:00.000Z',
          finishedAt: '2026-08-11T13:00:01.000Z',
          review: {
            targetRemote: 'origin',
            baseBranch: 'main',
            sourceBranch: 'feature/git-ui',
            files: ['src/app.ts'],
            model: 'qwen2.5-coder:14b',
            reviewedAt: '2026-08-11T13:00:00.000Z',
            summary: 'Arquivo removido.',
            findings: [
              {
                severity: 'suggestion',
                path: 'src/app.ts',
                line: 1,
                title: 'Nomeie melhor a constante',
                explanation: 'O nome não é descritivo.',
                recommendation: 'Renomeie para algo mais claro.',
              },
            ],
            diffTruncated: false,
            masked: false,
            redactionCount: 0,
          },
        },
      });
    }
    if (path.endsWith('/pull-request/ai-review-file-diff')) {
      return jsonResponse({
        review: {
          targetRemote: 'origin',
          baseBranch: 'main',
          sourceBranch: 'feature/git-ui',
          files: ['src/app.ts'],
          diff,
        },
      });
    }
    if (path.endsWith('/files/content')) {
      return jsonResponse({ message: 'Arquivo não encontrado.' }, 404);
    }
    return undefined;
  });
  await flushPromises();

  await wrapper.find('.git-code-review-controls button').trigger('click');
  await flushPromises();

  const fullFileButton = wrapper
    .findAll('.git-code-review-file-mode-toggle button')
    .find((button) => button.text() === 'Arquivo completo');
  assert.ok(fullFileButton);
  await fullFileButton.trigger('click');
  await flushPromises();

  assert.match(wrapper.text(), /Arquivo não encontrado/);
  const backToDiff = wrapper
    .findAll('.git-code-review-diff-empty button')
    .find((button) => button.text() === 'Ver diff');
  assert.ok(backToDiff);

  await backToDiff.trigger('click');
  await flushPromises();
  assert.ok(wrapper.find('.git-diff-unified, .git-diff-split').exists());

  wrapper.unmount();
});
